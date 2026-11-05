/**
 * Rutas del sitio Angular anterior y su equivalente en el sitio nuevo (playbook 06). Las usan:
 * - `.htaccess` (playbook 07): `htaccessRedirects()` genera las reglas 301, que es lo que conserva el posicionamiento.
 * - `src/pages/[legacy].astro`: una página de respaldo por ruta antigua (redirección inmediata + `canonical` +
 *   `noindex`), para que los enlaces antiguos funcionen aunque el `.htaccess` no esté o falle.
 *
 * `/selectRooms` era el paso de elegir habitaciones para pedir cotización → `/cotizar/`; `/pandemicInfo` era
 * información de condiciones de estancia → `/politicas/`. Las rutas antiguas no tenían versión en inglés.
 */
import type { RouteKey } from './routes.ts';
import { routes } from './routes.ts';

export const LEGACY_REDIRECTS: readonly { from: string; to: RouteKey }[] = [
  { from: '/hotel', to: 'home' },
  { from: '/roomTypes', to: 'rooms' },
  { from: '/locationBlog', to: 'location' },
  { from: '/contactUS', to: 'contact' },
  { from: '/quotation', to: 'quote' },
  { from: '/selectRooms', to: 'quote' },
  { from: '/pandemicInfo', to: 'policies' },
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reglas `RedirectMatch 301` de Apache (con y sin barra final), con la base del sitio (`/` o `/nuevo/`). */
export function htaccessRedirects(base: string): string {
  const prefix = base.replace(/\/+$/, '');
  return LEGACY_REDIRECTS.map(
    ({ from, to }) =>
      `RedirectMatch 301 ^${escapeRegex(`${prefix}${from}`)}/?$ ${prefix}${routes[to].es}`,
  ).join('\n');
}
