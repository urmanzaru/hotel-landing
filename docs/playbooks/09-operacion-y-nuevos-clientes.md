# 09 — Operación y replicación a otros hoteles

**Objetivo:** que el equipo pueda operar el sitio, replicarlo para otro cliente del PMS en horas y pedir al backend
las mejoras que lo hacen más robusto.

**Prerrequisitos:** 07 desplegado en producción para operar de verdad. Todo lo que no depende del despliegue
(código, guías, ensayo de alta y de fallos) ya está hecho.

> **Estado: 🟡 código y documentación completos; falta lo que depende de GitHub, el hosting y el backend.**
> Decisiones: **un repositorio, varios hoteles** (Environments `<hotel>-staging` / `<hotel>-production`) y las
> peticiones al backend como documento en el repo.

## Entregables (hechos)

| Archivo | Qué hace |
| --- | --- |
| [`docs/runbooks/nuevo-cliente.md`](../runbooks/nuevo-cliente.md) | Sección A paso a paso: PMS, código, logo, hosting, GitHub, lanzamiento, semana 1. |
| [`docs/runbooks/operacion.md`](../runbooks/operacion.md) | Sección B: cada síntoma con diagnóstico, acción y **cómo se ensayó**; monitoreo. |
| [`docs/backend/peticiones.md`](../backend/peticiones.md) | Sección C en formato de ticket, con `curl` reproducible y lo esperado. |
| `npm run client:new` (`scripts/new-client.ts`, `src/lib/new-client.ts`) | Crea `clients/<slug>.config.ts` con datos validados, lo registra en `clients/index.ts` y asigna su puerto de desarrollo. |
| `clients/index.ts` + `tests/unit/clients.test.ts` | Registro de hoteles; la prueba falla si un cliente no está registrado o tiene datos inválidos. |
| `.github/workflows/deploy.yml` + `npm run deploy:matrix` (`src/lib/deploy-matrix.ts`) | Job `plan`: qué hotel va a qué Environment (manual, push, programado, aviso del PMS). Variable `AUTO_TARGETS`. Escucha `repository_dispatch: pms-content-updated` (C.3). |
| `npm run brand:assets` | Logo e iconos **del cliente elegido** con `CLIENT` (antes, fijo en La Cabaña; la salida de La Cabaña no cambia). |
| `src/data/slug-aliases.ts` | Si el PMS renombra una habitación, el slug anterior queda como alias: 301 en el `.htaccess` y página de respaldo, en es/en. Antes el runbook pedía editar a mano un `public/.htaccess` que ya no existe. |
| `tests/unit/contrast.test.ts` | Ahora también revisa los colores del tema de **cada cliente**. |

## A. Alta de un nuevo hotel cliente

Checklist resumido; los comandos están en la [guía de alta](../runbooks/nuevo-cliente.md).

1. **PMS**: el hotel existe, tiene `url` = dominio exacto del sitio (con `https://` y con/sin `www` según
   corresponda), imágenes y tipos de habitación activos. *Sin esto la API responde 403.*
2. **Código**: `npm run client:new -- <slug> --hotel-id … --lat … --lng …` y revisar el archivo (horas, WhatsApp,
   Turnstile).
3. **Logo y marca**: `docs/brand/<slug>-logo-source.png` → `CLIENT=<slug> npm run brand:assets`; colores en
   `theme` (el contraste lo vigila `npm test`).
4. **GitHub**: Environments `<slug>-staging` y `<slug>-production` con los secretos y variables de 07, y el hotel
   en `AUTO_TARGETS`.
5. **Hosting**: FTP/FTPS, respaldo del sitio vigente, reglas propias en `clients/<slug>.htaccess`. (El staging va
   en una subcarpeta del dominio: no hay subdominio de pruebas, ver 07.)
6. **Contenido**: revisar con el hotel las políticas y las descripciones en es/en.
7. **Lanzamiento**: checklist de 08 → cutover de 07.
8. **Post-lanzamiento (semana 1)**: revisar cotizaciones recibidas, errores del formulario, Search Console.

## B. Runbooks

En [`docs/runbooks/operacion.md`](../runbooks/operacion.md). Cambios respecto al plan original:

- «El formulario no envía»: el diagnóstico era `curl -X POST`, que **crea registros en el PMS** (la API no valida).
  Ahora es `npm run api:verify` con el `SITE_ORIGIN` del sitio (solo `GET` y el preflight).
- «Se renombró una habitación»: ya no requiere intervención (alias automáticos).
- «Datos viejos» y «falla el build» incluyen `AUTO_TARGETS`, el job `plan` y `data:assert-live`.

Monitoreo mínimo: monitor de disponibilidad externo gratuito (UptimeRobot o similar) sobre la portada de cada hotel
y un chequeo semanal manual del formulario.

## C. Peticiones al backend del PMS (por prioridad)

Redactadas como tickets, con ejemplo reproducible, en [`docs/backend/peticiones.md`](../backend/peticiones.md). La
del webhook (3) ya está lista del lado del sitio: `deploy.yml` escucha `pms-content-updated`.

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

- [x] Un desarrollador que no participó puede dar de alta un segundo hotel (en staging) siguiendo solo la sección A.
      *Ensayado con `hotel-mar` en una copia del repo hasta el build, `dev` y la matriz de despliegue; el ensayo
      encontró y dejó corregidos dos fallos ([operación](../runbooks/operacion.md#ensayo-en-la-nube-2026-11-05)). Falta
      la parte de GitHub y hosting, que depende de 07.*
- [ ] Cada runbook de B se ensayó al menos una vez (simulando el fallo). *Cubiertos por pruebas automáticas que
      simulan el fallo (columna «Ensayo») y la API inaccesible a mano; quedan el rollback y el aviso del PMS, que
      necesitan el despliegue real.*
- [ ] Las peticiones de C están registradas como tickets con su ejemplo reproducible. *Redactadas en
      `docs/backend/peticiones.md`; falta pasarlas al gestor del backend.*
