# 00 — Decisiones y arquitectura

## Contexto y restricciones

| Restricción | Consecuencia |
|---|---|
| Solo hay acceso **FTP**; no se puede configurar el servidor | El resultado final debe ser **archivos estáticos**. Nada que requiera Node, PHP o reglas de servidor para funcionar. |
| Apache (hay `.htaccess`, `cgi-bin`, `.well-known`) | Se puede afinar caché/HTTPS con `.htaccess`, pero el sitio no debe depender de eso. Conservar `.well-known` (certificado SSL). |
| El PMS alimenta el sitio vía API | El contenido (hotel, imágenes, tipos de habitación) viene de la API; no se escribe a mano. |
| La API es **multi-tenant por cabecera `Origin`** | El navegador la envía solo, pero el *build* (Node/CI) tiene que fijarla a mano. |
| `/roomAvailable` → 403, `/plan` → 401 | Disponibilidad y planes quedan fuera de v1. El sitio cotiza, no reserva. |
| Cada cliente-hotel recibe su sitio | Un código base, configuración y tema por cliente (white-label). |

## Decisión: TypeScript + Astro (salida estática)

| Opción | Veredicto | Motivo |
|---|---|---|
| **Astro + TypeScript, `output: 'static'`** | ✅ Elegida | Envía ~0 KB de JS por defecto, HTML real para SEO, imágenes optimizadas en build, i18n por carpetas (no requiere rewrites), el resultado son archivos para FTP. |
| Angular (el sitio actual) | ❌ | Ya existe y pesa: solo los chunks suman ~870 KB de JS. SEO débil sin SSR; su valor (SPA) no se necesita en un sitio de contenido. |
| PHP en el servidor | ❌ | No sabemos si el hosting lo tiene, y no podemos configurarlo. Habría que escribir y mantener backend. |
| WordPress / CMS | ❌ | Duplica el contenido que ya administra el PMS. |
| Next.js `export` / Eleventy | ➖ | Funcionan, pero Next envía más JS y Eleventy tiene peor ecosistema de imágenes/TS. |

JavaScript propio solo donde hace falta (formulario de cotización): TypeScript "vanilla" con mejora progresiva,
sin framework de UI. Se agrega Preact únicamente si 05 lo justifica.

## Arquitectura

```
 PMS (API, multi-tenant por Origin)
        │  build time: GET /hotel, /roomType, /imagen/{id}   (Origin fijado por el script)
        ▼
 GitHub Actions ── fetch-snapshot → optimiza imágenes → astro build → dist/
        │                                                               │ FTP(S)
        │  cron cada 6 h · botón manual · (futuro) webhook del PMS      ▼
        └───────────────────────────────────────────────  Hosting Apache (archivos estáticos)
                                                                        │
 Navegador del huésped ───────────────────────────────────────────────┘
        │  runtime: ÚNICA llamada → POST /receiveCotization (CORS, Origin automático)
        ▼
 PMS (recibe la cotización)
```

### Estrategia de datos

- **Snapshot en build**: `scripts/fetch-snapshot.ts` descarga los datos y deja un `snapshot.json` validado que
  consumen las páginas. Los datos del hotel casi no cambian; los tipos de habitación e imágenes cambian poco.
- **Frescura**: reconstrucción programada cada 6 h + disparo manual. Cuando backend lo permita, el PMS llama un
  `repository_dispatch` de GitHub al guardar cambios (ver 09).
- **Fallo de API**: si falla el fetch se usa el último snapshot bueno (caché de Actions). Si no hay ninguno, el
  build **falla** y no se despliega: nunca se publica un sitio vacío.
- **Runtime**: el navegador solo llama a `POST /receiveCotization`. Así el sitio carga rápido y no expone `/hotel`.

### Privacidad (hallazgo en `api-endpoints.md`)

`GET /hotel` devuelve **todos los hoteles** con RFC, razón social, correo y teléfonos. Por eso:

- Se llama **solo en build**, nunca desde el navegador.
- Se elige el hotel por `HOTEL_ID` explícito (no por posición ni por heurística de URL).
- Se copia al snapshot una **lista blanca de campos públicos**; RFC, razón social, régimen CFDI y datos fiscales
  nunca llegan a `dist/`.

### White-label

`CLIENT=lacabana` selecciona `clients/lacabana.config.ts`: `hotelId`, dominio/origin, idiomas, tema (tokens),
coordenadas manuales, redes sociales, WhatsApp, destino FTP. Nuevo cliente = nuevo archivo + secretos (ver 09).

## Alcance

**v1 (dentro):** inicio, tipos de habitación (lista y detalle), galería, ubicación, contacto, políticas/privacidad,
cotización, es/en, SEO, despliegue automático.

**Fuera de v1:** portadas/`card` (indicado por ti), disponibilidad en línea, planes y tarifas, pagos, panel de
administración, "pandemia", blog de ubicación con `card?type=2` (sus 10 fondos devuelven 404 hoy; se puede
reactivar cuando backend los repare).

## Riesgos principales

| Riesgo | Mitigación |
|---|---|
| `Origin` de producción no registrado en el PMS → 403 | Pregunta abierta 2; verificación en 02 con `curl`. |
| 16 de 133 imágenes dan 404 | El pipeline las detecta, reporta y usa un placeholder; nunca deja `<img>` rotas. |
| Coordenadas del hotel inválidas en la API (`latitude: "-1811156.55"`) | Coordenadas manuales en la config del cliente. |
| `receiveCotization` no valida y guarda hora `15:04:05` | Validar en el cliente; enviar fechas como `YYYY-MM-DDT00:00:00.000Z` calculadas sin `Date` local; pedir arreglo a backend (09). |
| Subir por FTP sobrescribe el sitio vivo | Staging primero, respaldo completo y rollback documentado (07). |
| Un clic de "reconstruir" rompe producción por datos malos | Validación con esquema + umbrales (≥1 tipo de habitación activo, hotel presente) antes de desplegar. |
