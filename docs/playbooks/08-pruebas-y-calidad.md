# 08 — Pruebas y calidad

**Objetivo:** estrategia de pruebas proporcional a un sitio estático con una sola interacción crítica (cotizar),
más un checklist de release repetible. Es transversal: cada playbook añade sus pruebas aquí.

## Pirámide

| Nivel | Herramienta | Qué cubre | Cuándo corre |
|---|---|---|---|
| Tipos | `astro check` (TypeScript strict) | Contratos entre capas | Cada PR |
| Unitarias | Vitest | Cliente de API, esquemas zod, mappers, slugs, `buildQuotePayload`, validadores, i18n (claves faltantes) | Cada PR |
| Contrato | Vitest + fixtures sanitizadas | Formas de respuesta: éxito, `message: null`, 403, 500, `chargeType` string | Cada PR |
| Integración de build | Script | Snapshot válido, rutas generadas, imágenes sin 404, sin datos fiscales en `dist/` | Cada PR y cada deploy |
| E2E | Playwright (API simulada con `page.route`) | Navegación, es/en, lightbox, flujo completo de cotización | Cada PR |
| Accesibilidad | axe-core en Playwright | Todas las rutas | Cada PR |
| Rendimiento | Lighthouse CI | Presupuestos de 06 | Cada PR y antes del cutover |
| Humo en vivo | `curl` | 200 en portada, imagen y `.well-known` | Cada deploy |

Playwright y Chromium ya vienen preinstalados en el entorno de Claude Code en la nube (`require('playwright')`;
no ejecutar `playwright install`).

## Reglas

- Las pruebas automáticas **no llaman** a la API real (dev ni producción). Usan fixtures y simulación.
- Una prueba de contrato contra la API real (`npm run test:contract`) existe pero es **manual** y solo hace
  `GET`, nunca `POST`.
- Las fixtures se actualizan con un script que sanitiza (quita RFC, razón social, otros hoteles) antes de
  guardarlas.
- Cada bug de producción añade primero una prueba que lo reproduce.

## Pruebas imprescindibles de v1

1. `buildQuotePayload` no desplaza fechas con `TZ=UTC`, `America/Mexico_City` y `Pacific/Kiritimati`.
2. El snapshot rechaza: hotel ausente, 0 habitaciones activas, `status: "Error"`, `message: null`.
3. Ninguna ruta de `dist/` referencia una imagen que no exista; imagen 404 → placeholder.
4. `dist/` no contiene `rfc`, `regimenCFDI` ni `businessName`.
5. Formulario: validación por campo, error 500, timeout, doble clic, honeypot, éxito.
6. Cambio de idioma lleva a la ruta equivalente en cada página.
7. Redirecciones del sitio anterior (en staging, con `curl -I`).

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

## Definición de terminado (por playbook)

Pasos marcados, criterios de aceptación ejecutados y verdes, pruebas nuevas incluidas, documentación actualizada
y commit con mensaje claro.
