/**
 * URLs internas. El staging se sirve desde una subcarpeta (`/nuevo/`), así que NINGÚN enlace ni recurso interno
 * puede escribirse como `/ruta` a mano: siempre `url('/ruta/')` o `localePath(locale, '/ruta/')`.
 */
import type { Locale } from '../../clients/types.ts';

/** Une la base del sitio con una ruta. `base` termina en `/` (`/` o `/nuevo/`); `path` puede o no empezar con `/`. */
export function joinBase(base: string, path: string): string {
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${path.replace(/^\/+/, '')}`;
}

export function url(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

/** Prefijo de idioma: el idioma por defecto (es) no lleva prefijo; el resto, `/en/`. */
export function localePath(locale: Locale, path: string, defaultLocale: Locale = 'es'): string {
  const clean = `/${path.replace(/^\/+/, '')}`;
  return locale === defaultLocale ? clean : `/${locale}${clean}`;
}

/** Quita el prefijo de idioma de una ruta ya sin base (`/en/rooms/` → `/rooms/`). */
export function stripLocale(path: string, locales: readonly Locale[]): string {
  for (const locale of locales) {
    if (path === `/${locale}` || path.startsWith(`/${locale}/`)) {
      return path.slice(locale.length + 1) || '/';
    }
  }
  return path;
}
