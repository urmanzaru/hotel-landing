# 03 — Sistema de diseño (con ui-ux-pro-max)

> **Estado: ✅ completado.** Guía de diseño: [`docs/brand/design-system.md`](../brand/design-system.md).
> Galería viva: `npm run dev` → http://localhost:4202/design/ (no se publica).

**Objetivo:** identidad visual coherente y tematizable por cliente: tokens, tipografía, componentes base y reglas de
movimiento, derivados del logo de La Cabaña y de la guía de `ui-ux-pro-max`.

**Prerrequisitos:** 01 completo. Skill `ui-ux-pro-max` instalada como skill de proyecto (✅, ver `README.md`).

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system --stack astro
```

> Se ejecuta con la ruta del proyecto, no con `${CLAUDE_PLUGIN_ROOT}` (ver `CLAUDE.md`).

## Entregables (hechos)

- `docs/brand/design-system.md`: concepto, decisiones (incluye qué se adoptó y qué se descartó de la skill y por qué),
  tokens, componentes, reglas y verificación.
- `src/styles/tokens.css` y `src/styles/base.css`.
- 14 componentes en `src/components/` más ayudantes (`src/lib/url.ts`, `routes.ts`, `theme.ts`, `contrast.ts`,
  `gallery.ts`; `src/i18n/ui.ts`; `src/islands/lightbox.ts`; `src/layouts/Base.astro`).
- Página interna `/design/` (`src/pages/[dev].astro`): solo en desarrollo o con `DESIGN_PAGE=1`.
- Logo web en `public/brand/` (`npm run brand:assets`) y 4 ilustraciones SVG de muestra en `src/assets/design-sample/`.
- 103 pruebas unitarias y 26 e2e (ver "Verificación").

## Pasos

- [x] **Extraer paleta** del logo con muestreo real: marrón `#633222`, crema `#FFE6B1`.
- [x] **Ejecutar ui-ux-pro-max** (`--design-system` con diales 3/3/3 y búsquedas de producto, estilo, tipografía,
      color, UX y pila Astro). Adoptado: estilo «Nature Distilled», Karla, guías de foco/formularios/táctil.
      Descartado con motivo: estilo Swiss minimal, paleta azul/dorado, patrón con testimonios.
- [x] **Validar contraste**: 33 pares de texto ≥ 4.5:1 y 7 de componentes ≥ 3:1, como prueba automática.
- [x] **Tipografía autoalojada**: Fraunces (títulos) + Karla (texto), subconjunto latino, ≈ 68 KB, precarga de ambas,
      sin Google Fonts en runtime.
- [x] **Tokens por cliente**: `clients/<slug>.config.ts → theme` se inyecta tras `tokens.css` (validado).
- [x] **Componentes base**: `Header`, `Footer`, `Button`, `Field`, `ErrorSummary`, `Alert`, `RoomCard`, `Picture`,
      `Gallery` (+ visor), `Section`, `Breadcrumb`, `WaveDivider`, `StickyQuoteBar`. (`Card` genérica no hizo falta:
      `RoomCard` y `Alert` cubren los usos de v1.)
- [x] **Movimiento**: transiciones cortas solo con CSS; `prefers-reduced-motion` las desactiva (probado).
- [x] **Móvil primero**: controles ≥ 44 px (probado), barra fija «Solicitar cotización», menú sin JavaScript.
- [x] **Modo oscuro**: fuera de v1 (decisión explícita).

## Verificación (criterios de aceptación)

```bash
npm run verify        # tipos + lint + 103 pruebas unitarias + build de producción
npm run test:e2e      # 26 pruebas: axe, desbordes, visor, menú, táctil, movimiento reducido…
```

- [x] `/design/` muestra todos los componentes en sus estados; **axe sin violaciones** WCAG 2.2 AA en escritorio y móvil.
- [x] Cambiar los tokens de `clients/lacabana.config.ts → theme` cambia el aspecto sin editar componentes.
- [x] Cero peticiones a dominios externos al cargar la página (fuentes e iconos autoalojados).
- [x] `/design/` **no existe** en el build de producción ni en su sitemap.
- [ ] **Lighthouse Accessibility ≥ 95**: se mide en el playbook 06 (`@lhci/cli`) sobre páginas reales; aquí la
      accesibilidad se verifica con axe.

## Resultado y desviaciones respecto al plan original

| Tema | Decisión | Motivo |
| --- | --- | --- |
| `frontend-design` | No disponible en este entorno | Se usó `ui-ux-pro-max` + criterio de diseño propio. |
| Salida de la skill | **No** se persistió `design-system/…/MASTER.md` | Su propuesta (azul marino, Swiss) contradice la marca y la skill pide no persistir salida no verificada. La fuente de verdad es `docs/brand/design-system.md`. |
| Componente `Card` | No se creó | Ningún uso de v1 lo necesita (YAGNI). |
| Lighthouse | Pospuesto a 06 | Sin páginas reales no hay nada que medir. |
| Fotografía | Ilustraciones SVG de muestra | No se inventan fotos del hotel; la página interna usa ilustraciones claramente marcadas «de muestra». |

### Defectos encontrados y corregidos al verificar

Cada uno quedó cubierto por una prueba que **se comprobó que falla sin el arreglo**:

1. **Terracota con contraste 4.43:1** sobre el crema (axe). La prueba de tokens solo lo miraba sobre el fondo claro.
   Se oscureció a `#9a4626` y se amplió la prueba a todos los fondos.
2. **Enlace de idioma sin «etiqueta en el nombre»** (WCAG 2.5.3): el `aria-label` no contenía el texto visible «EN».
3. **Iconos SVG colapsados a 0×0** por `max-width: 100%` en el reinicio de CSS (el botón «Menú» no mostraba icono).
   La primera versión de la prueba no lo detectaba (el icono medía 0,27 px, no 0): se corrigió el umbral.
4. **Ola divisora invisible** entre secciones de distinto fondo: faltaba el color de la sección anterior (`from`).
5. **Nombre del hotel pegado al borde** de la cabecera móvil al recuperar el icono su espacio.

## Riesgos que siguen abiertos

- **Logo en baja resolución** (PNG de ~780 px; no hay vector). Se usa en ≤ 100 px de ancho. Opciones: pedir el
  SVG/AI al cliente, vectorizarlo (skill `svg-logo-designer`) con su aprobación, o usar solo el nombre en tipografía.
- **Calidad de las fotos del PMS**: limitará el resultado final; avisar al cliente qué fotos reemplazar.
- **Diseño no validado con el cliente**: es una propuesta; la aprobación visual del concepto sigue pendiente.
