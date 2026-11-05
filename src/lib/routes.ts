/** Rutas del sitio por idioma. Los slugs se traducen, así que el mapa es explícito (no se deriva por prefijo). */
import type { Locale } from '../../clients/types.ts';
import { url } from './url.ts';

export const routes = {
  home: { es: '/', en: '/en/' },
  rooms: { es: '/habitaciones/', en: '/en/rooms/' },
  gallery: { es: '/galeria/', en: '/en/gallery/' },
  location: { es: '/ubicacion/', en: '/en/location/' },
  contact: { es: '/contacto/', en: '/en/contact/' },
  quote: { es: '/cotizar/', en: '/en/quote/' },
  policies: { es: '/politicas/', en: '/en/policies/' },
} as const satisfies Record<string, Record<Locale, string>>;

export type RouteKey = keyof typeof routes;

/** Enlaces del menú principal, en orden. */
export const NAV_ROUTES: readonly RouteKey[] = ['home', 'rooms', 'gallery', 'location', 'contact'];

/** URL pública (con la base del sitio) de una ruta en un idioma. */
export function routeUrl(key: RouteKey, locale: Locale): string {
  return url(routes[key][locale]);
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'es' ? 'en' : 'es';
}
