# Sistema de diseño — Hotel La Cabaña

Fuente de verdad del diseño. El código vive en `src/styles/tokens.css`, `src/styles/base.css` y `src/components/`.
Para verlo todo junto: `npm run dev` y abrir **http://localhost:4202/design/** (esa página no se publica).

## Concepto: «Casa de playa, hecha a mano»

Un hotel familiar, artesanal y frente al mar en Puerto Ángel. El diseño debe sentirse **cálido y cercano**, no
corporativo ni de lujo frío.

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Protagonistas | Marrón `#633222` y crema `#FFE6B1` | Muestreados **del archivo del logo**, no estimados. La marca manda. |
| Acento | Un solo verde azulado de mar `#1F5C66` (+ terracota de apoyo `#9A4626`) | Armoniza con las fotos de mar y no compite con el marrón. |
| Motivo gráfico | **El arco** del logo: marcos de foto en arco y divisores en ola | Es la silueta del letrero del hotel; da identidad sin ilustraciones ajenas. |
| Tipografía | **Fraunces** (títulos) + **Karla** (texto) | Fraunces es una serifa cálida, de oficio, afín a la del logo; Karla es limpia y muy legible en móvil. |
| Modo | Solo claro | Evita duplicar el trabajo de contraste. Decisión explícita para v1. |
| Movimiento | Solo CSS, 150–400 ms, respeta `prefers-reduced-motion` | Sin librerías de animación; nada esencial depende de moverse. |
| Móvil primero | Objetivos táctiles ≥ 44 px, barra fija «Solicitar cotización» | El huésped suele llegar desde el celular. |

## Qué se tomó de `ui-ux-pro-max` y qué no

La skill se consultó con `--design-system` (diales: variance 3, motion 3, density 3) y con búsquedas dirigidas
(producto, estilo, tipografía, color, UX, pila Astro). **Sus recomendaciones se trataron como propuestas, no como
órdenes**, y varias se descartaron con motivo:

| Propuesta de la skill | Decisión |
| --- | --- |
| Estilo «Minimalism & Swiss Style» | ❌ Frío y corporativo; no encaja con un hotel artesanal. Se usó **«Nature Distilled»** (cálidos terrosos, hecho a mano), que sí encaja. |
| Paleta azul marino + dorado | ❌ No es la del logo. Se mantiene la marca. |
| Patrón «Hero + Testimonios + CTA» | ❌ No hay reseñas reales y **no se inventan**. |
| Tipografía «Playfair Display SC / Karla» | ◐ Se adoptó **Karla**; el título se cambió a Fraunces (más cálida, mejor a tamaños pequeños). |
| «Evitar: fotos pobres + reserva compleja» | ✅ Adoptado: el flujo es solo cotizar y las fotos pasan por un pipeline con placeholder. |
| Foco visible, objetivos 44 px, validación al salir del campo, resumen de errores enfocable | ✅ Adoptado (ver componentes). |
| `<Image>` de `astro:assets` | ◐ Se usa el pipeline propio (playbook 02): las imágenes vienen de una API remota, con caché, 404 tolerados y metadatos. |
| Fuentes por `@import` de Google Fonts | ❌ Se **autoalojan** (≈ 68 KB en total): sin terceros ni cookies. |

> `frontend-design` no está disponible en este entorno, así que el concepto se construyó con `ui-ux-pro-max` y con
> criterio de diseño propio.

## Color

Todos los colores son tokens CSS (`tokens.css`). **Los componentes no escriben colores a mano.**

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-brand` | `#633222` | Títulos, botón primario, enlaces |
| `--color-brand-strong` | `#4a2418` | Hover/activo |
| `--color-cream` | `#ffe6b1` | Fondos de marca, selección |
| `--color-surface` / `-raised` / `-sunken` | `#fff8ea` / `#fffdf8` / `#f6e8cc` | Página / tarjetas y campos / bandas |
| `--color-deep` | `#3a1d12` | Pie de página y visor de fotos |
| `--color-text` / `--color-text-muted` | `#2b1810` / `#6a5143` | Texto principal / secundario |
| `--color-sea` | `#1f5c66` | Acento: etiquetas, información |
| `--color-terracotta` | `#9a4626` | Apoyo: sobretítulos |
| `--color-border` / `--color-border-strong` | `#e3cfa3` / `#8a6a3f` | Decorativo / bordes de controles (≥ 3:1) |
| `--color-danger` / `--color-success` | `#b3261e` / `#2e6b3e` | Estados (cada uno con su `-soft`) |

**Contraste verificado automáticamente** (`tests/unit/contrast.test.ts` lee `tokens.css`): 33 pares de texto ≥ 4.5:1 y
7 de componentes ≥ 3:1, en los fondos donde realmente se usan. Ejemplos: marrón sobre crema 8.6:1, texto sobre fondo
16:1. Un cambio de color —o el tema de otro cliente— que rompa el contraste hace fallar `npm test`.

> Aprendizaje: el terracota original (`#a8512f`) pasaba sobre el fondo claro (5.1) pero daba 4.43:1 sobre el crema,
> donde aparecen los sobretítulos. Axe lo detectó; se oscureció a `#9a4626` y se amplió la prueba a todos los fondos.

## Tipografía

- `--font-display` Fraunces Variable (peso 600) · `--font-body` Karla Variable. Autoalojadas (`@fontsource-variable`),
  subconjunto latino (incluye `ñ á é í ó ú ¿ ¡`), con precarga de las dos.
- Escala fluida `--text-xs` … `--text-4xl` (`clamp`), texto base 17 px, interlineado 1.6.
- Títulos con `text-wrap: balance` y párrafos con `pretty`.

## Espacio, forma y capas

Espaciado en base 4 px (`--space-1…10`), contenedor 72 rem, gutter fluido ≥ 16 px. Radios: `--radius-sm/md/lg`,
`--radius-pill` (botones) y **`--radius-arch`** (marcos en arco). Capas: `--z-sticky-cta 40`, `--z-header 50`,
`--z-dialog 100`. Breakpoints: 40 / 48 / 64 / 80 rem.

## Componentes (`src/components/`)

| Componente | Notas |
| --- | --- |
| `Header` | Logo + nombre, menú de escritorio, enlace de idioma, CTA «Cotizar». En móvil, menú con `<details>` (**sin JavaScript**). |
| `Footer` | Contacto con `tel:`/`mailto:`, navegación, políticas (solo si existen). |
| `StickyQuoteBar` | Barra fija inferior «Solicitar cotización» en móvil/tablet. |
| `Button` | `primary` · `secondary` · `ghost` · `light` (sobre fondo oscuro); `md`/`lg`; `aria-busy` y deshabilitado. Enlace si lleva `href`. Respeta `type` (por defecto `button`). |
| `Field` | Etiqueta **siempre visible**, ayuda, error con icono, `aria-describedby`/`aria-invalid`, `inputmode`/`autocomplete`, texto de 16 px (evita el zoom de iOS). Con `liveError`, el contenedor del error existe siempre (oculto) para que un script lo rellene. |
| `Checkbox` | Casilla de 24 px y etiqueta clicable ≥ 44 px; ayuda en el slot (fuera de la etiqueta, admite enlaces); error y `liveError` como `Field`. |
| `ErrorSummary` | Resumen enfocable con enlaces a cada campo (el script del formulario lo enfoca tras un envío fallido). |
| `Alert` | `info`/`success`/`danger`; los errores usan `role="alert"`. |
| `RoomCard` | Foto en arco, nombre como **único enlace que cubre toda la tarjeta**, ficha y CTA. |
| `Picture` | `<picture>` WebP + respaldo con `srcset`; imagen suelta; o **placeholder de marca** si la imagen no existe (nunca una imagen rota). |
| `Gallery` | Rejilla + visor sobre `<dialog>` nativo (foco atrapado, `Esc`, flechas, retorno de foco). **Sin JS, cada miniatura enlaza a la foto grande.** |
| `Section`, `Breadcrumb`, `WaveDivider` | Estructura de página, migas, divisor en ola (`from` = fondo anterior, `color` = siguiente). |

Ayudantes: `src/lib/url.ts` (enlaces con `BASE_URL`), `src/lib/routes.ts` (rutas es/en), `src/lib/theme.ts`
(sobrescrituras por cliente, validadas), `src/i18n/ui.ts` (textos de interfaz es/en con claves idénticas).

## Reglas

**Sí**: usar solo tokens · `url()`/`routeUrl()` para todo enlace o recurso interno · `Picture` para fotos ·
etiquetas visibles en los formularios · el nombre accesible de un control debe **contener su texto visible**.

**No**: colores, medidas o sombras escritos a mano · `href="/…"` escritos a mano (el staging va en subcarpeta) ·
quitar el anillo de foco · `max-width: 100%` en SVG de iconos (los colapsa a 0 en contenedores flex) · emojis
como iconos · inventar reseñas, fotos o cifras.

## Tema por cliente

`clients/<slug>.config.ts → theme` sobrescribe cualquier token (`{ '--color-brand': '#…' }`) y se inyecta después de
`tokens.css`. Los nombres y valores se validan (`themeCss`): sin `;`, llaves, `url()` ni `expression()`. Cambiar de
cliente no toca componentes. Logo: `clients/<slug>.config.ts → logoFile` (`public/brand/<logoFile>-{96,192,384}.webp`,
generados con `npm run brand:assets`).

## Verificación (todo automático)

| Qué | Dónde |
| --- | --- |
| Contraste de tokens (WCAG 2.2 AA) | `tests/unit/contrast.test.ts` |
| Axe WCAG 2.2 AA, sin violaciones, en escritorio y móvil | `tests/e2e/design.spec.ts` |
| Sin desbordes, sin dominios externos, imágenes que cargan, controles ≥ 44 px, iconos no colapsados | `tests/e2e/design.spec.ts` |
| Visor: abrir, flechas, `Esc`, clic en fondo, retorno de foco | `tests/e2e/design.spec.ts` |
| Menú móvil con teclado, barra fija, enlace de salto, nombre del hotel dentro de la cabecera (360/390/768 px) | `tests/e2e/design.spec.ts` |
| `prefers-reduced-motion` | `tests/e2e/design.spec.ts` |
| `/design/` no existe en producción | `npm run build` (sin `DESIGN_PAGE`) |

## Pendientes y decisiones abiertas

- **Logo vectorial**: solo hay un PNG de ~780 px. Se usa en tamaños pequeños. Pedir el SVG/AI al cliente o vectorizarlo.
- **Fotografía real**: las ilustraciones SVG de `src/assets/design-sample/` son de muestra, para la página interna.
  La calidad de las fotos del PMS limitará el resultado; revisar con el cliente cuáles reemplazar.
- **Lighthouse** (accesibilidad ≥ 95): se mide en el playbook 06 sobre páginas reales.
- **Terracota**: se eligió por armonía con el logo; confirmar con el cliente si prefiere prescindir de él.
