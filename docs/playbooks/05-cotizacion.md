# 05 — Cotización

**Objetivo:** formulario de solicitud de cotización que envía `POST /receiveCotization` directamente desde el
navegador, con validación estricta en el cliente (la API no valida) y alternativas si el envío falla.

**Prerrequisitos:** 02 (config/API), 03 (componentes de formulario). Pregunta abierta 2 resuelta: en producción
el `Origin` del sitio debe estar registrado en el PMS o la API responderá 403.

## Contrato (según `api-endpoints.md`)

```
POST {PUBLIC_API_URL}/receiveCotization
Content-Type: application/json
```

| Campo | Tipo | Regla en el formulario |
|---|---|---|
| `checkin`, `checkout` | ISO-8601 UTC | Obligatorias; `checkout > checkin`; `checkin >= hoy` (zona del hotel) |
| `adults` | number | 1–10 |
| `children` | number[] (edades) | 0–10 niños; cada edad 0–17 |
| `rooms` | number | 1–10 |
| `roomsTogether` | boolean | Solo se muestra si `rooms > 1` |
| `name` | string | Obligatorio, 2–100 caracteres |
| `email` | string | Obligatorio, formato válido |
| `phone` | string | Opcional, 7–20 dígitos/`+ - ( )` |
| `address` | string | Opcional ("Ciudad y país") |
| `notes` | string | Opcional, ≤ 1000 caracteres; se antepone el tipo de habitación si viene de `?room=` |

Respuesta: `{ "status": "Success", "message": { id, ... } }`. Éxito = HTTP 200 **y** `status === "Success"`.

## Hallazgos del backend que condicionan el diseño

- **No valida nada**: `POST {}` devuelve 200 y crea un registro vacío → toda la validación va en el cliente.
- **Hora guardada siempre `15:04:05`** y día conservado → enviar `YYYY-MM-DDT00:00:00.000Z` construido **desde
  las cadenas `YYYY-MM-DD` del input**, sin pasar por `Date` local (el sitio actual desplaza fechas con
  `shiftDates` y muta el objeto original). Así el día guardado coincide con el elegido.
- JSON mal formado devuelve **404**, no 400; errores de servidor devuelven 500 → tratar cualquier no-200 como
  fallo recuperable.
- La cabecera `Empresa` no hace falta (la API la ignora); el tenant sale del `Origin` que añade el navegador.
- CORS permite `Content-Type`: el `POST` JSON hace preflight y debe pasar. Verificar en 02/spike.

## Pasos

- [ ] **Marcado sin JS**: `<form>` con campos nativos (`type="date"`, `type="email"`, `required`, `autocomplete`).
      Sin JS no puede enviar a la API (CORS/JSON), por lo que el `<noscript>` muestra teléfono, WhatsApp y correo.
- [ ] **`src/islands/quote-form.ts`** (TypeScript vanilla, cargado solo en `/cotizar/`):
      - Niños dinámicos: campo de edad por niño.
      - Validación al salir del campo y al enviar; errores en línea con `aria-describedby`, `aria-invalid`,
        resumen de errores enfocado al fallar.
      - Construcción del payload en una función **pura** `buildQuotePayload(form)` (fácil de probar).
      - `fetch` con `AbortController` (timeout 15 s), sin reintento automático (el endpoint no es idempotente
        y duplicaría registros).
      - Botón deshabilitado y `aria-busy` durante el envío (anti doble clic).
- [ ] **Estados**: éxito (mensaje "Solicitud enviada", resumen, qué sigue, y se limpia el formulario),
      error de validación, error de red/timeout/5xx ("No pudimos enviarla" + conservar los datos + botones de
      WhatsApp/correo/teléfono precargados con el resumen), 403 (mensaje genérico; registrar en consola el motivo).
- [ ] **Anti-spam** (la API no limita): campo señuelo (*honeypot*) oculto, tiempo mínimo desde la carga
      (≥ 3 s), y bandera para activar Cloudflare Turnstile por cliente si el spam se vuelve un problema.
- [ ] **Privacidad**: casilla de aceptación con enlace a `/politicas/`; texto que explica el uso de los datos.
- [ ] **Precarga**: `?room=<slug>` y fechas por query (`?checkin=&checkout=`), validadas antes de usarse.
- [ ] **Sin cookies ni analítica** de terceros en el formulario.
- [ ] i18n completa (etiquetas, errores, mensajes) y formato de fecha local.

## Pruebas

- **Unitarias (Vitest)**: `buildQuotePayload` (fechas sin desplazamiento: `2026-11-20` → `2026-11-20T00:00:00.000Z`
  en cualquier `TZ`), validadores, límites de campos, niños/edades.
- **E2E (Playwright)** con la API **simulada** (`page.route`): éxito, 500, timeout, 403, doble clic, honeypot,
  teclado completo, lector de pantalla (roles/nombres).
- **Nunca** disparar las pruebas automáticas contra la API de dev: el levantamiento anterior dejó registros de
  prueba en `apihotel-dev` que alguien debe borrar (`6aeadb410b5d2e0501f905ba`, `6aeadb9f0b5d2e0501f905bb`).
- **Humo manual (una vez por entorno)**: 1 envío real con nombre `PRUEBA ...` y se anota el `id` devuelto para
  que lo borren.

## Criterios de aceptación

```bash
npm test -- quote            # payload y validación
npm run test:e2e -- tests/e2e/quote.spec.ts
TZ=Pacific/Kiritimati npm test -- quote   # y con TZ=America/Mexico_City: mismas fechas
```

- JS de la página de cotización ≤ 15 KB gzip; el resto de las páginas, 0 KB propio salvo menú/lightbox.
- Un envío exitoso muestra confirmación en < 2 s con red normal.
- Si la API cae, el huésped nunca pierde lo escrito y tiene un canal alterno visible.
- Axe sin violaciones; todo el flujo se completa solo con teclado.

## Riesgos

- Spam/abuso porque `Origin` se falsifica fuera del navegador y no hay rate limit → pedir a backend validación y
  límite por IP (09); mientras tanto honeypot + Turnstile opcional.
- Registros vacíos o con `hotelSelected: ""` si el `Origin` no está registrado → el humo manual lo detecta.
