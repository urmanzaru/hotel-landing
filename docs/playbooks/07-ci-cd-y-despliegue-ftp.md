# 07 — CI/CD y despliegue por FTP

**Objetivo:** que cada cambio y cada reconstrucción programada se verifique, se construya y se publique por FTP de
forma repetible, con staging, respaldo y rollback. El servidor no se configura: solo recibe archivos.

**Prerrequisitos:** el esqueleto puede hacerse justo después de 01; el cutover final requiere 06. Preguntas
abiertas 3 y 4 respondidas. Credenciales FTP guardadas **solo** como secretos de GitHub (nunca en el repo ni en
el chat).

## Estado actual del servidor (según tu captura)

Raíz del sitio: `.well-known/`, `assets/`, `cgi-bin/`, `.htaccess` (201 bytes), `index.html`, `favicon.ico`,
`main-*.js`, `chunk-*.js` ×2, `polyfills-*.js`, `styles-*.css` (build de Angular con hash).
Hay que **conservar** `.well-known/` (validación SSL) y `cgi-bin/`, y **leer el `.htaccess` actual** antes de
reemplazarlo (puede traer redirecciones o reglas del hosting que hay que mantener).

## Entregables

- `.github/workflows/ci.yml`, `deploy.yml`, `.github/dependabot.yml`.
- `public/.htaccess` del sitio nuevo y `docs/runbooks/cutover.md` (resumen operativo de este playbook).

## Pipeline

### `ci.yml` — en cada PR y push
`npm ci` → `check` → `lint` → `test` → `build` (con fixtures, sin API real) → `test:e2e` → `lhci`.

### `deploy.yml` — `push` a `main`, `schedule` (`0 */6 * * *`), `workflow_dispatch` (con parámetro `target`:
`staging` | `production`)

1. `concurrency: deploy-${{ inputs.target }}` (una sola ejecución a la vez, sin cancelar a medias).
2. Checkout, Node 22 con caché de npm, `npm ci`.
3. Restaurar caché del último snapshot e imágenes (`actions/cache`).
4. `npm run data:fetch` con `PUBLIC_API_URL`, `HOTEL_ID`, `SITE_ORIGIN` → falla si no pasa los umbrales (02).
5. `npm run build` + `check-images.ts`.
6. **Humo previo al envío**: existen `dist/index.html`, `dist/habitaciones/index.html`, `dist/.htaccess`; el
   HTML contiene el nombre del hotel.
7. Subir por FTP con `SamKirkland/FTP-Deploy-Action` (versión fija): `local-dir: dist/`, `server-dir` del
   entorno, `protocol: ftps` si el hosting lo permite, `state-name` propio por entorno (sube solo lo que cambió),
   `exclude: **/.well-known/**, **/cgi-bin/**`, **sin** `dangerous-clean-slate`.
8. **Verificación posterior**: `curl -fsS https://<dominio>/` devuelve 200 y contiene el nombre del hotel; la
   ruta de una imagen optimizada responde 200. Si falla → el job falla y avisa (ver rollback).
9. Guardar `dist/` como artefacto del job (retención 14 días) para poder redistribuir una versión anterior.

### Secretos y variables

| Nombre | Tipo | Ejemplo / nota |
|---|---|---|
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | Secreto | por entorno (`staging` y `production`) |
| `FTP_PROTOCOL` | Variable | `ftps` o `ftp` |
| `FTP_DIR` | Variable | `/public_html/` o carpeta del subdominio de pruebas |
| `PUBLIC_API_URL`, `HOTEL_ID`, `SITE_ORIGIN`, `CLIENT` | Variable | por entorno |

Usar **Environments** de GitHub; `production` con aprobación manual requerida.

## `.htaccess` del sitio nuevo (todo dentro de `<IfModule>` para no romper si falta un módulo)

- Forzar HTTPS y un solo host canónico (con o sin `www`).
- `Options -Indexes`; `DirectoryIndex index.html`; `ErrorDocument 404 /404.html`.
- Compresión (`mod_deflate`) y caché: `/_astro/*` y `/images/*` → `max-age=31536000, immutable`;
  HTML → `no-cache` (revalidar siempre).
- Cabeceras de seguridad: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `Content-Security-Policy` ajustada (`connect-src` = `PUBLIC_API_URL`; `img-src 'self' data:`).
- Redirecciones 301 del sitio Angular anterior (lista en 06).
- Conservar cualquier regla propia del hosting detectada en el `.htaccess` actual.

## Plan de despliegue por fases

**Fase A — Staging** (no toca producción)
- [ ] Crear subdominio de pruebas apuntando a una carpeta aparte (pregunta 3). Evitar `/nuevo/` como
      subcarpeta: rompería rutas absolutas y el `Origin`.
- [ ] Registrar en el PMS el `Origin` del staging como `url` de un hotel de pruebas, o pedir a backend que
      acepte ese origen para La Cabaña (si no, el formulario dará 403 en staging).
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

- Un PR con un error de lint o un test roto **no** puede desplegarse.
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
