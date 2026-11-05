# 04 — Páginas y contenido

**Objetivo:** construir las páginas de v1 con datos del snapshot, en español e inglés.

**Prerrequisitos:** 02 (snapshot) y 03 (componentes base).

## Mapa del sitio

| Ruta (es) | Ruta (en) | Contenido | Fuente de datos |
|---|---|---|---|
| `/` | `/en/` | Hero, propuesta del hotel, habitaciones destacadas, galería corta, ubicación breve, CTA | `hotel`, `roomTypes`, `hotel.images` |
| `/habitaciones/` | `/en/rooms/` | Lista de tipos de habitación activos | `roomTypes` |
| `/habitaciones/[slug]/` | `/en/rooms/[slug]/` | Detalle: fotos, descripción, capacidad (adultos/niños), tipo de cobro, CTA | `roomTypes[i]` |
| `/galeria/` | `/en/gallery/` | Galería completa con lightbox y créditos | `hotel.images`, `roomTypes[*].images` |
| `/ubicacion/` | `/en/location/` | Dirección, mapa, cómo llegar | `hotel.address` + coordenadas de config |
| `/contacto/` | `/en/contact/` | Teléfonos, correo, horarios de entrada/salida, mapa | `hotel` |
| `/cotizar/` | `/en/quote/` | Formulario (playbook 05) | — |
| `/politicas/` | `/en/policies/` | Políticas y privacidad (una sección por política) | `hotel.politics` |
| `/404.html` | — | Página de error con enlaces útiles | — |

Los slugs se generan del nombre (`esName` → `sencilla-i`) con el `id` como desempate; se verifica que sean únicos
en el build.

## Decisiones de contenido

- **Sin portadas.** El hero usa la primera imagen válida de `hotel.images`, o una imagen elegida en
  `clients/<x>.config.ts → heroImageId`. Si no hay ninguna válida, se usa el patrón de marca (olas) del sistema
  de diseño.
- **Texto de la API manda**: nombre, categoría, descripciones. Textos fijos de interfaz (menú, botones, etiquetas)
  viven en `src/i18n/{es,en}.json`. Si falta la versión en inglés de un campo del PMS, se muestra la española.
- **Capacidad y cobro**: "2 adultos · 0 niños · por noche" (`chargeType` normalizado en 02).
- **No se muestran precios** (el PMS no los publica en estos endpoints): el CTA es "Solicitar cotización".
- **Créditos de fotografía**: mostrar `author` con enlace a `linkCopyright` cuando existan.
- **Datos fiscales**: no se muestran en ninguna página.
- **Ubicación**: mapa sin clave (enlace a OpenStreetMap/Google Maps + imagen estática o `iframe` diferido con
  consentimiento). Coordenadas desde la config, no desde la API.
- **Contacto**: teléfono con `tel:`, correo con `mailto:`, WhatsApp con `https://wa.me/` si el cliente lo da.

## Pasos

- [ ] `src/i18n/`: archivos de textos y helper `t(locale, key)` con comprobación de claves faltantes en build.
- [ ] `src/layouts/Base.astro`: `<html lang>`, metadatos, `Header`, `Footer`, enlaces `hreflang`.
- [ ] Rutas dinámicas con `getStaticPaths()` desde el snapshot; una sola fuente de plantillas para es/en.
- [ ] Página de inicio con las secciones del mapa; imágenes con `Picture`, la del hero con `fetchpriority="high"`
      y el resto `loading="lazy"`.
- [ ] Lista y detalle de habitaciones; el detalle incluye galería propia y CTA que lleva a
      `/cotizar/?room=<slug>` para precargar el tipo de habitación en las notas.
- [ ] Galería con lightbox accesible (teclado, `Esc`, foco atrapado, `aria-label`), sin librería externa pesada.
- [ ] Ubicación y contacto (datos + mapa).
- [ ] Políticas: render del texto de cada política; escapar el HTML si la API lo trae.
- [ ] 404 y navegación coherente; selector de idioma conserva la ruta equivalente.
- [ ] Estados vacíos: sin habitaciones activas → mensaje "Contáctanos" en lugar de una lista vacía;
      sin políticas → ocultar enlace del pie.

## Criterios de aceptación

```bash
npm run build
find dist -name index.html | sort        # todas las rutas es y en existen
npm run test:e2e -- tests/e2e/pages.spec.ts
```

- Cada ruta devuelve 200 con `<h1>` único y `lang` correcto.
- Ninguna `<img>` sin `alt`, `width` y `height`; ninguna URL de imagen rota (`check-images.ts` pasa).
- El enlace de cambio de idioma lleva a la página equivalente en todas las rutas, incluidas las de detalle.
- Con un snapshot sin habitaciones activas, el build sigue pasando y muestra el estado vacío.
- Las 8 rutas se ven bien en 360, 768 y 1280 px (capturas de Playwright revisadas).

## Riesgos

- Contenido del PMS con HTML o saltos de línea inesperados → sanitizar y probar con fixtures extremas
  (texto muy largo, sin descripción, nombre duplicado).
- Slugs que cambian si el cliente renombra un tipo de habitación → enlaces rotos; mitigación: la redirección
  `Redirect 301` se anota en 09 cuando ocurra.
