# Hotel landing — notas para Claude

Sitio estático (Astro + TypeScript) alimentado por la API del PMS. El plan está en `docs/playbooks/` (empieza por
`README.md`): sigue los playbooks en orden y marca sus casillas.

## Reglas del proyecto

- **El sitio debe correr en `http://localhost:4202`.** La API identifica al hotel por la cabecera `Origin`; con otro
  puerto responde 403. El puerto es estricto: si está ocupado, `npm run dev` falla a propósito.
- Verificación completa antes de cada commit: `npm run verify` (tipos + lint + pruebas + build).
- Nunca hacer `POST /receiveCotization` contra la API real desde pruebas automáticas (crea registros en el PMS).
- Los datos fiscales del hotel (RFC, razón social…) no deben llegar a `dist/` ni al snapshot.
- Los enlaces internos se construyen con `import.meta.env.BASE_URL` (el staging va en una subcarpeta).

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
