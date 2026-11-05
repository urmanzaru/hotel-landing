# 04 — Páginas y contenido

> **Estado: 🟡 construido y probado con datos de MUESTRA; falta verlo con datos reales del PMS** (`npm run data:fetch`
> en un equipo con acceso a la API). Mientras tanto, cada página lleva `noindex` y el despliegue está bloqueado
> (`npm run data:assert-live`).

**Objetivo:** construir las páginas de v1 con datos del snapshot, en español e inglés.

**Prerrequisitos:** 02 (snapshot) y 03 (componentes base).

## Cómo se trabaja sin la API

`npm run dev` y `npm run build` ejecutan antes `scripts/ensure-snapshot.ts`: si no hay `src/data/snapshot.json`, genera
uno de **muestra** a partir de `tests/fixtures/api/` con ilustraciones de `src/assets/design-sample/`
(`npm run data:fixture` lo regenera a mano). Ese snapshot lleva `dataSource: "fixture"` y tiene tres protecciones:

| Protección | Dónde |
| --- | --- |
| Todas las páginas salen con `<meta name="robots" content="noindex">` | `layouts/Page.astro` |
| `npm run data:assert-live` falla si el snapshot no es real (se ejecuta en el despliegue, ver 07) | `scripts/assert-live-data.ts` |
| Un snapshot de muestra **nunca** sirve de «último snapshot bueno» si la API falla | `src/data/pipeline.ts` |

Al ejecutar `npm run data:fetch` con la API real, el snapshot se reemplaza y las imágenes de muestra se eliminan de
`public/img/` (poda de huérfanas).

## Mapa del sitio (todo hecho)

| Ruta (es) | Ruta (en) | Contenido | Vista |
| --- | --- | --- | --- |
| `/` | `/en/` | Hero con foto en arco, habitaciones destacadas (3), tira de galería (4), ubicación, CTA final | `HomeView` |
| `/habitaciones/` | `/en/rooms/` | Lista de tipos de habitación activos | `RoomsView` |
| `/habitaciones/[slug]/` | `/en/rooms/[slug]/` | Detalle: descripción, CTA a cotizar con `?room=`, fotos | `RoomView` |
| `/galeria/` | `/en/gallery/` | Fotos del hotel y las habitaciones, con visor y créditos | `GalleryView` |
| `/ubicacion/` | `/en/location/` | Dirección, enlaces a mapas, horarios | `LocationView` |
| `/contacto/` | `/en/contact/` | Teléfonos, WhatsApp (si hay), correo, horarios | `ContactView` |
| `/cotizar/` | `/en/quote/` | Formulario de cotización (playbook 05), sin barra fija | `QuoteView` |
| `/politicas/` | `/en/policies/` | Una sección por política activa | `PoliciesView` |
| `/404.html` | — | Bilingüe, con salidas útiles | `pages/404.astro` |

Cada ruta es un archivo fino que fija el idioma y delega en la vista; así hay **una sola plantilla** por página. Los
slugs de habitación son iguales en ambos idiomas, y el enlace de idioma del detalle lleva a **esa misma habitación**.

## Decisiones de contenido

- **Sin portadas.** El hero usa la primera foto del hotel; si no hay, la de la primera habitación con foto; si no hay
  ninguna, el placeholder de marca (arco con olas).
- **Los textos del PMS mandan** (nombre, categoría, descripciones, políticas); el inglés cae al español si falta.
  Los textos fijos viven en `src/i18n/ui.ts` (es/en con las mismas claves, probado).
- **Texto del PMS = texto plano.** `toPlainText` elimina etiquetas y `<script>`/`<style>`, y decodifica entidades
  (`&eacute;`, `&ntilde;`, `&#225;`…); luego Astro lo escapa al pintarlo. Probado contra HTML hostil.
- **Capacidad con plurales correctos**: «1 adulto · 1 niño», «4 adultos · 2 niños»; los niños se omiten si son 0.
- **Sin precios** (el PMS no los publica en estos endpoints): el CTA es «Solicitar cotización».
- **Créditos de fotografía**: se listan en la galería; solo se enlazan URLs `http(s)`.
- **Datos fiscales**: no se muestran ni llegan a `dist/`.
- **Ubicación**: enlaces a Google Maps y OpenStreetMap con las coordenadas de `clients/<slug>.config.ts` (la API las
  devuelve inválidas). **Sin mapa incrustado** en v1: evita terceros y cookies. Las coordenadas actuales son
  aproximadas (centro de Puerto Ángel): hay que poner las exactas del hotel.
- **Texto alternativo**: viene del nombre de la imagen en el PMS (solo en español); en inglés se mantiene en español.

## Pasos

- [x] `src/i18n/ui.ts`: textos de interfaz y de páginas en es/en, con interpolación y plurales.
- [x] `Base.astro` (shell) y `Page.astro` (snapshot, título, descripción, `noindex` si es muestra).
- [x] Rutas dinámicas de detalle con `getStaticPaths()` desde el snapshot.
- [x] Portada, habitaciones, detalle, galería, ubicación, contacto, políticas, cotización provisional y 404.
- [x] Enlaces y recursos con `url()` / `routeUrl()` / `roomUrl()`; `BASE_PATH` soportado (`astro.config.ts`).
- [x] Estados vacíos: sin habitaciones, fotos, políticas o contacto.
- [x] Imagen principal con `fetchpriority="high"`; el resto `loading="lazy"`.
- [ ] Revisión con datos reales del PMS (textos largos, nombres raros, imágenes 404, políticas con HTML).

## Verificación (criterios de aceptación)

```bash
npm run verify        # tipos + lint + 156 pruebas unitarias + build
npm run test:e2e      # 82 pruebas contra el sitio construido
```

- [x] Las 9 rutas × 2 idiomas + 4 detalles × 2 devuelven 200 con un solo `<h1>`, `lang` y título correctos.
- [x] axe WCAG 2.2 AA sin violaciones en todas las páginas.
- [x] Ninguna `<img>` sin `alt`, `width` y `height`; todas cargan.
- [x] El enlace de idioma lleva a la página equivalente en todas las rutas, incluido el detalle de habitación.
- [x] Verificador de enlaces: ningún enlace interno da 404.
- [x] **Subcarpeta**: construido con `BASE_PATH=/nuevo/`, los 100+ enlaces y recursos empiezan por `/nuevo/` y apuntan a
      archivos que existen.
- [x] **Datos vacíos**: un hotel sin habitaciones/fotos/políticas/contacto construye sin errores y muestra avisos.
- [x] Sin desbordes a 360 px en ninguna página.
- [ ] Revisión visual a 360/768/1280 px **con datos reales**.

## Riesgos y pendientes

- **Datos reales**: lo desconocido es el contenido real del PMS. Si algo rompe, los esquemas fallan en el build.
- **El sitemap incluye páginas `noindex`** (políticas vacías): se filtra en el playbook 06.
- **Metadatos SEO completos** (canonical, `hreflang`, Open Graph, JSON-LD): playbook 06.
