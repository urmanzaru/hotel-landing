# Playbooks — Sitio web de hotel alimentado por el PMS

Plan de implementación desde cero, dividido en playbooks ejecutables en orden. Cada playbook tiene **objetivo,
prerrequisitos, entregables, pasos, criterios de aceptación verificables y riesgos**. Ninguno se ejecuta hasta que
este plan sea revisado y aprobado.

## Decisión en una línea

**TypeScript + Astro generando un sitio 100 % estático (HTML/CSS/JS plano), construido en GitHub Actions y subido por
FTP.** El servidor solo tiene que servir archivos: no necesita PHP, Node ni configuración. Detalle y alternativas en
[00](./00-decisiones-y-arquitectura.md).

## Índice y orden

| # | Playbook | Resultado | Depende de |
|---|---|---|---|
| 00 | [Decisiones y arquitectura](./00-decisiones-y-arquitectura.md) | Stack elegido, alcance v1, riesgos | — |
| 01 | [Scaffold del proyecto](./01-scaffold-proyecto.md) | Repo Astro + TS con lint/test/build | 00 |
| 02 | [Capa de datos (API del PMS)](./02-capa-de-datos-api.md) | Cliente de API, snapshot, pipeline de imágenes | 01 |
| 03 | [Sistema de diseño](./03-sistema-de-diseno.md) | Tokens, tipografía, componentes base (ui-ux-pro-max) | 01 |
| 04 | [Páginas y contenido](./04-paginas-y-contenido.md) | Inicio, habitaciones, galería, ubicación, contacto, políticas (es/en) | 02, 03 |
| 05 | [Cotización](./05-cotizacion.md) | Formulario que hace `POST /receiveCotization` | 02, 03 |
| 06 | [SEO, rendimiento y accesibilidad](./06-seo-rendimiento-accesibilidad.md) | Metadatos, JSON-LD, presupuestos, WCAG AA | 04, 05 |
| 07 | [CI/CD y despliegue por FTP](./07-ci-cd-y-despliegue-ftp.md) | Pipeline, staging, cutover y rollback | 01 (esqueleto), 06 (final) |
| 08 | [Pruebas y calidad](./08-pruebas-y-calidad.md) | Unit, e2e, checklist de release | transversal |
| 09 | [Operación y replicación a otros hoteles](./09-operacion-y-nuevos-clientes.md) | Runbooks, pedidos al backend, alta de cliente | 07 |

```
00 → 01 ─┬→ 02 ─┬→ 04 ─┐
         │      └→ 05 ─┼→ 06 → 07(final) → 09
         └→ 03 ────────┘
         └→ 07(esqueleto, en paralelo)        08 acompaña a todos
```

## Preguntas abiertas (bloquean o cambian el plan)

1. **URL base de la API en producción.** Tu documento levanta `https://apihotel-dev.spinoff.website`. La URL que
   mencionaste (`https://www.lacabanapuertoangel.com/hotel`) es una ruta del sitio actual. ¿La API de producción es
   otra? Va en la variable `PUBLIC_API_URL`. *(Bloquea 02.)*
2. **Origin registrado en el PMS.** La API identifica el hotel por la cabecera `Origin`. En producción, el campo
   `url` del hotel debe coincidir exactamente con el dominio del sitio (con o sin `www`, `https`). *(Bloquea el
   formulario de cotización en producción.)*
3. **Hosting.** Por el `.htaccess` y `cgi-bin` parece Apache/cPanel. ¿Hay FTP simple o también FTPS/SFTP?
   ¿Puedes crear un subdominio de pruebas (p. ej. `nuevo.lacabanapuertoangel.com`) apuntando a otra carpeta?
   *(Define el staging en 07.)*
4. **¿El hosting acepta conexiones desde GitHub Actions?** Algunos limitan el FTP por IP. Si no, hay plan B manual
   (build local + subir `dist/`). *(07.)*
5. **Idiomas.** El PMS tiene campos en español e inglés. Se asume **es (principal) + en**.
6. **Plugin `ui-ux-pro-max`.** Los comandos `/plugin ...` los ejecutas tú en Claude Code; yo no puedo ejecutarlos
   desde esta sesión. Hay que correrlos antes del playbook 03:
   ```
   /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
   /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
   ```

## Supuestos (corrígelos si no aplican)

- Alcance v1 según tu mensaje: **imágenes, tipos de habitación y cotizar**. Sin portadas (`/card?type=1`) y sin
  disponibilidad/planes/tarifas (`/roomAvailable` da 403 y `/plan` da 401 en dev).
- La API no se pudo consultar desde este entorno (el proxy bloquea los hosts). Todo lo dicho sobre la API sale de
  `api-endpoints.md` y debe verificarse en el paso 1 del playbook 02.
- Cada cliente (hotel) recibe **su propio sitio** desde este mismo código, con configuración y tema por cliente.

## Cómo usar un playbook

1. Leer prerrequisitos y confirmar que están cumplidos.
2. Ejecutar los pasos en orden, marcando las casillas.
3. Correr los comandos de *Criterios de aceptación*; si alguno falla, el playbook no está terminado.
4. Un commit por playbook (o por paso grande) en la rama de trabajo.
