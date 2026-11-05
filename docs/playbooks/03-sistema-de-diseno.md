# 03 — Sistema de diseño (con ui-ux-pro-max)

**Objetivo:** identidad visual coherente y tematizable por cliente: tokens, tipografía, componentes base y reglas de
movimiento, derivados del logo de La Cabaña y de la guía que genere `ui-ux-pro-max`.

**Prerrequisitos:** 01 completo. El plugin instalado **por ti** en Claude Code:

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

> No puedo ejecutar `/plugin` desde esta sesión. Cuando esté instalado, este playbook se ejecuta pidiendo a la
> skill el sistema de diseño con el brief de abajo y guardando su salida en `docs/brand/design-system.md`.

## Brief para la skill

- **Producto:** sitio de hotel familiar frente al mar en Puerto Ángel, Oaxaca. "Higiénico, confortable y familiar".
- **Objetivo del usuario:** ver cómo es el hotel, comparar habitaciones y pedir cotización en pocos toques, sobre
  todo desde celular.
- **Marca (logo):** marrón oscuro sobre crema, serifa clásica, motivo de olas y peces. Referencia en
  `docs/brand/logo-lacabana-source.png`. Colores aproximados a **muestrear con un cuentagotas** del archivo:
  marrón ≈ `#6B3220`, crema ≈ `#FFE5B0`.
- **Tono:** cálido, costero, artesanal; no corporativo. Fotografía grande, mucho aire.
- **Restricciones:** móvil primero, cargar rápido en redes lentas, WCAG 2.2 AA, es/en, sin dependencias de CDNs.

## Entregables

- `docs/brand/design-system.md` (salida de la skill + decisiones tomadas).
- `src/styles/tokens.css`: variables CSS (color, tipografía, espaciado, radios, sombras, z-index, duración).
- `src/styles/base.css`: reset, tipografía, foco visible, `prefers-reduced-motion`.
- Componentes base documentados en `/design` (página interna, excluida del sitemap y de producción).

## Pasos

- [ ] **Extraer paleta** del logo (muestreo real) y definir roles: `--color-brand`, `--color-surface`,
      `--color-text`, `--color-accent`, `--color-success/danger`, además de escala de grises cálida.
- [ ] **Ejecutar ui-ux-pro-max** con el brief; revisar propuesta de estilo, paleta, tipografía y patrones de
      landing de hotel. Registrar qué se adoptó y qué se descartó y por qué.
- [ ] **Validar contraste**: texto/fondo ≥ 4.5:1, texto grande y componentes UI ≥ 3:1, también en estados
      hover/focus/disabled. El marrón sobre crema del logo cumple con holgura; verificar el acento.
- [ ] **Tipografía**: autoalojada (WOFF2 vía `@fontsource-variable/*`), máximo 2 familias, `font-display: swap`,
      subconjunto latino (incluye `ñ`, `á`, `é`), precarga solo de la fuente principal. Sin Google Fonts en runtime.
- [ ] **Tokens por cliente**: `tokens.css` define los valores por defecto; `clients/<x>.config.ts` los sobrescribe
      inyectando un bloque `:root` en el layout. Cambiar de cliente no debe tocar componentes.
- [ ] **Componentes base**: `Header` (logo + nav + selector de idioma + CTA "Cotizar"), `Footer`, `Button`,
      `Card`, `RoomCard`, `Gallery` (rejilla + lightbox accesible), `Field`/`Input`/`Select`/`DateInput`,
      `Alert`, `Section`, `Breadcrumb`, `Picture` (usa el pipeline de 02 con placeholder).
- [ ] **Movimiento**: transiciones cortas (150–250 ms), nada esencial depende de animación,
      `@media (prefers-reduced-motion: reduce)` las desactiva.
- [ ] **Móvil primero**: breakpoints 360 / 768 / 1024 / 1280; objetivos táctiles ≥ 44 px; CTA "Cotizar" siempre
      alcanzable (barra fija inferior en móvil).
- [ ] **Modo oscuro**: fuera de v1 (decisión explícita para no duplicar el trabajo de contraste).

## Criterios de aceptación

```bash
npm run build && npm run test:e2e -- tests/e2e/design.spec.ts
```

- La página `/design` muestra todos los componentes en sus estados; axe-core sin violaciones serias o críticas.
- Cambiar los tokens de `clients/lacabana.config.ts` cambia el aspecto sin editar componentes.
- Sin peticiones a dominios externos al cargar la portada (fuentes e iconos autoalojados).
- Lighthouse Accessibility ≥ 95 en `/design`.

## Riesgos

- Que la salida de la skill choque con la identidad real del hotel: la marca manda; la skill propone.
- Logo en baja resolución (el adjunto es raster, ~770 px de ancho) y **no existe versión vectorial**. Opciones, en
  orden: (1) usar el PNG con transparencia solo en tamaños ≤ 200 px (se ve nítido en 2×); (2) vectorizar el logo
  (hay una skill `svg-logo-designer` disponible para recrearlo en SVG) y que el cliente lo apruebe; (3) mostrar el
  nombre del hotel en tipografía y reservar el logo para favicon y pie de página.
