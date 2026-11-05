# Runbook — dar de alta un hotel nuevo

Sección A del [playbook 09](../playbooks/09-operacion-y-nuevos-clientes.md), paso a paso. Todos los hoteles viven en
**este mismo repositorio**: cada uno es un archivo `clients/<slug>.config.ts` y dos Environments de GitHub
(`<slug>-staging` y `<slug>-production`). Un arreglo en el código llega a todos.

Se necesita: el **id del hotel en el PMS**, su **dominio**, sus **coordenadas** (Google Maps → clic derecho), el
**logo** (PNG grande o SVG) y el **acceso FTP** de su hosting.

## 1. PMS (lo hace quien administra el PMS)

- El hotel existe, con imágenes y al menos un tipo de habitación **activo**.
- Campo `url` del hotel = el origen exacto del sitio: en el PMS de **dev**, `http://localhost:<puerto>` (el que
  asigne el paso 2); en el de **producción**, `https://<dominio>` (con o sin `www`, el mismo que `SITE_ORIGIN`).
  Sin esto la API responde **403**: el build no obtiene datos y el formulario no envía.

## 2. Código

```bash
npm run client:new -- hotel-mar --hotel-id <id de 24 caracteres> --lat 21.1619 --lng -86.8515 --tz America/Cancun
```

Crea `clients/hotel-mar.config.ts`, lo registra en `clients/index.ts` y le asigna el siguiente puerto de desarrollo
libre (4203, 4204…; `--dev-port` para elegirlo). Revisar el archivo: horas de entrada y salida, WhatsApp
(`contact.whatsapp`) y, si el hotel lo quiere, `quote.turnstileSiteKey` (05).

Comprobar con la API (en un equipo con acceso; en la nube el proxy la bloquea):

```bash
CLIENT=hotel-mar npm run api:verify
```

```bash
CLIENT=hotel-mar npm run data:fetch
```

```bash
CLIENT=hotel-mar npm run dev
```

Sin `data:fetch`, `dev` y `build` usan datos de **muestra** (con `noindex`; nunca se publican).

## 3. Logo y marca

1. Guardar el original como `docs/brand/hotel-mar-logo-source.png`.
2. `CLIENT=hotel-mar npm run brand:assets` → `public/brand/hotel-mar-logo-*.webp` y los iconos.
3. En la config, descomentar `logoFile: 'hotel-mar-logo'`.
4. Colores: `theme` con sobrescrituras de tokens (`'--color-brand': '#…'`; lista en
   `docs/brand/design-system.md`). El contraste lo vigila `npm test` (`contrast.test.ts`): si falla, el color no
   sirve para texto.
5. Las tipografías son las del sistema de diseño (comunes a todos los hoteles).

Verificar y subir el cambio (rama → PR → `main`):

```bash
npm run verify
```

`tests/unit/clients.test.ts` falla si el archivo no está registrado o tiene datos inválidos (id, zona, coordenadas…).

## 4. Hosting

- FTP/FTPS: servidor, usuario y contraseña (solo como secretos de GitHub; nunca en el repo ni en el chat).
- **Respaldo** del sitio vigente antes de tocar nada ([cutover](./cutover.md), paso 4.1).
- Leer el `.htaccess` actual: las reglas propias del hosting van a `clients/hotel-mar.htaccess`.

## 5. GitHub (Settings → Environments)

Crear `hotel-mar-staging` y `hotel-mar-production` (este con *Required reviewers*) con los secretos y variables de la
tabla de [cutover § 1](./cutover.md#1-configuración-en-github-una-vez-por-hotel). Luego:

1. *Actions → Deploy → Run workflow*: `client = hotel-mar`, `target = staging`, `dry_run = true` (prueba de conexión).
2. Igual con `dry_run = false`. El job termina con «Verificar el sitio publicado» en verde.
3. Añadir el hotel a la variable del repositorio `AUTO_TARGETS`, p. ej.
   `{"lacabana":"production","hotel-mar":"staging"}`: desde ahí se reconstruye cada 6 h, con cada `push` a `main` y
   cuando el PMS avisa.

## 6. Contenido y lanzamiento

- Revisar con el hotel, en el staging, políticas, descripciones y textos en español e inglés (lo que falte en
  inglés se muestra en español).
- Checklist de release del [playbook 08](../playbooks/08-pruebas-y-calidad.md) → cutover ([runbook](./cutover.md)).
- Tras el cutover: `"hotel-mar":"production"` en `AUTO_TARGETS`.

## 7. Semana 1 después del lanzamiento

- Cotizaciones recibidas en el PMS (¿llegan, con el hotel y el día correctos?).
- Ejecuciones de **Deploy** de ese hotel: todas en verde y sin avisos nuevos.
- Search Console: alta del dominio, sitemap (`/sitemap.xml`) enviado, sin errores de cobertura.
- Monitor de disponibilidad sobre la portada ([operación](./operacion.md#monitoreo)).
