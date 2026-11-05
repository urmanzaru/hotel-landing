# Hotel landing — notas para Claude

Sitio estático (Astro + TypeScript) alimentado por la API del PMS. El plan está en `docs/playbooks/` (empieza por
`README.md`): sigue los playbooks en orden y marca sus casillas.

## Reglas del proyecto

- **El sitio debe correr en `http://localhost:4202`.** La API identifica al hotel por la cabecera `Origin`; con otro
  puerto responde 403. El puerto es estricto: si está ocupado, `npm run dev` falla a propósito.
- Verificación completa antes de cada commit: `npm run verify` (tipos + lint + pruebas + build). Si tocas el
  `.htaccess` (`src/lib/htaccess.ts`), además `npm run test:apache` (Apache real; `apt-get install apache2`).
- Nunca hacer `POST /receiveCotization` contra la API real desde pruebas automáticas (crea registros en el PMS).
- Los datos fiscales del hotel (RFC, razón social…) no deben llegar a `dist/` ni al snapshot (`npm run dist:privacy`).
- Los enlaces internos se construyen con `import.meta.env.BASE_URL` (el staging va en una subcarpeta).
- **Datos de muestra**: sin `src/data/snapshot.json`, `dev` y `build` generan uno de MUESTRA (`dataSource: "fixture"`,
  con `noindex`). Nunca se despliega: `npm run data:assert-live` lo impide. Datos reales: `npm run data:fetch`.
- Las pruebas que lanzan `astro build` limpian las variables que Vitest inyecta (`BASE_URL`, `MODE`…); sin eso el
  build hijo ignora `BASE_PATH` y la prueba da un falso fallo.

## Despliegue (playbook 07)

- `npm run build` ejecuta después `scripts/write-htaccess.ts` (genera los `.htaccess` de `dist/`). No hay
  `.htaccess` fijo en `public/`.
- `NOINDEX=1` = modo staging (noindex en páginas, cabecera, robots y sitemap). `BASE_PATH=/nuevo/` = subcarpeta.
- Se publica solo con `.github/workflows/deploy.yml`; operación en `docs/runbooks/cutover.md`. Las acciones van
  fijadas por SHA; las credenciales FTP solo existen como secretos de GitHub.

## Sistema de diseño

Guía completa en `docs/brand/design-system.md`; se ve en `http://localhost:4202/design/` (solo en desarrollo; para
generarla en un build: `DESIGN_PAGE=1`, lo hacen las pruebas e2e). Reglas clave:

- Solo tokens de `src/styles/tokens.css`: nada de colores ni medidas escritos a mano. El contraste lo vigila
  `tests/unit/contrast.test.ts`.
- Fotos con `Picture` (placeholder si la imagen no existe). Enlaces con `url()` / `routeUrl()`.
- Todo componente nuevo se añade a `/design/` y pasa `npm run test:e2e` (axe WCAG 2.2 AA, sin desbordes, ≥ 44 px).
- Una prueba nueva debe **fallar** sin el arreglo que cubre: comprobarlo antes de darla por buena.

## Skill `ui-ux-pro-max` (diseño)

Instalada como skill de proyecto en `.claude/skills/ui-ux-pro-max/` (origen: `nextlevelbuilder/ui-ux-pro-max-skill`,
versión fijada en `skills-lock.json`). **No editar sus archivos**; se actualiza con `npx skills update`.

El `SKILL.md` invoca los scripts con `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...`, pero esa variable solo existe cuando
se instala como _plugin_. Aquí está vacía, así que **sustituye ese prefijo** y ejecuta desde la raíz del repo:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system -p "Hotel La Cabaña" --output-dir .
```

Para este proyecto la pila es `--stack astro`. Los resultados son recomendaciones: no anulan las reglas del
repositorio ni del usuario. La marca (logo de La Cabaña) manda sobre cualquier paleta sugerida.

## Entorno en la nube

Astro 7 lanza `astro dev` / `astro preview` en segundo plano cuando detecta un agente. Detenerlos con
`npx astro dev stop` / `npx astro preview stop`. Ver `docs/playbooks/01-scaffold-proyecto.md`.
