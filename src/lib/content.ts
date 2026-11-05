/** Ayudantes de contenido para las páginas: textos localizados, formato de capacidad, texto plano seguro, enlaces. */
import type { Locale } from '../../clients/types.ts';
import { t, type UiKey } from '../i18n/ui.ts';
import type { Localized, PublicHotel, PublicRoomType, Snapshot } from '../data/types.ts';

export function pick(value: Localized, locale: Locale): string {
  return value[locale] || value.es;
}

/**
 * `lang` de un texto del PMS: `'es'` si la página está en otro idioma y el texto cayó al español (no hay traducción);
 * `undefined` si ya está en el idioma de la página.
 */
export function langFor(value: Localized, locale: Locale): Locale | undefined {
  return locale !== 'es' && !value[locale] && value.es ? 'es' : undefined;
}

/** «Calle, colonia, ciudad, estado, CP, país» sin partes vacías ni repetidas. */
export function addressLine(address: PublicHotel['address']): string {
  const parts = [
    address.reference,
    address.colony,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(', ');
}

/** Recorta en el último espacio antes de `max` y añade «…». Para metadescripciones. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iquest: '¿',
  iexcl: '¡',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  deg: '°',
  euro: '€',
};

/** Decodifica entidades en UNA sola pasada (así `&amp;lt;` queda como `&lt;`, sin reinterpretarse). */
function decodeEntities(text: string): string {
  return text.replace(
    /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,8});/g,
    (match, body: string) => {
      if (body.startsWith('#')) {
        const code = /^#[xX]/.test(body)
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[body] ?? match;
    },
  );
}

/**
 * Convierte el texto que manda el PMS (puede traer HTML) en texto plano: las etiquetas se eliminan y los saltos de
 * bloque se conservan como saltos de línea. El resultado se pinta SIEMPRE escapado (Astro escapa por defecto).
 */
export function toPlainText(input: string): string {
  return input
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;\s]{1,10};/g, (entity) => decodeEntities(entity))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Párrafos de un texto (separados por línea en blanco); las líneas simples se conservan con `pre-line`. */
export function paragraphs(input: string): string[] {
  const text = toPlainText(input);
  return text === '' ? [] : text.split(/\n{2,}/).map((paragraph) => paragraph.trim());
}

function plural(locale: Locale, base: 'room.adults' | 'room.children', n: number): string {
  return t(locale, `${base}.${n === 1 ? 'one' : 'other'}` as UiKey, { n });
}

/** «4 adultos · 2 niños · por noche» (los niños se omiten si son 0). */
export function roomMeta(locale: Locale, room: PublicRoomType): string {
  const parts = [plural(locale, 'room.adults', room.adults)];
  if (room.children > 0) parts.push(plural(locale, 'room.children', room.children));
  parts.push(t(locale, room.chargeType === 'hour' ? 'room.charge.hour' : 'room.charge.night'));
  return parts.join(' · ');
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Enlace de WhatsApp (`wa.me`) desde un número con o sin símbolos; `null` si no hay dígitos suficientes. */
export function whatsappHref(number: string | undefined): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function mapLinks(coordinates: { lat: number; lng: number }): {
  google: string;
  osm: string;
} {
  const { lat, lng } = coordinates;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
  };
}

/** Título de página: «Página · Hotel · Ciudad, Estado» (las partes vacías se omiten). */
export function pageTitle(page: string | null, snapshot: Snapshot, locale: Locale): string {
  const { hotel } = snapshot;
  const place = [hotel.address.city, hotel.address.state].filter(Boolean).join(', ');
  return [page, pick(hotel.name, locale), place].filter(Boolean).join(' · ');
}

/** Datos de cabecera y pie a partir del snapshot. */
export function layoutHotel(snapshot: Snapshot, locale: Locale) {
  const { hotel } = snapshot;
  return {
    name: pick(hotel.name, locale),
    address: addressLine(hotel.address) || undefined,
    phones: hotel.phones,
    email: hotel.email || undefined,
    hasPolicies: hotel.politics.length > 0,
  };
}
