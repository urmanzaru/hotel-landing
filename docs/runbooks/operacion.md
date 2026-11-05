# Runbook — operación del sitio

Sección B del [playbook 09](../playbooks/09-operacion-y-nuevos-clientes.md). Cada síntoma tiene su diagnóstico, la
acción y **cómo se ensayó** (la prueba automática o el comando que simula el fallo). `<hotel>` es el slug de
`clients/` (`lacabana`, …).

## Síntomas

| Síntoma | Diagnóstico | Acción | Ensayo |
| --- | --- | --- | --- |
| El sitio muestra datos viejos | *Actions → Deploy*: ¿falló la última ejecución de ese hotel? ¿Está en `AUTO_TARGETS`? | *Run workflow* con el hotel y el destino; revisar el paso «Datos del PMS». Si la API cayó, el sitio sigue con el último snapshot bueno (no se rompe). | `pipeline.test.ts` («con la API caída usa el último snapshot bueno») |
| El build falla en «Datos del PMS» | **403** → `SITE_ORIGIN` no coincide con la `url` del hotel en el PMS. **5xx/tiempo de espera** → API caída y sin caché. **Esquema** → el PMS cambió la forma de los datos. **«0 habitaciones activas»** → datos inservibles. | Corregir la variable del Environment o la `url` en el PMS; esperar a la API; ajustar `src/data/schemas.ts` con lo que muestre `npm run api:verify`. | `api-client.test.ts` (403, 5xx, tiempo de espera), `pipeline.test.ts` (sin caché, datos inservibles) |
| Falla «Nunca publicar datos de muestra» | El snapshot es de MUESTRA: no se llegó a pedir datos reales. | Revisar el paso anterior; nunca saltarse esta comprobación. | `fixture-data.test.ts` (`data:assert-live`) |
| Falla «Humo previo a la subida» | `deploy:check`: falta una página, `noindex` en producción, `.htaccess` incoherente o **datos fiscales** en `dist/`. | Leer el mensaje: dice el archivo y qué encontró (sin el valor). Datos fiscales = un mapper los deja pasar: arreglarlo antes de publicar. | `deploy-checks.test.ts` |
| Falla «Verificar el sitio publicado» o el sitio está caído tras un despliegue | Cambio de código, de `.htaccess` o el hosting no aplica alguna regla. | **Rollback**: *Run workflow* con `redeploy_run_id` de una ejecución verde anterior ([cutover § 5](./cutover.md#5-rollback-objetivo--10-minutos)). | `deploy-checks.test.ts`, `apache.test.ts` (`deploy:verify` contra Apache real) |
| Avisos en «Verificar el sitio publicado» | El hosting ignora parte del `.htaccess` (CSP, caché, algún 301). | No es urgente: las páginas de respaldo cubren las rutas antiguas. Pedir al hosting `AllowOverride` (FileInfo, Indexes) o `mod_headers`. | `deploy-checks.test.ts` («hosting que ignora cabeceras o redirecciones») |
| Una imagen no aparece (se ve el marcador) | La API devuelve 404 o un archivo dañado para esa imagen: lista en `reports/broken-images.json` (artefacto local de `data:fetch`). | Pedir al hotel que la vuelva a subir al PMS; el siguiente build la recoge. | `pipeline.test.ts` («una imagen 404 se reporta y se omite») |
| El formulario responde «no pudimos enviarla» | Consola del navegador: el motivo exacto. **403** → la `url` del hotel en el PMS no es el dominio del sitio. | Corregir la `url` en el PMS. Mientras tanto el huésped ve WhatsApp, teléfono y correo. Diagnóstico **sin crear registros**: `CLIENT=<hotel> SITE_ORIGIN=https://<dominio> npm run api:verify` (solo GET y el preflight). **No** probar con `curl -X POST`: cada POST crea un registro en el PMS, aunque esté vacío. | `quote.spec.ts` (403, 500, tiempo de espera) |
| Muchas cotizaciones basura | Spam directo a la API (el `Origin` se falsifica fuera del navegador). | Activar Turnstile (`quote.turnstileSiteKey`, 05) y pedir al backend validación y límite por IP ([peticiones § 2](../backend/peticiones.md)). | `quote.spec.ts` (señuelo, envío en < 3 s) |
| Se renombró una habitación y el enlace antiguo da 404 | El slug sale del nombre en el PMS. | **Nada que hacer**: el build compara con el último snapshot bueno y genera el 301 del slug anterior (y una página de respaldo). Solo si se perdió la caché de GitHub, añadir el `RedirectMatch 301` a mano en `clients/<hotel>.htaccess`. | `slug-aliases.test.ts`, `pipeline.test.ts` («renombra una habitación»), `build-variants.test.ts` |
| Un hotel nuevo no aparece en *Run workflow* | El campo `client` es libre: escribir el slug. Si no existe en `clients/`, el job «Qué se publica» lo rechaza y lista los disponibles. | Dar de alta el hotel ([nuevo cliente](./nuevo-cliente.md)). | `deploy-matrix.test.ts` |
| Un hotel no se reconstruye solo | No está en `AUTO_TARGETS`, o la variable no es JSON válido (el job «Qué se publica» falla y lo dice). | Corregir `AUTO_TARGETS` (*Settings → Variables*), p. ej. `{"lacabana":"production"}`. | `deploy-matrix.test.ts` |

## Ensayo en la nube (2026-11-05)

Además de las pruebas automáticas, se ensayó a mano:

- **API inaccesible** (el proxy de la nube la bloquea): `npm run data:fetch` termina con error, explica la causa y
  **no** toca el snapshot existente.
- **Alta de un segundo hotel** (`hotel-mar`, Cancún) en una copia del repo siguiendo solo la
  [guía de alta](./nuevo-cliente.md): `client:new` (también con datos malos y repetido), `brand:assets`, tema de
  color, tipos + lint + pruebas, build (origen `:4203`, su logo y su color; sin datos fiscales; imágenes bien),
  `dev` en el 4203 y `deploy:matrix` manual y programado. El ensayo encontró dos fallos, ya corregidos y con
  prueba: `client:new` rechazaba `--lng -86.85` (toda longitud de México es negativa), y la prueba de contraste
  **no** revisaba los colores de cada cliente (un color de marca ilegible pasaba).

## Monitoreo

- **Disponibilidad**: un monitor externo gratuito (UptimeRobot o similar) por hotel sobre la portada de producción,
  cada 5 minutos, con aviso por correo. Se configura fuera del repo (no hay acceso al servidor).
- **Despliegues**: GitHub avisa por correo cuando falla una ejecución programada de *Deploy* (a quien editó el
  workflow por última vez; conviene que sea una cuenta que alguien lea).
- **Formulario**: una vez por semana, una cotización real con nombre `PRUEBA …`; anotar el id para que backend la
  borre.
