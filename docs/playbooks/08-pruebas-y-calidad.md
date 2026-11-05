# 08 — Pruebas y calidad

> **Estado: 🟡 parte automática completa** (las 7 pruebas imprescindibles existen, fallan sin su arreglo y corren en
> CI; ver el mapa abajo). **Queda lo manual**, que necesita el staging publicado (07) o la API real: el checklist de
> release y `npm run api:verify`. Es continuo: cada playbook o bug nuevo añade aquí sus pruebas.

**Objetivo:** estrategia de pruebas proporcional a un sitio estático con una sola interacción crítica (cotizar),
más un checklist de release repetible. Es transversal: cada playbook añade sus pruebas aquí.

## Pirámide

| Nivel | Herramienta | Qué cubre | Cuándo corre |
|---|---|---|---|
| Tipos | `astro check` (TypeScript strict) | Contratos entre capas | Cada PR |
| Unitarias | Vitest | Cliente de API, esquemas zod, mappers, slugs, `buildQuotePayload`, validadores, i18n (claves faltantes) | Cada PR |
| Contrato | Vitest + fixtures sanitizadas | Formas de respuesta: éxito, `message: null`, 403, 500, `chargeType` string | Cada PR |
| Integración de build | Script | Snapshot válido, rutas generadas, imágenes sin 404, sin datos fiscales en `dist/` | Cada PR y cada deploy |
| `.htaccess` | Vitest + Apache 2.4 real (`npm run test:apache`) | Sintaxis, https, 301, caché, CSP en Chromium, `deploy:verify` completo | Cada PR |
| E2E | Playwright (API simulada con `page.route`) | Navegación, es/en, lightbox, flujo completo de cotización | Cada PR |
| Accesibilidad | axe-core en Playwright | Todas las rutas | Cada PR |
| Rendimiento | Lighthouse CI | Presupuestos de 06 | Cada PR y antes del cutover |
| Humo en vivo | `curl` | 200 en portada, imagen y `.well-known` | Cada deploy |

Playwright y Chromium ya vienen preinstalados en el entorno de Claude Code en la nube (`require('playwright')`;
no ejecutar `playwright install`).

## Reglas

- Las pruebas automáticas **no llaman** a la API real (dev ni producción). Usan fixtures y simulación.
- La prueba de contrato contra la API real es `npm run api:verify` (playbook 02): **manual**, solo `GET` y un
  `OPTIONS` de preflight, nunca `POST`. Necesita un equipo con acceso a la API (el proxy de la nube la bloquea).
- Las fixtures se actualizan con `npm run api:verify -- --record`, que sanitiza (quita RFC, razón social, contacto
  y otros hoteles) antes de guardar en `tests/fixtures/recorded/`.
- Una prueba nueva debe **fallar** sin el arreglo que cubre (romper el código a propósito, verla fallar, restaurar).
- Cada bug de producción añade primero una prueba que lo reproduce.

## Pruebas imprescindibles de v1

1. `buildQuotePayload` no desplaza fechas con `TZ=UTC`, `America/Mexico_City` y `Pacific/Kiritimati`.
2. El snapshot rechaza: hotel ausente, 0 habitaciones activas, `status: "Error"`, `message: null`.
3. Ninguna ruta de `dist/` referencia una imagen que no exista; imagen 404 → placeholder.
4. `dist/` no contiene `rfc`, `regimenCFDI` ni `businessName`.
5. Formulario: validación por campo, error 500, timeout, doble clic, honeypot, éxito.
6. Cambio de idioma lleva a la ruta equivalente en cada página.
7. Redirecciones del sitio anterior (en staging, con `curl -I`).

### Dónde vive cada una (auditoría de esta etapa)

| # | Prueba | Archivo(s) | Hallazgo y cambio |
|---|---|---|---|
| 1 | Fechas sin desplazar con `TZ` distintas | `tests/unit/quote.test.ts` («fechas en cualquier zona horaria del proceso»), `tests/e2e/quote.spec.ts` («navegador en …») | El comentario decía que corría con otras `TZ`, pero nada lo hacía (CI y la nube están en UTC, donde el error típico **no** se ve). Ahora cada caso fija `process.env.TZ` (UTC, Ciudad de México, Kiritimati +14, Pago Pago −11) y el e2e usa `timezoneId` del navegador. Comprobado: con `toApiDate` en hora local fallan 3 zonas y los 2 e2e; con «hoy» del navegador falla Kiritimati. |
| 2 | Snapshot inservible se rechaza | `tests/unit/pipeline.test.ts` (`assertSnapshotSane`, política de fallo), `api-client.test.ts`, `mappers.test.ts` (`selectHotel`) | Ya cubierto: hotel ausente, 0 habitaciones activas, `status: "Error"`, `message: null`. |
| 3 | Sin imágenes rotas; 404 → placeholder | `pipeline.test.ts` (`checkDistImages`, imagen 404), `build-variants.test.ts`, `npm run images:check` en CI | Ya cubierto. |
| 4 | Sin datos fiscales en `dist/` | `tests/unit/deploy-checks.test.ts` (`findPrivateData`), `npm run dist:privacy` en CI, dentro de `deploy:check` | **Faltaba**: solo se revisaba el snapshot. Ahora se escanean los archivos de texto de `dist/` (campos `rfc`, `businessName`, `regimenCFDI`, `productOrServiceDefault`, un RFC con formato y «S.A. de C.V.»), sin copiar el valor al registro. |
| 5 | Formulario: validación, 500, timeout, doble clic, señuelo, éxito | `tests/e2e/quote.spec.ts`, `tests/unit/quote.test.ts` | Ya cubierto (además 403, sin JS, teclado y axe). |
| 6 | El cambio de idioma lleva a la ruta equivalente | `tests/e2e/pages.spec.ts`, `build-variants.test.ts` (con base `/nuevo/`) | Ya cubierto. |
| 7 | Redirecciones del sitio anterior | `tests/integration/apache.test.ts`, `deploy-checks.test.ts`, `npm run deploy:verify` | `deploy:verify` solo miraba `/roomTypes`: ahora comprueba **las 7** rutas de `src/lib/legacy.ts` y nombra las que fallan. Se ejecuta completo contra Apache real, y eso destapó que nuestro `.htaccess` se podía descargar si el hosting no trae la regla `.ht*` estándar: ahora se protege solo (ver 07). |

## Checklist de release (manual, en staging, antes de cada cutover o cambio mayor)

- [ ] Recorrido en móvil real (iOS Safari y Android Chrome) y en escritorio (Chrome, Safari, Firefox, Edge).
- [ ] Viewports 360, 768, 1280 sin desbordes ni texto cortado.
- [ ] Navegación completa solo con teclado; lector de pantalla en el formulario (VoiceOver o TalkBack).
- [ ] Contenido en español e inglés revisado por una persona del hotel (nombres, políticas, dirección).
- [ ] Teléfonos, correo y WhatsApp abren la acción correcta.
- [ ] Una cotización real de prueba llega al PMS con el hotel correcto (`hotelSelected`) y el día correcto.
- [ ] Lighthouse móvil dentro de presupuesto.
- [ ] Enlace de compartir (Open Graph) se ve bien en WhatsApp.
- [ ] Respaldo del sitio anterior hecho y rollback ensayado.
- [ ] Se anotaron los ids de registros de prueba para que backend los borre.
- [ ] `npm run deploy:verify -- https://<dominio>/nuevo/` sin errores **ni avisos** (los avisos dicen qué regla
      del `.htaccess` ignora el hosting y qué rutas antiguas no dan 301).
- [ ] `npm run api:verify` en un equipo con acceso a la API: todos los `✔` requeridos.

## Definición de terminado (por playbook)

Pasos marcados, criterios de aceptación ejecutados y verdes, pruebas nuevas incluidas, documentación actualizada
y commit con mensaje claro.
