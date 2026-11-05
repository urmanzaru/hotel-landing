# 02 — Capa de datos (API del PMS)

> **Estado: 🟡 código completo y probado con fixtures; falta el paso 1 (verificar el contrato contra la API real),
> que ejecuta el equipo con acceso a la API.**

**Objetivo:** un cliente de API tipado y validado, un `snapshot.json` público y seguro, y un pipeline de imágenes
tolerante a fallos. Todo en **build**; el navegador no consume esta capa.

**Prerrequisitos:** 01 completo (✅). En esta etapa se trabaja contra la API de dev
(`https://apihotel-dev.spinoff.website`) con `Origin: http://localhost:4202`, que ya están en
`clients/lacabana.config.ts`. La URL y el origen de producción se definen más adelante y solo cambian variables
de entorno.

## Endpoints que se usan en v1

| Endpoint                  | Uso                                         | Cuándo                      |
| ------------------------- | ------------------------------------------- | --------------------------- |
| `GET /hotel`              | Datos públicos del hotel, imágenes, políticas | Build                     |
| `GET /roomType`           | Tipos de habitación                         | Build                       |
| `GET /imagen/{id}`        | Binarios de imágenes                        | Build (descarga y optimiza) |
| `POST /receiveCotization` | Enviar cotización                           | Runtime (playbook 05)       |

`GET /roomType/{id}` **no se usa** (el listado ya trae la misma forma). `/card`, `/roomAvailable`, `/plan` y
`/tariff` quedan fuera; el código no los referencia.

## Entregables (hechos)

| Archivo                           | Responsabilidad                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/data/schemas.ts`             | Esquemas zod **tolerantes** de la respuesta cruda (`looseObject`, elementos inválidos de un arreglo se descartan). |
| `src/data/types.ts`               | Esquemas y tipos de la forma **pública** (`Snapshot`, `PublicHotel`, `PublicRoomType`, `ImageAsset`).              |
| `src/data/client.ts`              | `createApiClient`: `Origin` fijo, timeout 10 s, 3 reintentos con backoff solo en red/timeout/5xx, errores tipados. |
| `src/data/mappers.ts`             | Lista blanca de campos, normalización, selección por `HOTEL_ID`, slugs deterministas.                              |
| `src/data/images.ts`              | Descarga con caché, WebP + respaldo JPEG/PNG en varios anchos, 404 → reporte (no rompe el build).                  |
| `src/data/pipeline.ts`            | `runPipeline`: API → datos → imágenes → sanidad → archivo; respaldo con el último snapshot bueno.                  |
| `src/data/load.ts`                | `getSnapshot()` / `getImage()` para las páginas (no importa `sharp`).                                              |
| `src/data/check-images.ts`        | Verifica que el HTML de `dist/` no referencie imágenes inexistentes.                                               |
| `scripts/fetch-snapshot.ts`       | `npm run data:fetch`.                                                                                              |
| `scripts/verify-api-contract.ts`  | `npm run api:verify` (paso 1; solo `GET` y un `OPTIONS`, **nunca `POST`**).                                        |
| `scripts/check-images.ts`         | `npm run images:check`.                                                                                            |
| `tests/unit/*`, `tests/fixtures/` | 45 pruebas con fixtures sintéticas (ver `tests/fixtures/README.md`).                                               |

## Pasos

### 1. Verificar el contrato real — ⏳ lo ejecuta quien tenga acceso a la API

Desde un equipo que alcance `apihotel-dev.spinoff.website` (el entorno de Claude Code en la nube no lo alcanza):

```bash
npm ci
npm run api:verify                # verifica y muestra un resumen
npm run api:verify -- --record    # además guarda fixtures reales sanitizadas en tests/fixtures/recorded/
```

Lo que comprueba (✔ obligatorio, ⚠ informativo):

- ✔ `GET /hotel` sin `Origin` responde 200 con hoteles, y el `HOTEL_ID` existe.
- ✔ `GET /roomType` con `Origin: http://localhost:4202` responde 200 **desde Node** (confirma que Node puede fijar
  `Origin`) y los tipos pertenecen al hotel esperado.
- ✔ `GET /roomType` con un `Origin` no registrado responde 403 (confirma el modelo multi-tenant).
- ✔ El preflight `OPTIONS /receiveCotization` permite `Content-Type` (necesario para el `POST` JSON del 05).
- ⚠ Cabecera CORS y cuántas imágenes dan 404.

El resultado se pega de vuelta para ajustar esquemas si la realidad difiere de `api-endpoints.md`. Si el script
muestra `ENOTFOUND`, `ECONNREFUSED` o un error TLS, ese texto es la causa real (se extrae de `error.cause`).

### 2. Cliente de API — ✅

`Origin` configurable; **no** se envía `Empresa` (la API la ignora). `status` se trata como string
(`"Success"`/`"Error"`). 403 no se reintenta; 5xx, red y timeout sí. Probado contra un servidor HTTP local que
confirma que `Origin` llega al servidor.

### 3. Esquemas y normalización — ✅

- `chargeType` string (`"NOCHE"`, `"HORA"`) y numérico (1/2) → `'night' | 'hour'`.
- Textos sin traducción al inglés → se usa el español y se cuenta en `stats.englishFallbacks`.
- Coordenadas: **no se toman de la API** (valores inválidos); van en `clients/<cliente>.config.ts`.
- Los slugs de habitaciones con nombre repetido se desempatan **por id**, así no cambian si la API reordena la lista
  (hay una prueba que lo demuestra).

### 4. Selección del hotel y lista blanca — ✅

Se elige por `HOTEL_ID` exacto; si no existe, el build falla con los ids que sí devolvió la API. El snapshot se arma
campo por campo: RFC, razón social, régimen CFDI, producto por defecto, persona de contacto, latitud/longitud y
**cualquier otro hotel** no llegan al archivo (prueba explícita con datos fiscales en la fixture).

### 5. Pipeline de imágenes — ✅

- La clave de cada imagen es el **id del archivo** (último segmento de `urlImage`), que es el que coincide con los
  `*Selected` del PMS; el `id` del objeto imagen puede ser otro.
- Descarga con concurrencia 6 y caché en `.cache/images/`. Sin `Origin` (como un `<img>`; se confirma en el paso 1).
- WebP + respaldo (JPEG, o PNG si hay transparencia) en 480/768/1200/1920 px, sin ampliar, en `public/img/<id>/`.
- 404, error de red o archivo no decodificable → entra en `reports/broken-images.json` y la imagen se omite del
  snapshot; las entidades siguen refiriéndose a su id y la página usa un placeholder.
- Se dejó **AVIF fuera** respecto al plan original: multiplica el tiempo de build y WebP cubre >95 % de navegadores.
  Se puede añadir en `images.ts` si se mide que compensa.

### 6. Snapshot y política de fallo — ✅

- `snapshot.json` incluye `generatedAt`, `contentHash` (estable entre builds con los mismos datos) y estadísticas.
- Se acepta solo si hay: nombre de hotel, ≥1 tipo de habitación activo y ≥1 imagen disponible.
- Si la API falla **o** el resultado no pasa esa sanidad → se usa el último snapshot bueno (`.cache/`, que CI debe
  restaurar) y las imágenes se rehacen desde la caché sin red. Sin caché → `exit 1` y **no se escribe snapshot**.

## Criterios de aceptación

```bash
npm run verify              # tipos + lint + 45 pruebas + build
npm run data:fetch          # con acceso a la API: genera src/data/snapshot.json
npm run images:check        # tras `npm run build` con páginas que usen imágenes
```

- [x] El snapshot no contiene datos fiscales ni de otros hoteles (prueba automática).
- [x] Sin red y sin caché, `data:fetch` falla con mensaje claro y código ≠ 0.
- [x] Con caché, el build continúa con el último snapshot bueno.
- [x] Ninguna llamada a `/card`, `/roomAvailable`, `/plan`, `/tariff` en el código.
- [ ] **Pendiente:** `npm run api:verify` en verde contra la API de dev (paso 1) y `npm run data:fetch` con datos reales.

## Riesgos

- El `Origin` de CI/producción difiere del de dev → variable por entorno (`SITE_ORIGIN`), nunca hardcodeada.
- Imágenes originales muy pesadas → el pipeline reduce; vigilar el tiempo de build (objetivo < 3 min).
- Cambios de esquema en el PMS → los esquemas fallan ruidosamente en el build, no en producción.
- Una imagen reemplazada en el PMS **conservando el mismo id** no se re-descarga mientras exista en `.cache/images/`
  (el PMS genera un id nuevo al subir otra; si no, borrar la caché).
