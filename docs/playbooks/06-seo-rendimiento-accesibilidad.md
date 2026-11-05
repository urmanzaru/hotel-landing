# 06 — SEO, rendimiento y accesibilidad

> **Estado: 🟡 hecho y medido con datos de MUESTRA** (Lighthouse móvil 100/100/100/100 en las 6 URLs medidas). Falta
> lo que solo se puede hacer con datos reales y el sitio publicado: validar el JSON-LD con la prueba de resultados
> enriquecidos de Google, comprobar los 301 con `curl -I` (07) y el alta en Search Console (cliente).

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

- [x] `<title>` y `<meta name="description">` únicos por página y por idioma (patrón
      `{Página} · {Hotel} · Puerto Ángel, Oaxaca`). La descripción de cada habitación suma su capacidad
      («Hourly use · 2 adults · per hour») para no quedar demasiado corta.
- [x] URL canónica absoluta basada en `SITE_ORIGIN` (+ `BASE_PATH`); `hreflang` es/en/`x-default` recíprocos. Cada
      vista declara sus rutas por idioma (`paths` en `Page.astro`), y de ahí salen la canónica, los `hreflang` y el
      enlace de idioma.
- [x] Open Graph y Twitter Card con imagen 1200×630 generada en el build (`/og/site.jpg` desde la foto de portada y
      `/og/room-<slug>.jpg` por habitación con foto; sin fotos, el logo sobre el crema de la marca).
- [x] JSON-LD: `Hotel` en la portada (nombre, dirección, teléfono, correo, horarios de entrada/salida, fotos),
      `BreadcrumbList` en las páginas interiores y `HotelRoom` con ocupación en cada habitación. Sin reseñas ni precios,
      y **sin `geo`**: las coordenadas de la configuración son aproximadas (se añadirán cuando sean las exactas).
- [x] Sitemap y `robots.txt` **propios** (`src/pages/sitemap.xml.ts`, `robots.txt.ts`) en lugar de
      `@astrojs/sitemap`, que no relaciona las alternativas de idioma cuando los slugs se traducen (`/habitaciones/` ↔
      `/en/rooms/`). Sin `/design/`, la 404, las redirecciones ni páginas `noindex` (políticas vacías). Con datos de
      MUESTRA el sitemap sale vacío y `robots.txt` bloquea todo.
- [x] Una sola URL por contenido (`trailingSlash: 'always'`). Rutas del Angular anterior en `src/lib/legacy.ts`:
      `/hotel`→`/`, `/roomTypes`→`/habitaciones/`, `/locationBlog`→`/ubicacion/`, `/contactUS`→`/contacto/`,
      `/quotation` y `/selectRooms`→`/cotizar/`, `/pandemicInfo`→`/politicas/`. `htaccessRedirects(base)` genera las
      reglas `RedirectMatch 301` para el `.htaccess` (07); además cada ruta antigua tiene una página de respaldo
      (redirección inmediata + `canonical` + `noindex`) por si el `.htaccess` falta. *Supuesto*: `/selectRooms` era
      elegir habitaciones para cotizar y `/pandemicInfo`, condiciones de estancia; corregir si no.
- [ ] Alta en Google Search Console y Bing Webmaster y envío del sitemap *(tarea del cliente)*.

### Rendimiento

- [x] Imágenes con `srcset`/`sizes`, WebP + respaldo JPEG/PNG, `width/height`, `loading="lazy"` salvo el LCP
      (`fetchpriority="high"`), `decoding="async"` (desde 02/03). Sin AVIF: con WebP ya se cumplen los presupuestos.
- [x] CSS por página de Astro, sin frameworks CSS.
- [x] Fuentes autoalojadas, subconjunto latino. Se precargan **dos** (títulos y texto: ambas pintan en la primera
      vista); Lighthouse no lo penaliza.
- [x] Cero JS en páginas sin interacción; el visor solo donde hay galería y el formulario solo en cotización
      (probado sobre `dist/`).
- [ ] Caché de largo plazo para `/_astro/*` y revalidación corta del HTML → `.htaccess` del playbook 07.
- [x] Sin terceros en la carga inicial (probado: ninguna petición fuera del propio dominio, ninguna cookie).
- [x] Favicon e icono de iOS generados desde el logo (`npm run brand:assets`).

### Accesibilidad (WCAG 2.2 AA)

- [x] Estructura: un `<h1>` por página, jerarquía sin saltos, landmarks únicos con nombre, «Saltar al contenido».
- [x] Foco visible; orden lógico; visor con foco atrapado y retorno de foco (03).
- [x] Contraste verificado (03); los errores llevan icono y texto, no solo color.
- [x] `alt` en todas las imágenes; `alt=""` en las decorativas.
- [x] Formularios: etiquetas visibles, errores asociados, `autocomplete`, objetivos ≥ 44 px (05).
- [x] `prefers-reduced-motion`; reflow a 320 px (zoom 400 %) y espaciado de texto ampliado (1.4.12) sin desbordes.
- [x] `lang` correcto: el mapper ya **no copia** el español en `en` cuando falta la traducción; `pick()` hace el
      respaldo y `langFor()` marca esos fragmentos con `lang="es"` en las páginas en inglés (nombres y descripciones de
      habitaciones, categoría y descripción del hotel, políticas, texto alternativo de la portada). El enlace de idioma
      marca solo «English» con `lang="en"`. Los nombres propios (el del hotel) no lo necesitan.

### Privacidad

- [x] Sin cookies propias ni de terceros → no hace falta banner (probado en todas las páginas).

## Criterios de aceptación

```bash
npm run verify                                  # incluye 3 builds de variantes (subcarpeta, vacío, datos reales)
npm run test:e2e                                # 189 pruebas: seo.spec.ts, a11y.spec.ts, pages.spec.ts…
CHROME_PATH=/opt/pw-browsers/chromium npm run lhci   # en la nube; en CI/tu equipo basta `npm run lhci`
```

- [x] Lighthouse móvil (mediana de 3 corridas, 6 URLs): Performance 100, Accesibilidad 100, Buenas prácticas 100,
      SEO 100 (sin `is-crawlable`, ver `lighthouserc.cjs`). LCP ≈ 1,5 s, CLS 0, TBT 0 ms. JS de la portada ≤ 20 KB,
      peso de la portada ≤ 1 MB (probados en e2e). *Medido con las ilustraciones de muestra: repetir con fotos reales.*
- [x] Axe sin violaciones en todas las rutas (`pages.spec.ts`) + estructura, reflow y espaciado (`a11y.spec.ts`).
- [x] Sin enlaces internos rotos: el verificador de enlaces de `pages.spec.ts` (no hizo falta `linkinator`).
- [ ] Validador de JSON-LD y prueba de resultados enriquecidos de Google sin errores *(manual, con el sitio publicado)*.
- [ ] Todas las URLs del sitio anterior responden 301 a su equivalente *(probar con `curl -I` tras el 07)*.

## Riesgos

- Lighthouse en CI varía entre ejecuciones → promediar 3 corridas y fijar umbrales con margen.
- Imágenes de baja calidad en el PMS limitan el LCP/estética → avisar al cliente qué fotos reemplazar.
