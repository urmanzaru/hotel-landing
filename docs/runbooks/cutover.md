# Runbook — publicar el sitio (staging, cutover y rollback)

Resumen operativo del [playbook 07](../playbooks/07-ci-cd-y-despliegue-ftp.md). Todo se publica con el workflow
**Deploy** (`.github/workflows/deploy.yml`); no se toca el servidor salvo para descargar el respaldo. Un mismo
repositorio publica varios hoteles (playbook 09): `<hotel>` es su slug en `clients/` (`lacabana`, …) y cada
*Run workflow* pide el hotel (`client`) y el destino (`target`).

## 1. Configuración en GitHub (una vez por hotel)

**Settings → Environments**: crear `<hotel>-staging` y `<hotel>-production` (p. ej. `lacabana-staging`). En
`<hotel>-production`, activar *Required reviewers*.

| Dónde | Nombre | `<hotel>-staging` | `<hotel>-production` |
| --- | --- | --- | --- |
| Secreto del Environment | `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | los del hosting | los del hosting |
| Variable del Environment | `FTP_PROTOCOL` | `ftps` (o `ftp` si no hay otra) | igual |
| Variable del Environment | `FTP_DIR` | carpeta de la subcarpeta, **con `/` final** (p. ej. `/public_html/nuevo/`) | raíz, con `/` final (`/public_html/`) |
| Variable del Environment | `BASE_PATH` | `/nuevo/` | vacío |
| Variable del Environment | `NOINDEX` | `1` | vacío |
| Variable del Environment | `SITE_ORIGIN` | `https://<dominio>` (sin ruta) | `https://<dominio>` |
| Variable del Environment | `SITE_URL` | `https://<dominio>/nuevo/` | `https://<dominio>/` |
| Variable del Environment | `PUBLIC_API_URL`, `HOTEL_ID` | API del PMS que corresponda | API de producción |
| Variable del repositorio | `AUTO_TARGETS` | JSON hotel → destino de los despliegues automáticos: `{"lacabana":"staging"}` cuando lo anterior esté listo; `"production"` tras el cutover. Vacía = sin automáticos. | (una sola para todos los hoteles) |

Con `AUTO_TARGETS`, cada hotel listado se reconstruye cada 6 h y cuando el PMS avisa
([peticiones al backend § 3](../backend/peticiones.md)) hacia su destino, y cada `push` a `main` va a su staging. El
hotel ya no es una variable: sale de la ejecución (`client`).

> `SITE_ORIGIN` debe coincidir **exactamente** con el campo `url` del hotel en el PMS; si no, la API responde 403
> (el build no obtiene datos y el formulario no envía).

Las credenciales solo van como secretos: nunca en el repositorio, en `.env` versionado ni en el chat.

## 2. Primer despliegue de prueba (preguntas abiertas 2 y 3)

1. *Actions → Deploy → Run workflow*: `client = <hotel>`, `target = staging`, **`dry_run = true`**. Responde dos preguntas:
   - Si conecta, Actions puede llegar al FTP del hosting (pregunta 2). Si da tiempo de espera o se rechaza la conexión,
     el hosting limita por IP → **plan B** (abajo).
   - Si `ftps` funciona (pregunta 3). Si falla el TLS, probar `FTP_PROTOCOL=ftp` y **rotar la contraseña** tras el
     lanzamiento.
2. Si `data:fetch` falla con 403 o tiempo de espera, la API no acepta las peticiones desde GitHub (el origen del
   build o la red): resolverlo con el backend antes de seguir.
3. Repetir con `dry_run = false`. El job termina con «Verificar el sitio publicado» en verde.

## 3. Staging

- Recorrer el checklist de release del playbook 08 en `https://<dominio>/nuevo/`.
- El staging no se indexa: `noindex` en cada página, `X-Robots-Tag` en su `.htaccess` y `robots.txt` que bloquea.
- **Ojo**: mientras la raíz sea el Angular, su `.htaccess` (el actual, de 201 bytes) también se aplica a `/nuevo/`. Si
  ese archivo reescribe todo hacia `index.html` (típico de Angular), puede tapar las páginas del staging: leerlo
  antes (paso 4) y, si hace falta, añadir una excepción para `/nuevo/` en ese archivo.
- El formulario solo envía si el dominio está registrado como `url` del hotel en el PMS; si no, el huésped ve el
  mensaje de error con WhatsApp/correo (es lo esperado hasta que backend lo registre).

## 4. Cutover (ventana de baja actividad)

1. **Respaldo**: descargar TODA la raíz actual por FTP a `backup-AAAAMMDD/` (fuera del repo), incluido el `.htaccess`.
   Comprobar que los tamaños coinciden con los del servidor.
2. **Reglas propias del hosting**: leer el `.htaccess` del respaldo. Lo que sea del hosting (versión de PHP,
   `SetEnv`, reglas de seguridad del panel…) se copia a `clients/<cliente>.htaccess` (se antepone al generado en cada
   build). **No** copiar la regla de Angular que reescribe todo a `index.html`.
3. *Run workflow* con `client = <hotel>`, `target = production` y aprobar. El job:
   - descarga datos reales y se niega a publicar datos de muestra (`data:assert-live`);
   - comprueba `dist/` (sin `noindex`, `.htaccess` correcto, sin datos fiscales) antes de subir;
   - sube solo lo nuevo, **sin borrar** `.well-known/`, `cgi-bin/` ni los archivos de Angular;
   - verifica la portada, una imagen, el 301 de cada ruta antigua y que el `.htaccess` no se pueda descargar.
4. Verificación manual:
   ```bash
   curl -sI https://<dominio>/ | grep -iE "^(HTTP|content-security|cache-control|x-content-type)"
   curl -sI https://<dominio>/roomTypes        # 301 → /habitaciones/
   curl -sI http://<dominio>/                  # 301 → https://
   curl -sI https://<dominio>/.well-known/     # sigue accesible (no redirige a otra página)
   ```
   Y una cotización real de prueba (`PRUEBA …`): anotar el `id` y avisar para borrarla.
5. En `AUTO_TARGETS`, `"<hotel>":"production"` para que la reconstrucción cada 6 h vaya a producción.
6. A los **7 días** estables, borrar por FTP los archivos de Angular (`main-*.js`, `chunk-*.js`, `polyfills-*.js`,
   `styles-*.css`, `assets/`). Nunca `.well-known/` ni `cgi-bin/`.

## 5. Rollback (objetivo < 10 minutos)

- **Rápido (versión anterior del sitio nuevo)**: *Run workflow* con `client`, `target` y `redeploy_run_id` = id de una ejecución
  verde anterior (está en la URL de la ejecución). Sube su `dist/` guardado (14 días) sin reconstruir.
- **Volver al sitio anterior (Angular)**: subir por FTP el contenido de `backup-AAAAMMDD/` a la raíz (sobrescribe),
  **incluido su `.htaccess`**. Antes, en `AUTO_TARGETS`, poner ese hotel en `"staging"` (o quitarlo) para que la
  reconstrucción programada no lo pise.
- Registrar la causa y no reintentar hasta entenderla.

## Plan B sin GitHub Actions (el hosting bloquea sus IP)

En tu equipo, con las mismas variables que el Environment:

```bash
npm ci
```

```bash
npm run data:fetch && npm run data:assert-live && npm run build && npm run deploy:check
```

Subir el **contenido** de `dist/` (incluido el `.htaccess`, que es un archivo oculto) con tu cliente FTP, sin borrar
`.well-known/` ni `cgi-bin/`. Después:

```bash
npm run deploy:verify -- https://<dominio>/
```

## Qué hace el `.htaccess` generado

`scripts/write-htaccess.ts` (se ejecuta solo tras `npm run build`; probado en Apache real con `npm run test:apache`):

- https y host canónico (de `SITE_ORIGIN`), excepto `.well-known/`.
- 301 desde las rutas del Angular (`/roomTypes` → `/habitaciones/`, etc.) y desde los slugs anteriores de
  habitaciones renombradas en el PMS.
- `Options -Indexes`, `ErrorDocument 404`, compresión, tipos para WebP/woff2.
- Cabeceras: CSP (los scripts en línea por hash; `connect-src` a la API), `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Frame-Options`; `X-Robots-Tag` en staging.
- Caché: HTML `no-cache`; `_astro/` un año inmutable; `img/` una semana; el resto un día.
