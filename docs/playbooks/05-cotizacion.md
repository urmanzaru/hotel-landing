# 05 — Cotización

> **Estado: 🟡 construido y probado con la API simulada; falta el humo manual contra la API real** (un envío
> `PRUEBA …` desde un equipo con acceso, ver *Pruebas*). Turnstile está implementado pero sin probar (no hay clave).

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

- [x] **Marcado sin JS**: `<form>` con campos nativos (`type="date"`, `type="email"`, `required`, `autocomplete`).
      Sin JS no puede enviar a la API (CORS/JSON): el botón sale **deshabilitado** en el HTML (la isla lo activa) y el
      `<noscript>` muestra teléfono, WhatsApp y correo. Los mismos contactos están siempre en el lateral.
- [x] **`src/islands/quote-form.ts`** (TypeScript vanilla, cargado solo en `/cotizar/` y `/en/quote/`; **4,3 KB gzip**):
      - Niños dinámicos: un selector de edad por niño (se clonan desde un `<template>` renderizado con `Field`).
      - Validación al salir del campo y al enviar; errores en línea con `aria-describedby`, `aria-invalid`,
        resumen de errores enfocado al fallar (cada enlace lleva al campo).
      - Lógica pura en `src/lib/quote.ts`: `validateQuote`, `buildQuotePayload(input, ctx)`, `parsePrefill`,
        `classifyResponse`, resumen. La isla solo lee el DOM y pinta estados.
      - `fetch` con `AbortController` (timeout 15 s), sin reintento automático.
      - Botón deshabilitado, `aria-busy` y texto «Enviando…» durante el envío (anti doble clic).
- [x] **Estados**: éxito (mensaje, resumen en `<dl>`, qué sigue; el formulario se limpia y se oculta, con «Hacer otra
      solicitud»), error de validación, error de red/timeout/5xx/200 sin `Success` («No pudimos enviar tu solicitud»,
      datos conservados, botones de WhatsApp/correo **precargados con el resumen** y de llamada), 403 (mismo mensaje
      genérico; el motivo va a la consola).
- [x] **Anti-spam**: campo señuelo `website` (fuera de pantalla, `tabindex="-1"`, `aria-hidden`) y tiempo mínimo de
      3 s desde la carga. Si saltan, **se finge el éxito y no se envía nada**. Turnstile por cliente:
      `clients/<slug>.config.ts → quote.turnstileSiteKey` (carga el script de Cloudflare y exige completarlo; el token
      NO se envía porque la API no lo verifica → solo frena bots que usan el navegador; ver 09).
- [x] **Privacidad**: casilla obligatoria (`Checkbox`) con texto de uso de datos y enlace a `/politicas/`.
- [x] **Precarga**: `?room=<slug>` (solo slugs existentes) y `?checkin=&checkout=` (fechas reales, desde hoy y
      coherentes); lo inválido se ignora.
- [x] **Sin cookies ni analítica** de terceros (Turnstile solo si se activa).
- [x] i18n completa (`quote.*` en `src/i18n/ui.ts`; a la isla solo llegan los textos del idioma de la página) y fechas
      del resumen con `Intl` en el idioma.

### Decisiones tomadas al construir

- **Selector «Habitación de interés»** (opcional) en vez de solo `?room=`: se precarga desde la URL y permite elegir
  sin venir de una ficha. Los comentarios llevan delante `Habitación de interés: <nombre en español>` y, si la página
  está en inglés, `Idioma del huésped: inglés` (lo lee el personal del hotel en el PMS).
- **Campos opcionales vacíos se envían como `""`** (forma estable del registro).
- **Hoy = zona del hotel** (`timeZone` del cliente); `min` de las fechas se fija en el navegador y la salida propone
  una noche al elegir la llegada.
- La página de cotización **ya no es `noindex`** (salvo con datos de muestra, como todas).
- Arreglos en componentes base: `Button` ignoraba `type="submit"` (siempre `button`); `Field` y `Checkbox` aceptan
  `liveError` (contenedor de error siempre presente para que el script lo rellene); `ErrorSummary` estiliza la lista
  creada por script.
- Bug encontrado por la prueba de teclado: al teclear el año, Chromium emite fechas como `0002-11-20` y `Date.UTC`
  convierte los años 0–99 en 19xx. `src/lib/quote.ts` usa `setUTCFullYear` y la isla solo actúa con fechas válidas.

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
npm test -- quote            # payload y validación (28 pruebas)
npm run test:e2e -- tests/e2e/quote.spec.ts   # 20 pruebas con la API simulada
TZ=Pacific/Kiritimati npm test -- quote   # y con TZ=America/Mexico_City: mismas fechas
```

- [x] Las pruebas pasan en `TZ=Pacific/Kiritimati`, `America/Mexico_City` y `Pacific/Pago_Pago`. Comprobado que la
      prueba de fechas **falla** con la conversión ingenua (`new Date(...).toISOString()`), y que las e2e de señuelo,
      timeout y doble clic fallan si se quita su protección.
- [x] JS de la página de cotización **4,3 KB gzip** (≤ 15 KB); el resto de las páginas no la carga.
- [ ] Un envío exitoso muestra confirmación en < 2 s con red normal (depende de la API real: humo manual).
- [x] Si la API cae, el huésped nunca pierde lo escrito y tiene un canal alterno visible.
- [x] Axe sin violaciones (inicial, con errores, con fallo y con éxito); todo el flujo se completa solo con teclado.

La e2e simula la API y además **aborta y hace fallar** cualquier petición a `receiveCotization` que la prueba no haya
simulado. El reloj se controla con `page.clock` (hoy = 5-nov-2026 en la zona del hotel).

## Riesgos

- Spam/abuso porque `Origin` se falsifica fuera del navegador y no hay rate limit → pedir a backend validación y
  límite por IP (09); mientras tanto honeypot + Turnstile opcional.
- Registros vacíos o con `hotelSelected: ""` si el `Origin` no está registrado → el humo manual lo detecta.
