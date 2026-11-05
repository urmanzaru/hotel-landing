# 09 — Operación y replicación a otros hoteles

**Objetivo:** que el equipo pueda operar el sitio, replicarlo para otro cliente del PMS en horas y pedir al backend
las mejoras que lo hacen más robusto.

**Prerrequisitos:** 07 desplegado en producción.

## A. Alta de un nuevo hotel cliente (checklist)

1. **PMS**: el hotel existe, tiene `url` = dominio exacto del sitio (con `https://` y con/sin `www` según
   corresponda), imágenes y tipos de habitación activos. *Sin esto la API responde 403.*
2. **Código**: crear `clients/<slug>.config.ts` (`hotelId`, `origin`, idiomas, tema, coordenadas, WhatsApp,
   redes, imagen del hero opcional) y los tokens de marca (sección "tokens por cliente" de 03).
3. **Logo y marca**: logo vectorial, colores y tipografía aprobados; revisar contraste.
4. **GitHub**: crear `Environments` (`staging`, `production`) con secretos y variables de 07 para el cliente
   (un workflow por cliente o una matriz por `CLIENT`).
5. **Hosting**: FTP/FTPS, subdominio de pruebas, respaldo del sitio vigente.
6. **Contenido**: revisar con el hotel las políticas y las descripciones en es/en.
7. **Lanzamiento**: checklist de 08 → cutover de 07.
8. **Post-lanzamiento (semana 1)**: revisar cotizaciones recibidas, errores del formulario, Search Console.

## B. Runbooks

| Síntoma | Diagnóstico | Acción |
|---|---|---|
| El sitio muestra datos viejos | ¿Falló el último `deploy.yml` programado? | Re-ejecutar con `workflow_dispatch`; revisar el paso `data:fetch`. |
| El build falla en `data:fetch` | 403 → `Origin`/`SITE_ORIGIN` mal; 5xx → API caída; esquema → cambió el PMS | Corregir la variable, esperar a la API o ajustar el esquema (la prueba de contrato lo muestra). |
| Imagen no aparece (placeholder) | La API devuelve 404 para esa imagen (`reports/broken-images.json`) | Pedir al hotel que la vuelva a subir al PMS; el siguiente build la recoge. |
| Formulario responde "no pudimos enviarla" | Probar `curl -X POST` con el mismo `Origin`; 403 → `url` del hotel mal registrada | Corregir en el PMS; mientras tanto el huésped ve WhatsApp/correo. |
| Muchos registros basura en cotizaciones | Spam directo a la API | Activar Turnstile (05) y pedir rate limit a backend. |
| Cambió el nombre de una habitación y se rompió un enlace | Cambió el slug | Agregar `Redirect 301` en `public/.htaccess`. |
| Sitio caído tras un deploy | Cambio de código o `.htaccess` | Rollback de 07. |

Monitoreo mínimo: monitor de disponibilidad externo gratuito (UptimeRobot o similar) sobre la portada y un chequeo
semanal manual del formulario.

## C. Peticiones al backend del PMS (por prioridad)

Todas salen del levantamiento `api-endpoints.md`.

1. **`GET /hotel` debe filtrar por `Origin`** (hoy devuelve los 4 hoteles con RFC, razón social, correos y
   teléfonos). Es una fuga de datos y, además, obliga a elegir por id fijo.
2. **`POST /receiveCotization`**: validar campos obligatorios y tipos (hoy `POST {}` crea registros vacíos), arreglar
   la hora fija `15:04:05` (usa el *layout* de `time.Format` de Go como valor), responder 400 ante JSON o tipos
   inválidos (hoy 404), y limitar tasa por IP.
3. **Webhook de publicación**: al guardar cambios en datos que alimentan el sitio, llamar
   `POST https://api.github.com/repos/<org>/<repo>/dispatches` (`event_type: pms-content-updated`) con un token
   de alcance mínimo; el workflow `deploy.yml` lo escucha. Reemplaza el cron.
4. **Coordenadas del hotel**: hoy `latitude: "-1811156.55"`, `longitude: "19.1561651"` (inválidas y probablemente
   invertidas).
5. **16 imágenes que dan 404** (incluye todos los fondos de `/locationBlog`) y limpieza de datos de prueba
   ("ZZ PRUEBA PB-14…") visibles en dev.
6. **Códigos de estado**: id inexistente → 404 (hoy 500); consistencia de `status` (string) y de `chargeType`.
7. **Disponibilidad pública** (fuera de v1): decidir si `/roomAvailable` y `/plan` serán públicos por `Origin`
   (hoy 403/401). Es la condición para una v2 con "ver disponibilidad".
8. **Borrar** las cotizaciones de prueba del levantamiento (`6aeadb410b5d2e0501f905ba`, `6aeadb9f0b5d2e0501f905bb`).

## D. Hoja de ruta posterior a v1 (no comprometida)

- Disponibilidad y tarifas en línea (depende de C.7) y paso a reserva.
- Sección de ubicación/blog con `card?type=2` cuando las imágenes estén reparadas.
- Reseñas, analítica sin cookies, versión en otros idiomas.
- Panel "Contenido del sitio" en el PMS (textos de la portada, orden de fotos) para reducir la dependencia de
  cambios de código.

## Criterios de aceptación

- Un desarrollador que no participó puede dar de alta un segundo hotel (en staging) siguiendo solo la sección A.
- Cada runbook de B se ensayó al menos una vez (simulando el fallo).
- Las peticiones de C están registradas como tickets con su ejemplo reproducible.
