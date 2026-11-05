# 02 — Capa de datos (API del PMS)

**Objetivo:** un cliente de API tipado y validado, un `snapshot.json` público y seguro, y un pipeline de imágenes
tolerante a fallos. Todo en **build**; el navegador no consume esta capa.

**Prerrequisitos:** 01 completo (✅). En esta etapa se trabaja contra la API de dev
(`https://apihotel-dev.spinoff.website`) con `Origin: http://localhost:4202`, que ya están en
`clients/lacabana.config.ts`. La URL y el origen de producción se definen más adelante y solo cambian variables
de entorno.

> **El paso 1 (verificar el contrato) necesita acceso real a la API.** El entorno de Claude Code en la nube no
> la alcanza (su proxy bloquea el host). Se ejecuta en tu equipo, o se añade `apihotel-dev.spinoff.website` a los
> hosts permitidos del entorno de la sesión.

## Entregables

- `src/data/client.ts`, `schemas.ts`, `mappers.ts`; `scripts/fetch-snapshot.ts`, `scripts/check-images.ts`.
- `src/data/snapshot.json` (generado, no versionado) y su tipo `Snapshot`.
- Fixtures **sanitizadas** en `tests/fixtures/` (sin RFC ni datos de otros hoteles).

## Endpoints que se usan en v1

| Endpoint | Uso | Cuándo |
|---|---|---|
| `GET /hotel` | Datos públicos del hotel, imágenes, políticas | Build |
| `GET /roomType` | Tipos de habitación activos | Build |
| `GET /imagen/{id}` | Binarios de imágenes | Build (descarga y optimiza) |
| `POST /receiveCotization` | Enviar cotización | Runtime (playbook 05) |

`GET /roomType/{id}` **no se usa**: el listado ya trae la misma forma y el detalle sería una llamada extra por
tipo. `/card`, `/roomAvailable`, `/plan` y `/tariff` quedan fuera.

## Pasos

### 1. Verificar el contrato real (spike de 15 min, desde una máquina con acceso)

- [ ] `curl -s "$PUBLIC_API_URL/hotel"` responde 200 sin `Origin` y trae los hoteles.
- [ ] `curl -s -H "Origin: $SITE_ORIGIN" "$PUBLIC_API_URL/roomType"` responde 200 con los tipos del hotel correcto.
- [ ] Mismo `curl` con un `Origin` no registrado → 403 (confirma el modelo multi-tenant).
- [ ] Confirmar que **Node puede fijar `Origin`**: un `fetch` de Node (undici) con `headers: { Origin }` debe
      devolver 200. Si el runtime lo ignorara, usar `undici.request` o `node:https`.
- [ ] Guardar las respuestas, sanitizadas, como fixtures.

### 2. Cliente de API

- [ ] `client.ts`: `apiGet(path)` con `Origin` desde la config, timeout (10 s), reintentos (3, backoff
      exponencial) solo en 5xx y red; no reintentar 4xx. **No enviar** `Empresa` (la API la ignora).
- [ ] Desenvolver `{ status, message }`: `status` es **string** (`"Success"`/`"Error"`), no number. Si `status`
      no es `"Success"` o `message` es `null` → error tipado.

### 3. Esquemas y normalización (zod, tolerantes)

- [ ] Esquemas con `.passthrough()` solo en el borde; el resto del sitio usa los tipos *normalizados*.
- [ ] `chargeType` llega como string (`"NOCHE"`), no como enum numérico → mapear a `'night' | 'hour'`.
- [ ] `politics` vacío → `[]`. `images` vacío → `[]`. Campos `en*` ausentes → caer al español y registrar aviso.
- [ ] Coordenadas: la API devuelve valores inválidos (`latitude "-1811156.55"`). Usar
      `clients/<cliente>.config.ts → coordinates` y no la API.

### 4. Selección del hotel y lista blanca

- [ ] Elegir el hotel por `HOTEL_ID` (config). Si no existe en la respuesta → fallar el build con mensaje claro.
      (El sitio actual elige por heurística de URL y en producción apunta al hotel equivocado, ver observación 5
      de `api-endpoints.md`.)
- [ ] Copiar al snapshot **solo**: nombres/categoría/descripción (es/en), logo, teléfonos, correo, dirección,
      horarios de entrada/salida, imágenes, políticas. **Nunca**: `rfc`, `businessName`, `regimenCFDI`,
      `productOrServiceDefault`, `*Selected`, otros hoteles.
- [ ] Tipos de habitación: filtrar `status === true`; ordenar por nombre o por orden definido; adultos, niños,
      descripción es/en, `photoMain` + `images`.

### 5. Pipeline de imágenes

- [ ] Reunir todos los `urlImage` del snapshot (relativos: `imagen/<id>`; anteponer la URL base si no empiezan
      con `http`).
- [ ] Descargar con concurrencia limitada (6), caché en `.cache/images/<id>` para no repetir en cada build.
- [ ] Respuesta 404 u otra no válida → registrar en `reports/broken-images.json`, marcar la imagen como
      ausente en el snapshot. Las páginas usan un placeholder de marca; **nunca** un `<img>` roto.
      (Hoy: 16 de 133 dan 404.)
- [ ] Generar AVIF/WebP y JPEG de fallback en anchos 480/768/1200/1920 con `sharp`; conservar `width/height`
      para evitar saltos de maquetación; generar `blurhash` o color dominante opcional.
- [ ] Respetar autoría: el API trae `author` y `linkCopyright`; mostrarlos donde corresponda (galería).

### 6. Snapshot y política de fallo

- [ ] `snapshot.json` incluye `generatedAt`, hash de contenido y estadísticas.
- [ ] Umbrales de sanidad antes de aceptar un snapshot: hotel presente, nombre no vacío, ≥1 tipo de habitación
      activo, ≥1 imagen válida. Si falla → usar el último snapshot bueno (caché de CI); si no hay → salir con
      código ≠ 0.
- [ ] `check-images.ts` verifica en `dist/` que ninguna ruta de imagen referenciada falta.

## Criterios de aceptación

```bash
npm run data:fetch                                   # genera snapshot.json
npx tsx -e "import s from './src/data/snapshot.json' assert {type:'json'}; console.log(Object.keys(s))"
! grep -riE '"rfc"|regimenCFDI|businessName' src/data/snapshot.json   # no hay datos fiscales
npm test                                             # unit con fixtures: éxito, 403, 500, message null, imagen 404
```

- El build sin red **y sin caché** falla con mensaje claro; con caché usa el snapshot anterior.
- Ninguna llamada a `/card`, `/roomAvailable`, `/plan`, `/tariff` en el código (`grep`).

## Riesgos

- El `Origin` de CI/producción difiere del de dev → variable por entorno, nunca hardcodeada.
- Imágenes originales muy pesadas → el pipeline reduce; vigilar el tiempo de build (objetivo < 3 min).
- Cambios de esquema en el PMS → los esquemas zod fallan ruidosamente en el build, no en producción.
