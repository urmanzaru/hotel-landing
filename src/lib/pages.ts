/**
 * Páginas públicas del sitio y cuáles se indexan. Una sola fuente de verdad para el sitemap y para el `noindex` de las
 * vistas: una página sin contenido (p. ej. políticas vacías) no se indexa ni entra al sitemap.
 */
import type { Locale } from '../../clients/types.ts';
import type { Snapshot } from '../data/types.ts';
import { roomUrl, routes, routeUrl, type RouteKey } from './routes.ts';

type SnapshotLike = Pick<Snapshot, 'roomTypes'> & { hotel: Pick<Snapshot['hotel'], 'politics'> };

export function isIndexable(key: RouteKey, snapshot: SnapshotLike): boolean {
  if (key === 'policies') return snapshot.hotel.politics.length > 0;
  return true;
}

/** Rutas (con base) por idioma de cada página indexable: las fijas y el detalle de cada habitación. */
export function indexablePages(snapshot: SnapshotLike): Record<Locale, string>[] {
  const fixed = (Object.keys(routes) as RouteKey[])
    .filter((key) => isIndexable(key, snapshot))
    .map((key) => ({ es: routeUrl(key, 'es'), en: routeUrl(key, 'en') }));
  const rooms = snapshot.roomTypes.map((room) => ({
    es: roomUrl('es', room.slug),
    en: roomUrl('en', room.slug),
  }));
  return [...fixed, ...rooms];
}
