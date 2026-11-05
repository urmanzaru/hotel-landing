# Peticiones al backend del PMS

Sección C del [playbook 09](../playbooks/09-operacion-y-nuevos-clientes.md), en formato de ticket: listo para
copiar al gestor que use el equipo del backend. Ordenadas por prioridad. Lo observado sale del levantamiento de la API
de **dev** (`https://apihotel-dev.spinoff.website`) hecho al inicio del proyecto (playbooks 00, 02 y 05).

Convenciones de los ejemplos:

```bash
API=https://apihotel-dev.spinoff.website
```

- `ORIGEN` = la `url` registrada del hotel (en dev, `http://localhost:4202` para La Cabaña).
- Los ejemplos con **`POST` crean registros**: ejecutarlos solo en dev y borrar después lo creado.

---

## 1. `GET /hotel` expone los datos fiscales de todos los hoteles — **urgente (privacidad)**

**Observado:** sin cabecera `Origin` (o con cualquiera), la respuesta trae **los 4 hoteles** con RFC, razón social,
régimen fiscal, correos y teléfonos de contacto internos.

```bash
curl -s "$API/hotel" | head -c 600
```

**Esperado:** responder solo el hotel cuyo `url` coincide con el `Origin` (403 si ninguno), y sin campos fiscales ni
de contacto interno en la respuesta pública (`rfc`, `businessName`, `regimenCFDI`, `productOrServiceDefault*`,
`contact`).

**Impacto:** cualquiera puede descargar los datos fiscales de todos los clientes del PMS. El sitio ya los descarta
(y lo comprueba en cada build), pero la fuga está en la API.

## 2. `POST /receiveCotization` no valida, guarda una hora fija y no limita la tasa — **alta**

**Observado:**

1. `POST {}` responde **200** y crea un registro **vacío**.
2. Las fechas se guardan siempre con la hora `15:04:05`: es el *layout* de referencia de `time.Format` de Go usado
   como valor.
3. Un JSON mal formado responde **404** (debería ser 400).
4. No hay límite de peticiones: el `Origin` se falsifica fácil fuera del navegador.

```bash
# Crea un registro vacío (solo en dev; anotar el id que devuelve y borrarlo)
curl -s -X POST "$API/receiveCotization" -H "Origin: $ORIGEN" -H "Content-Type: application/json" -d '{}'
```

```bash
# JSON inválido → 404 en lugar de 400 (no crea nada)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/receiveCotization" -H "Origin: $ORIGEN" \
  -H "Content-Type: application/json" -d '{'
```

**Esperado:** 400 con la lista de campos inválidos (contrato en el
[playbook 05](../playbooks/05-cotizacion.md), sección «Contrato»: fechas obligatorias, `checkout >
checkin`, `adults` 1–10, edades 0–17, `name` y `email` obligatorios…); guardar la fecha tal como llega
(`YYYY-MM-DDT00:00:00.000Z`) o solo el día; límite por IP (p. ej. 10 por hora).

## 3. Webhook de publicación al cambiar datos del sitio — **media** (reemplaza la espera de hasta 6 h)

**Hoy:** el sitio se reconstruye cada 6 h. Un cambio en el PMS (foto, descripción, habitación) tarda hasta 6 h en
verse.

**Pedido:** al guardar cambios en el hotel, sus imágenes, políticas o tipos de habitación, llamar:

```bash
curl -s -X POST https://api.github.com/repos/urmanzaru/hotel-landing/dispatches \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d '{"event_type":"pms-content-updated","client_payload":{"client":"lacabana"}}'
```

- `TOKEN`: *fine-grained token* solo para este repositorio con permiso **Contents: Read and write** (lo exige
  GitHub para `dispatches`; no da acceso a nada más). Se guarda en el backend, nunca en el código.
- `client`: el slug del sitio del hotel (`lacabana`, …). Es opcional: sin él se reconstruyen todos.
- Responde **204** si se aceptó. El sitio ya lo escucha (`deploy.yml`, `repository_dispatch`).
- No hace falta agrupar los avisos: si llegan varios seguidos, el sitio ejecuta uno y deja en espera solo el último.

## 4. Coordenadas del hotel inválidas — **media**

**Observado:** `latitude: "-1811156.55"`, `longitude: "19.1561651"`: la latitud está fuera de rango y parecen
invertidas.

```bash
curl -s "$API/hotel" | grep -o '"latitude":"[^"]*","longitude":"[^"]*"'
```

**Esperado:** números decimales válidos (`latitude` entre −90 y 90), validados al guardar. Mientras tanto, el sitio
usa coordenadas manuales en `clients/<hotel>.config.ts`.

## 5. Imágenes que dan 404 y datos de prueba visibles — **media**

**Observado:** 16 imágenes referenciadas responden 404 en `GET /imagen/{id}`, entre ellas todos los fondos de
`/locationBlog` (`card?type=2`). En dev también hay registros de prueba visibles («ZZ PRUEBA PB-14…»).

```bash
# Lista de ids rotos que detecta el sitio (en un equipo con acceso a la API)
npm run data:fetch && cat reports/broken-images.json
```

**Esperado:** que el PMS no deje referencias a archivos inexistentes (o que las limpie al borrar la imagen) y quitar
los datos de prueba.

## 6. Códigos de estado coherentes — **baja**

**Observado:** un id inexistente responde **500** (debería ser 404); `chargeType` llega como texto (`"night"`)
mientras el front del PMS usa un enum numérico, y el sitio tiene que aceptar ambos.

```bash
# Por ejemplo, con un tipo de habitación que no existe (esperado 404)
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: $ORIGEN" "$API/roomType/000000000000000000000000"
```

**Esperado:** 404 para ids inexistentes; `status` siempre `"Success"`/`"Error"` (texto); `chargeType` con un
solo tipo en toda la API.

## 7. Disponibilidad pública (para una v2) — **decisión**

**Observado:** `/roomAvailable` responde 403 y `/plan` 401 desde el sitio.

**Pregunta:** ¿pueden ser públicos (identificando al hotel por `Origin`, solo lectura y sin datos de otros
huéspedes)? Es la condición para ofrecer «ver disponibilidad y tarifas» en lugar de solo cotizar.

## 8. Borrar las cotizaciones de prueba del levantamiento — **baja**

Ids `6aeadb410b5d2e0501f905ba` y `6aeadb9f0b5d2e0501f905bb` (dev), más las que se anoten en el checklist de release
del [playbook 08](../playbooks/08-pruebas-y-calidad.md) (nombre `PRUEBA …`).
