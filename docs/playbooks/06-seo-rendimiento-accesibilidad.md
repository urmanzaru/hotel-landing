# 06 — SEO, rendimiento y accesibilidad

**Objetivo:** que el sitio se encuentre bien, cargue rápido en celular con red mala y sea usable por todos.

**Prerrequisitos:** 04 y 05 completos (con contenido real en el snapshot).

## Presupuestos (se verifican en CI, ver 07)

| Métrica | Meta |
|---|---|
| LCP (móvil, 4G lento) | ≤ 2.5 s |
| CLS | ≤ 0.1 |
| INP | ≤ 200 ms |
| JS total en portada | ≤ 20 KB gzip |
| Peso de portada (HTML + CSS + fuentes + imágenes visibles) | ≤ 1 MB |
| Lighthouse móvil: Performance / Accesibilidad / Buenas prácticas / SEO | ≥ 90 / ≥ 95 / ≥ 95 / ≥ 95 |

## Pasos

### SEO técnico

- [ ] `<title>` y `<meta name="description">` únicos por página y por idioma (patrón:
      `{Página} · {Hotel} · Puerto Ángel, Oaxaca`).
- [ ] URL canónica absoluta basada en `SITE_ORIGIN`; `hreflang` es/en/`x-default`.
- [ ] Open Graph y Twitter Card con imagen 1200×630 generada en el build desde el hero.
- [ ] Datos estructurados JSON-LD: `Hotel`/`LodgingBusiness` (nombre, dirección, teléfono, correo, horarios de
      entrada/salida, imágenes) y `BreadcrumbList`; en habitaciones, `HotelRoom` con ocupación. No marcar
      reseñas ni precios que no tengamos.
- [ ] `@astrojs/sitemap` con alternates de idioma; `robots.txt` que apunte al sitemap; excluir `/design`.
- [ ] Una sola URL por contenido (`trailingSlash: 'always'`); redirecciones 301 desde las rutas del Angular
      anterior (`/hotel`, `/roomTypes`, `/locationBlog`, `/contactUS`, `/quotation`, `/selectRooms`,
      `/pandemicInfo`) hacia las nuevas, vía `.htaccess` (ver 07). Importante para no perder posicionamiento.
- [ ] Alta en Google Search Console y Bing Webmaster y envío del sitemap *(tarea del cliente)*.

### Rendimiento

- [ ] Imágenes con `srcset`/`sizes`, AVIF/WebP + fallback, `width/height`, `loading="lazy"` salvo el LCP
      (`fetchpriority="high"`, sin lazy), `decoding="async"`.
- [ ] CSS crítico en línea (Astro lo hace por página), sin frameworks CSS que no se purguen.
- [ ] Fuentes autoalojadas, subconjunto latino, una precarga.
- [ ] Cero JS en páginas sin interacción; el lightbox y el formulario se cargan solo donde se usan.
- [ ] Caché de largo plazo para `/_astro/*` (nombres con hash) y revalidación corta del HTML (ver `.htaccess` en 07).
- [ ] Sin terceros en la carga inicial (mapas e incrustaciones diferidos hasta interacción).

### Accesibilidad (WCAG 2.2 AA)

- [ ] Estructura: un `<h1>` por página, jerarquía sin saltos, landmarks (`header`, `nav`, `main`, `footer`),
      enlace "Saltar al contenido".
- [ ] Foco visible en todo; orden de tabulación lógico; lightbox con foco atrapado y retorno de foco.
- [ ] Contraste verificado (03); no comunicar estado solo con color.
- [ ] `alt` útil en imágenes con contenido (nombre de la habitación o la vista) y `alt=""` en decorativas.
- [ ] Formularios: etiquetas visibles, errores asociados, `autocomplete` correcto, objetivos táctiles ≥ 44 px.
- [ ] Respeto de `prefers-reduced-motion`; zoom al 200 % y texto ampliado sin pérdida de contenido.
- [ ] Idioma correcto en `<html lang>` y en fragmentos en otro idioma.

### Privacidad

- [ ] Sin cookies propias ni de terceros → no se necesita banner. Si el cliente pide analítica, usar una opción
      sin cookies (Plausible/Umami) y documentar en 09.

## Criterios de aceptación

```bash
npm run build
npx lhci autorun                              # presupuestos de arriba, móvil y escritorio
npm run test:e2e -- tests/e2e/a11y.spec.ts    # axe-core en todas las rutas
npx linkinator ./dist --recurse --skip "^https?://(?!localhost)"   # sin enlaces internos rotos
```

- Validador de JSON-LD y la prueba de resultados enriquecidos de Google sin errores *(manual, con el sitio en staging)*.
- Todas las URLs del sitio anterior responden 301 a su equivalente *(probar con `curl -I` en staging)*.

## Riesgos

- Lighthouse en CI varía entre ejecuciones → promediar 3 corridas y fijar umbrales con margen.
- Imágenes de baja calidad en el PMS limitan el LCP/estética → avisar al cliente qué fotos reemplazar.
