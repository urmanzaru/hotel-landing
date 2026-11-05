/**
 * Slugs anteriores de habitaciones renombradas (playbook 09). El slug sale del nombre en el PMS: si el hotel renombra
 * una habitación, su URL cambia y los enlaces compartidos darían 404. El pipeline guarda en el snapshot
 * `roomSlugAliases` (slug anterior → id de la habitación) comparando con el último snapshot bueno, y el build
 * genera un 301 en el `.htaccess` y una página de respaldo hacia la URL actual.
 */
import type { Snapshot } from './types.ts';

type Lite = Pick<Snapshot, 'dataSource' | 'roomTypes' | 'roomSlugAliases'>;

/** Alias del snapshot nuevo: los heredados del anterior más los slugs que cambiaron, solo los aún útiles. */
export function carrySlugAliases(previous: Lite | null, next: Lite): Record<string, string> {
  if (!previous || previous.dataSource !== 'api') return {};
  const current = new Map(next.roomTypes.map((room) => [room.id, room.slug]));
  const inUse = new Set(current.values());
  const candidates: Record<string, string> = { ...previous.roomSlugAliases };
  for (const room of previous.roomTypes) {
    const slug = current.get(room.id);
    if (slug !== undefined && slug !== room.slug) candidates[room.slug] = room.id;
  }
  const aliases: Record<string, string> = {};
  for (const [slug, id] of Object.entries(candidates).sort(([a], [b]) => a.localeCompare(b))) {
    if (current.has(id) && !inUse.has(slug)) aliases[slug] = id;
  }
  return aliases;
}

/** Redirecciones `{ from: slug anterior, to: slug actual }` para el `.htaccess` y las páginas de respaldo. */
export function roomRedirects(
  snapshot: Pick<Snapshot, 'roomTypes' | 'roomSlugAliases'>,
): { from: string; to: string }[] {
  const current = new Map(snapshot.roomTypes.map((room) => [room.id, room.slug]));
  return Object.entries(snapshot.roomSlugAliases)
    .flatMap(([from, id]) => {
      const to = current.get(id);
      return to && to !== from && ![...current.values()].includes(from) ? [{ from, to }] : [];
    })
    .sort((a, b) => a.from.localeCompare(b.from));
}
