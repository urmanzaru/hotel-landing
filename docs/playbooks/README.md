# Playbooks — Sitio web de hotel alimentado por el PMS

Plan de implementación desde cero, dividido en playbooks ejecutables en orden. Cada playbook tiene **objetivo,
prerrequisitos, entregables, pasos, criterios de aceptación verificables y riesgos**.

## Decisión en una línea

**TypeScript + Astro generando un sitio 100 % estático (HTML/CSS/JS plano), construido en GitHub Actions y subido por
FTP.** El servidor solo tiene que servir archivos: no necesita PHP, Node ni configuración. Detalle y alternativas en
[00](./00-decisiones-y-arquitectura.md).

## Índice, orden y estado

| #   | Playbook                                                       | Resultado                                                             | Depende de                 | Estado       |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------- | ------------ |
| 00  | [Decisiones y arquitectura](./00-decisiones-y-arquitectura.md) | Stack elegido, alcance v1, riesgos                                    | —                          | ✅ Aprobado  |
| 01  | [Scaffold del proyecto](./01-scaffold-proyecto.md)             | Repo Astro + TS con lint/test/build                                   | 00                         | ✅ Completo  |
| 02  | [Capa de datos (API del PMS)](./02-capa-de-datos-api.md)       | Cliente de API, snapshot, pipeline de imágenes                        | 01                         | 🟡 Falta verificar contra la API real |
| 03  | [Sistema de diseño](./03-sistema-de-diseno.md)                 | Tokens, tipografía, componentes base (ui-ux-pro-max)                  | 01                         | ✅ Completo  |
| 04  | [Páginas y contenido](./04-paginas-y-contenido.md)             | Inicio, habitaciones, galería, ubicación, contacto, políticas (es/en) | 02, 03                     | 🟡 Falta ver con datos reales    |
| 05  | [Cotización](./05-cotizacion.md)                               | Formulario que hace `POST /receiveCotization`                         | 02, 03                     | 🟡 Falta humo con la API real |
| 06  | [SEO, rendimiento y accesibilidad](./06-seo-rendimiento-accesibilidad.md) | Metadatos, JSON-LD, presupuestos, WCAG AA                  | 04, 05                     | 🟡 Falta validar con el sitio publicado |
| 07  | [CI/CD y despliegue por FTP](./07-ci-cd-y-despliegue-ftp.md)   | Pipeline, publicación y rollback                                      | 01 (esqueleto), 06 (final) | ⏭ Siguiente |
| 08  | [Pruebas y calidad](./08-pruebas-y-calidad.md)                 | Unit, e2e, checklist de release                                       | transversal                | Continuo     |
| 09  | [Operación y replicación a otros hoteles](./09-operacion-y-nuevos-clientes.md) | Runbooks, pedidos al backend, alta de cliente         | 07                         | Pendiente    |

```
00 → 01 ─┬→ 02 ─┬→ 04 ─┐
         │      └→ 05 ─┼→ 06 → 07(final) → 09
         └→ 03 ────────┘
         └→ 07(esqueleto, en paralelo)        08 acompaña a todos
```

## Decisiones tomadas

| Tema                       | Decisión                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API en esta etapa          | `https://apihotel-dev.spinoff.website` (entorno de pruebas). La API de producción es otra y su URL se define después (`PUBLIC_API_URL`).                                                                                                                                                                                                  |
| Origen en desarrollo       | El PMS tiene registrado `http://localhost:4202` como `url` del hotel. **El sitio siempre debe correr en el puerto 4202** (`npm run dev`); si está ocupado, el comando falla a propósito.                                                                                                                                                  |
| Hosting                    | Solo FTP. **No hay acceso al servidor ni al dominio** y no se puede pedir nada más. Se descarta el staging en subdominio; ver el ajuste en [07](./07-ci-cd-y-despliegue-ftp.md).                                                                                                                                                         |
| Logo                       | Solo existe el PNG (≈770 px). Se usa tal cual en tamaños pequeños y se vectoriza si hace falta (ver [03](./03-sistema-de-diseno.md)).                                                                                                                                                                                                    |

## Preguntas abiertas

1. **Origen de producción registrado en el PMS.** Cuando haya dominio definitivo, el campo `url` del hotel en el PMS
   (o en el PMS de producción) debe coincidir con él; si no, la API responde 403 y el formulario no funciona.
   *No bloquea el desarrollo.*
2. **¿Acepta el hosting conexiones FTP desde GitHub Actions?** Algunos limitan por IP. Si no, el plan B es construir en
   tu equipo y subir `dist/` con tu cliente FTP. Se averigua en 07 con un despliegue de prueba, no antes.
3. **¿FTP plano o FTPS?** Se prueba en 07; si solo hay FTP plano, se rota la contraseña tras el lanzamiento.
4. **Idiomas.** Se asume español (principal) + inglés.

## Skill ui-ux-pro-max (necesaria para el playbook 03) — ✅ instalada

Como el trabajo se hace en la nube y `/plugin` no está disponible, la skill se instaló **como skill de proyecto**
con el comando oficial de su repositorio:

```bash
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max --agent claude-code -y
```

- Queda en `.claude/skills/ui-ux-pro-max/` y se versiona (`skills-lock.json` fija el hash). Cualquier sesión de
  Claude Code que abra el repo la tiene, sin instalar nada.
- Antes de añadirla se revisó: son datos CSV/JSON y scripts Python locales, **sin red, sin `subprocess`, sin
  `eval`**, y sin archivos ejecutables.
- Los scripts se invocan con `python3 .claude/skills/ui-ux-pro-max/scripts/search.py ...` desde la raíz (el
  `SKILL.md` usa `${CLAUDE_PLUGIN_ROOT}`, que solo existe en modo plugin; ver `CLAUDE.md`).
- Actualizar: `npx skills update`. Quitar: `npx skills remove ui-ux-pro-max`.

## Supuestos (corrígelos si no aplican)

- Alcance v1 según tu mensaje: **imágenes, tipos de habitación y cotizar**. Sin portadas (`/card?type=1`) y sin
  disponibilidad/planes/tarifas (`/roomAvailable` da 403 y `/plan` da 401 en dev).
- La API no se pudo consultar desde el entorno de Claude Code en la nube (su proxy bloquea los hosts). Lo que se sabe
  de ella sale de `api-endpoints.md` y se verifica en el paso 1 del playbook 02, **que debe correr en un equipo con
  acceso a la API** (el tuyo) o con el host permitido en el entorno.
- Cada cliente (hotel) recibe **su propio sitio** desde este mismo código, con configuración y tema por cliente.

## Cómo usar un playbook

1. Leer prerrequisitos y confirmar que están cumplidos.
2. Ejecutar los pasos en orden, marcando las casillas.
3. Correr los comandos de *Criterios de aceptación*; si alguno falla, el playbook no está terminado.
4. Un commit por playbook (o por paso grande) en la rama de trabajo.
