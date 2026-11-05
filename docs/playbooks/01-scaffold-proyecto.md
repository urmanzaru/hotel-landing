# 01 — Scaffold del proyecto

> **Estado: ✅ completado.** Ver "Resultado y desviaciones" al final.

**Objetivo:** repositorio Astro + TypeScript estricto con lint, tests, build y estructura lista para los demás
playbooks. Sin contenido todavía.

**Prerrequisitos:** 00 aprobado. Node ≥ 22.23.4 (lo exige Astro 7) y npm.

## Entregables

- Proyecto Astro (`output: 'static'`) con TypeScript `strict`.
- Estructura de carpetas, scripts npm, `.env.example`, `.nvmrc`, `.gitignore`.
- Lint/format/typecheck/unit/e2e configurados con una prueba de humo en cada uno.

## Estructura actual

```
.
├─ astro.config.ts             # site, i18n es/en, trailingSlash:'always', build.format:'directory', puerto estricto
├─ site.config.ts              # loadSiteConfig(): cliente (CLIENT) + sobrescrituras de entorno
├─ clients/types.ts            # tipo ClientConfig + defineClient()
├─ clients/lacabana.config.ts  # hotelId, origin, apiBaseUrl, horarios, coordenadas, tema
├─ .env.example                # CLIENT, SITE_ORIGIN, PUBLIC_API_URL, HOTEL_ID
├─ src/
│  ├─ env.d.ts                 # declara __SITE_CONFIG__ (inyectado en el build)
│  ├─ lib/site.ts              # siteConfig para las páginas
│  └─ pages/index.astro        # portada provisional
├─ tests/unit/site-config.test.ts   tests/e2e/home.spec.ts
├─ .claude/                    # settings.json (plugin ui-ux-pro-max) y launch.json (puerto 4202)
└─ docs/playbooks  docs/brand
```

Las carpetas `scripts/`, `src/data/`, `src/i18n/`, `src/islands/` y `src/styles/` se crean en el playbook que
las usa (02–05), no antes.

## Pasos

- [x] Proyecto Astro creado a mano (no con `npm create astro`) para que sea reproducible.
- [x] `engines.node >=22.23.4` y `.nvmrc` con `22`.
- [x] `astro.config.ts`: `site` desde `SITE_ORIGIN`, `trailingSlash: 'always'`, `build.format: 'directory'`,
      i18n `es` por defecto sin prefijo y `en`, sitemap, **puerto tomado de `SITE_ORIGIN` y estricto**.
- [x] Dependencias con versión exacta: `astro`, `@astrojs/sitemap` (retirado en 06: sitemap propio), `zod`; desarrollo: `typescript`,
      `@astrojs/check`, `eslint`, `typescript-eslint`, `eslint-plugin-astro`, `prettier`,
      `prettier-plugin-astro`, `vitest`, `@playwright/test`, `tsx`.
- [x] `clients/lacabana.config.ts` con los valores de desarrollo (API de dev, origen `http://localhost:4202`).
- [x] Scripts npm: `dev`, `build`, `preview`, `check`, `lint`, `format`, `format:check`, `test`, `test:e2e`,
      `data:fetch` (se activa en 02), `verify`.
- [x] `.env.example`, `.env` ignorado. Credenciales FTP solo en GitHub Secrets (07).
- [x] `.gitignore` incluye `src/data/snapshot.json`, `.cache/`, `reports/`.
- [x] Prueba unitaria (`loadSiteConfig`, 5 casos) y e2e de la portada.
- [ ] `@lhci/cli` (Lighthouse CI): se instala en 06, cuando haya páginas que medir.

## Criterios de aceptación (todos verificados)

```bash
npm ci
npm run verify          # check + lint + test + build sin errores
npm run test:e2e        # portada responde 200
```

## Resultado y desviaciones respecto al plan original

| Tema | Decisión | Motivo |
|---|---|---|
| TypeScript | **6.0.3**, no 7.0.2 | `@astrojs/check` solo acepta TypeScript 5 o 6; instalar 7 exigía `--force`. |
| Playwright | **1.63.0** exacto | Coincide con los navegadores preinstalados en el entorno de Claude Code en la nube. |
| `astro.config` | `.ts`, no `.mjs` | Importa `site.config.ts` directamente y comparte tipos. |
| Puerto | `vite.server.strictPort: true` | El PMS identifica al hotel por `Origin`; si el puerto 4202 está ocupado, `dev` **debe fallar** en lugar de saltar a 4203 (con 4203 la API respondería 403). |
| Dependencias de lint | `defineConfig` de `eslint/config` | `tseslint.config` está deprecada. |
| Vulnerabilidades | `npm audit --omit=dev` → 0; 10 *moderate* solo en herramientas de desarrollo (`minimatch` dentro de `@astrojs/check`) | No llegan a `dist/`; se revisan en cada actualización de dependencias. |
| `lhci` | Pospuesto a 06 | Sin páginas no hay nada que medir. |

### Aviso: servidores en segundo plano en el entorno de Claude Code

Astro 7 lanza `astro dev` y `astro preview` **como proceso en segundo plano** cuando detecta que lo ejecuta un
agente (variables como `AI_AGENT`). En tu equipo y en GitHub Actions corren en primer plano, sin cambios. En
el entorno en la nube:

- Parar con `npx astro dev stop` / `npx astro preview stop`; ver estado con `status`, registros con `logs`.
- Un servidor olvidado ocupa el 4202; con el puerto estricto, el siguiente `dev` fallará con
  `Dev server process exited before becoming ready` (ver `astro dev logs`). Es la señal para detener el anterior.
- Para el e2e, Playwright no puede arrancar un servidor que se va a segundo plano: levantar primero
  `npx astro preview --port 4202` y ejecutar `npm run test:e2e` (reutiliza el servidor existente).
