# 07 — CI/CD y despliegue por FTP

> **Estado: 🟡 todo el código está hecho y probado aquí (workflows validados con `actionlint`, `.htaccess` probado en
> Apache 2.4 real). Falta lo que solo puede hacerse con acceso al hosting y a GitHub: crear los Environments y
> secretos, el despliegue de prueba (preguntas abiertas 2 y 3), el staging y el cutover.** Pasos exactos en
> [`docs/runbooks/cutover.md`](../runbooks/cutover.md).

**Objetivo:** que cada cambio y cada reconstrucción programada se verifique, se construya y se publique por FTP de
forma repetible, con staging, respaldo y rollback. El servidor no se configura: solo recibe archivos.

**Prerrequisitos:** el esqueleto puede hacerse justo después de 01; el cutover final requiere 06. Preguntas
abiertas 2 y 3 del README se resuelven dentro de este playbook con un despliegue de prueba. Credenciales FTP guardadas **solo** como secretos de GitHub (nunca en el repo ni en
el chat).

## Estado actual del servidor (según tu captura)

Raíz del sitio: `.well-known/`, `assets/`, `cgi-bin/`, `.htaccess` (201 bytes), `index.html`, `favicon.ico`,
`main-*.js`, `chunk-*.js` ×2, `polyfills-*.js`, `styles-*.css` (build de Angular con hash).
Hay que **conservar** `.well-known/` (validación SSL) y `cgi-bin/`, y **leer el `.htaccess` actual** antes de
reemplazarlo (puede traer redirecciones o reglas del hosting que hay que mantener).

## Entregables (hechos)

| Archivo | Qué hace |
| --- | --- |
| `.github/workflows/ci.yml` | En cada push y PR: tipos, lint, formato, unitarias, build, e2e, `.htaccess` en Apache real y Lighthouse. Guarda informes. |
| `.github/workflows/deploy.yml` | Datos del PMS → build → humo → artefacto `dist/` → FTP → verificación. Destino, simulación y redespliegue (rollback). |
| `.github/dependabot.yml` | npm y acciones, semanal, agrupado y con 14 días de espera para versiones nuevas. |
| `src/lib/htaccess.ts` + `scripts/write-htaccess.ts` | El `.htaccess` se **genera** en `postbuild` (no es un archivo fijo en `public/`): depende del origen, la base, la API, los hashes CSP de los scripts del build y el modo staging. |
| `src/lib/deploy-checks.ts` + `scripts/check-dist.ts`, `verify-deploy.ts` | `npm run deploy:check` (antes de subir) y `npm run deploy:verify -- <url>` (después). |
| `tests/integration/apache.test.ts` | `npm run test:apache`: sirve tres builds con Apache real y comprueba reglas, cabeceras y la CSP en Chromium. |
| `docs/runbooks/cutover.md` | Configuración, despliegue de prueba, staging, cutover, rollback y plan B. |

Todas las acciones están fijadas por SHA (con su versión en un comentario), en versiones de más de dos semanas.

## Pipeline

### `ci.yml` — en cada PR y push
`npm ci` → `check` → `lint` → `format:check` → `test` → `build` (con datos de muestra, sin API real) →
`images:check` → `test:e2e` → `test:apache` (instala `apache2`) → `lhci`. Los informes de Playwright y Lighthouse
se guardan como artefacto.

### `deploy.yml` — `push` a `main`, `schedule` (`17 */6 * * *`), `workflow_dispatch` (`target`, `dry_run`, `redeploy_run_id`)

Destino: push → `staging`; programado → `vars.SCHEDULED_TARGET` (staging hasta el cutover); manual → el elegido.
Push y programado solo corren con la variable de repositorio `DEPLOY_ENABLED=true` (evita fallos cada 6 h antes de
configurar los secretos). Con `redeploy_run_id` se salta la construcción y se sube el `dist/` guardado de esa
ejecución (rollback rápido). Lo que sigue es el camino normal:

1. `concurrency: deploy-${{ inputs.target }}` (una sola ejecución a la vez, sin cancelar a medias).
2. Checkout, Node 22 con caché de npm, `npm ci`.
3. Restaurar caché del último snapshot e imágenes (`actions/cache`).
4. `npm run data:fetch` con `PUBLIC_API_URL`, `HOTEL_ID`, `SITE_ORIGIN` → falla si no pasa los umbrales (02).
   Justo después, **`npm run data:assert-live`**: falla si el snapshot es de MUESTRA (`dataSource: fixture`), para que
   datos de ejemplo nunca lleguen a producción.
5. `npm run build` + `check-images.ts`.
6. **Humo previo al envío** (`npm run deploy:check`): existen portada, habitaciones, cotización, 404, `_astro/` y
   `.htaccess`; la portada tiene el nombre del hotel; **`noindex` solo en staging** (en producción, si la portada lo
   lleva, no se sube), el `.htaccess` coincide con ese modo y **ningún archivo de texto lleva datos fiscales**
   (RFC, razón social, régimen; lo mismo que `npm run dist:privacy` en CI, añadido en 08).
7. Subir por FTP con `SamKirkland/FTP-Deploy-Action` (versión fija): `local-dir: dist/`, `server-dir` del
   entorno, `protocol: ftps` si el hosting lo permite, `state-name` propio por entorno (sube solo lo que cambió),
   `exclude: **/.well-known/**, **/cgi-bin/**`, **sin** `dangerous-clean-slate`.
8. **Verificación posterior** (`npm run deploy:verify -- $SITE_URL`, 3 intentos): la portada responde 200 con el
   nombre del hotel, una imagen del PMS responde 200 y el `.htaccess` no se puede descargar (errores); avisa si el
   hosting no aplica la CSP, la caché o el 301 de **cada** ruta del sitio anterior (lista en `src/lib/legacy.ts`;
   ampliado en 08). Si falla → el job falla (ver rollback).
9. Guardar `dist/` como artefacto del job (retención 14 días) para poder redistribuir una versión anterior.

### Secretos y variables

| Nombre | Tipo | Ejemplo / nota |
|---|---|---|
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | Secreto | por entorno (`staging` y `production`) |
| `FTP_PROTOCOL` | Variable | `ftps` o `ftp` |
| `FTP_DIR` | Variable | `/public_html/` o carpeta del subdominio de pruebas |
| `PUBLIC_API_URL`, `HOTEL_ID`, `SITE_ORIGIN`, `CLIENT` | Variable | por entorno |
| `BASE_PATH`, `NOINDEX`, `SITE_URL` | Variable | staging: `/nuevo/`, `1`, `https://<dominio>/nuevo/` |
| `DEPLOY_ENABLED`, `SCHEDULED_TARGET` | Variable del repositorio | `true`; `staging` → `production` tras el cutover |

Usar **Environments** de GitHub; `production` con aprobación manual requerida.

## `.htaccess` del sitio nuevo (todo dentro de `<IfModule>` para no romper si falta un módulo) — ✅ generado y probado

- Forzar HTTPS y un solo host canónico (el de `SITE_ORIGIN`), **excepto `.well-known/`** (validación del certificado
  por http). Solo si `SITE_ORIGIN` es `https:`.
- `Options -Indexes`; `DirectoryIndex index.html`; `ErrorDocument 404 /404.html`.
- Los `.ht*` responden 403 por una regla propia (`RewriteRule (^|/)\.ht - [F,L]`), sin depender de que el hosting
  traiga la suya (hallazgo de 08 en Apache real). Con `mod_rewrite` y no con `Require`, que exigiría otro
  `AllowOverride` y podría dar 500.
- Compresión (`mod_deflate`) y caché: `_astro/` → un año `immutable` (nombres con hash); `img/` → una semana (las
  fotos del PMS conservan el id aunque cambien); el resto → un día; HTML → `no-cache` (revalidar siempre). Lo de las
  carpetas va en un `.htaccess` propio dentro de cada una.
- Cabeceras de seguridad: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options`, `Content-Security-Policy` (`connect-src` = `PUBLIC_API_URL`; `img-src 'self' data:`; scripts en
  línea autorizados **por hash**, calculados del build; `style-src` necesita `'unsafe-inline'` por los atributos
  `style` de Astro; Turnstile se añade solo si el cliente lo activa).
- Redirecciones 301 del sitio Angular anterior: generarlas con `htaccessRedirects(base)` de `src/lib/legacy.ts`
  (lista y supuestos en 06).
- Conservar cualquier regla propia del hosting detectada en el `.htaccess` actual: copiarla a
  `clients/<cliente>.htaccess`, que se antepone al generado.
- Hallazgo de la prueba en Apache: el `.htaccess` de la **raíz** también se aplica a `/nuevo/`. Con el nuestro no hay
  problema (staging y producción comparten dominio); con el de Angular, ver el aviso en el runbook.

## Plan de despliegue por fases

**Fase A — Staging** (no toca producción)
> **Restricción confirmada:** solo hay FTP; no se puede crear un subdominio ni tocar el dominio. El staging
> es, por tanto, una **subcarpeta** del mismo dominio (p. ej. `https://<dominio>/nuevo/`), que convive con el
> Angular actual en la raíz sin pisarlo.

- [x] Soportar `BASE_PATH` en `astro.config.ts` (`base: '/nuevo/'` solo en staging; en producción `/`). Todos los
      enlaces y recursos internos se construyen con `import.meta.env.BASE_URL` (regla en 04), nunca con rutas
      absolutas escritas a mano. El workflow compila con `BASE_PATH=/nuevo/` para `staging`.
- [x] El staging **no se indexa**: con `NOINDEX=1`, `<meta name="robots" content="noindex">` en cada página,
      `X-Robots-Tag: noindex` en el `.htaccess` de esa carpeta, `robots.txt` que bloquea y sitemap vacío.
- [ ] El `Origin` del navegador es el dominio, **sin ruta**: es el mismo que tendrá producción. Si ese dominio
      está registrado como `url` del hotel en el PMS correspondiente, el formulario funciona en staging; si no,
      dará 403 (la API de dev solo conoce `http://localhost:4202`). Hasta entonces, en staging se valida todo
      salvo el envío real de la cotización.
- [ ] Primer despliegue de prueba: subir una página mínima a la subcarpeta para averiguar si Actions conecta
      (pregunta abierta 2) y si hay FTPS (pregunta abierta 3).
- [ ] Desplegar, recorrer el checklist de 08 y obtener la aprobación del cliente.

**Fase B — Cutover** (ventana de baja actividad)
- [ ] **Respaldo completo**: descargar toda la raíz actual por FTP a una carpeta fechada fuera del repo
      (`backup-AAAAMMDD/`), incluido el `.htaccess`. Verificar que abre (tamaños coinciden con la captura).
- [ ] Desplegar `production` con aprobación. Los archivos de Angular (`main-*.js`, `chunk-*.js`,
      `polyfills-*.js`, `styles-*.css`, `assets/`) quedan sin uso; **borrarlos después** de 7 días estables,
      no antes.
- [ ] Verificar: portada, habitaciones, cotización real (1 envío de prueba y avisar para borrarlo), redirecciones
      del sitio anterior, `https://dominio/.well-known/` intacto, caché (`curl -I`).
- [ ] Probar enlaces compartidos antiguos (`/roomTypes`, `/contactUS`…) → 301 a las nuevas.

**Rollback** (objetivo < 10 minutos)
1. Subir de nuevo el respaldo `backup-AAAAMMDD/` a la raíz (sobrescribe), incluido su `.htaccess`.
2. Alternativa más rápida: relanzar `deploy.yml` con un artefacto `dist/` anterior.
3. Registrar la causa y no reintentar hasta entenderla.

**Plan B sin Actions** (si el hosting bloquea las IP de GitHub): `npm run build` en tu equipo y subir
`dist/` con tu cliente FTP, respetando las mismas exclusiones.

## Criterios de aceptación

- Un PR con un error de lint o un test roto **no** puede desplegarse: solo `main` despliega y hay que activar la
  protección de rama (*Settings → Branches*: requerir el check «CI» verde antes de fusionar).
- `workflow_dispatch` a `staging` publica en menos de 5 minutos y el job termina verde con la verificación posterior.
- Con `PUBLIC_API_URL` apuntando a un host caído y sin caché, el job falla y **el sitio publicado no cambia**.
- Se ejecutó un ensayo de rollback en staging y funciona.
- Ningún secreto aparece en los registros del workflow ni en el repo (`git log -p | grep -i password` vacío).

## Riesgos

- FTP sin cifrado expone credenciales → pedir FTPS/SFTP; si solo hay FTP plano, rotar la contraseña tras el
  cutover y limitar el usuario a la carpeta del sitio.
- Sobrescribir `.well-known` rompe el certificado → siempre excluido.
- Carga parcial por corte de conexión → el estado de FTP-Deploy reintenta; la verificación posterior detecta
  inconsistencias.
