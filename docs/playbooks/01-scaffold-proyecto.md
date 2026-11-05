# 01 — Scaffold del proyecto

**Objetivo:** repositorio Astro + TypeScript estricto con lint, tests, build y estructura lista para los demás
playbooks. Sin contenido todavía.

**Prerrequisitos:** 00 aprobado. Node 22 (el entorno ya tiene v22) y npm.

## Entregables

- Proyecto Astro (`output: 'static'`) con TypeScript `strict`.
- Estructura de carpetas, scripts npm, `.env.example`, `.nvmrc`, `.gitignore`.
- Lint/format/typecheck/unit/e2e configurados con una prueba de humo en cada uno.

## Estructura objetivo

```
.
├─ astro.config.mjs            # site, i18n es/en, trailingSlash:'always', build.format:'directory'
├─ site.config.ts              # carga clients/<CLIENT>.config.ts
├─ clients/lacabana.config.ts  # hotelId, origin, tema, coordenadas, contacto, idiomas
├─ .env.example                # CLIENT, PUBLIC_API_URL, HOTEL_ID, SITE_ORIGIN
├─ scripts/                    # fetch-snapshot.ts, check-images.ts
├─ src/
│  ├─ data/                    # client.ts, schemas.ts, mappers.ts, snapshot loader
│  ├─ i18n/                    # es.json, en.json, helpers
│  ├─ layouts/  components/  pages/  pages/en/
│  ├─ islands/                 # quote-form.ts (JS solo aquí)
│  └─ styles/                  # tokens.css, base.css
├─ public/                     # .htaccess, robots.txt, favicon
├─ tests/unit  tests/e2e
├─ docs/playbooks  docs/brand
└─ .github/workflows
```

## Pasos

- [ ] `npm create astro@latest` (plantilla *minimal*, TypeScript *strictest*, sin instalar integraciones extra).
- [ ] Fijar `engines.node >=22` y crear `.nvmrc` con `22`.
- [ ] `astro.config.mjs`: `site` desde `SITE_ORIGIN`, `trailingSlash: 'always'`, `build.format: 'directory'`
      (genera `/habitaciones/index.html`: funciona en Apache sin reglas), i18n `defaultLocale: 'es'`,
      `locales: ['es','en']`, `routing.prefixDefaultLocale: false`.
- [ ] Dependencias: `zod`, `sharp` (ya incluida por Astro), `@astrojs/sitemap`.
      Desarrollo: `typescript`, `eslint` + `eslint-plugin-astro`, `prettier` + `prettier-plugin-astro`,
      `vitest`, `@playwright/test`, `@lhci/cli`, `tsx`.
- [ ] `clients/lacabana.config.ts` con valores reales conocidos: `hotelId: '5fe1ffca46f0600fec51463d'`
      (dev), `origin` de producción (pregunta abierta 2), zona horaria, `entryTime 15:00`, `departureTime 12:00`.
- [ ] Scripts npm:
      `dev`, `build`, `preview`, `check` (`astro check`), `lint`, `format`, `test`, `test:e2e`,
      `data:fetch` (`tsx scripts/fetch-snapshot.ts`), `verify` (`check && lint && test && build`).
- [ ] `.env.example` con todas las variables y comentarios; `.env` en `.gitignore`. Los secretos de FTP **nunca**
      van al repo (solo GitHub Secrets, ver 07).
- [ ] `.gitignore`: `node_modules`, `dist`, `.astro`, `.env*` (salvo `.env.example`), `.cache`, `test-results`,
      `src/data/snapshot.json` (el snapshot se genera, no se versiona).
- [ ] Una prueba unitaria trivial y un e2e que abra la portada vacía.

## Criterios de aceptación

```bash
npm ci
npm run verify          # check + lint + test + build sin errores
ls dist/index.html      # existe
git status --short      # sin archivos generados sin ignorar
```

## Riesgos

- Plantillas de Astro que traen dependencias que no usamos → revisar `package.json` y quitar lo sobrante.
- Versiones: fijar versiones exactas en el lockfile y no usar `latest` en CI.
