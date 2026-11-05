/**
 * SEO técnico (playbook 06), en funciones puras: URLs absolutas, `hreflang`, datos estructurados (JSON-LD),
 * sitemap y robots. Las páginas solo pasan datos; aquí se decide la forma.
 *
 * Regla: no se marca nada que no tengamos de verdad (sin reseñas, sin precios). Las coordenadas de la
 * configuración son aproximadas, así que tampoco se publican como `geo`.
 */
import type { Locale } from '../../clients/types.ts';
import type { PublicHotel, PublicRoomType } from '../data/types.ts';
import { pick, toPlainText, truncate } from './content.ts';

/** Origen sin barra final + ruta que YA incluye la base del sitio (la que devuelven `url()`/`routeUrl()`). */
export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export interface HreflangLink {
  hreflang: string;
  href: string;
}

/** Un enlace por idioma y `x-default` al idioma por defecto. */
export function hreflangLinks(
  origin: string,
  paths: Record<Locale, string>,
  defaultLocale: Locale,
): HreflangLink[] {
  const locales = Object.keys(paths) as Locale[];
  return [
    ...locales.map((locale) => ({ hreflang: locale, href: absoluteUrl(origin, paths[locale]) })),
    { hreflang: 'x-default', href: absoluteUrl(origin, paths[defaultLocale]) },
  ];
}

/** `og:locale` por idioma. */
export const OG_LOCALE: Record<Locale, string> = { es: 'es_MX', en: 'en_US' };

/**
 * JSON para un `<script type="application/ld+json">`. `<`, `>` y `&` se escapan como `\u00XX` (JSON válido) para que
 * un texto del PMS no pueda cerrar el `<script>`.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
}

type Json = Record<string, unknown>;

/** Quita las claves con `''`, `undefined` o arreglos vacíos (Google marca los campos vacíos como error). */
function compact(object: Json): Json {
  return Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) =>
        value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0),
    ),
  );
}

export function hotelJsonLd(input: {
  hotel: PublicHotel;
  locale: Locale;
  /** URL absoluta de la portada en ese idioma. */
  url: string;
  /** URLs absolutas de fotos del hotel. */
  images: string[];
  /** Horarios de la configuración del cliente, si el PMS no los trae. */
  fallbackTimes: { checkIn: string; checkOut: string };
}): Json {
  const { hotel, locale, url, images, fallbackTimes } = input;
  const { address } = hotel;
  const description = truncate(toPlainText(pick(hotel.description, locale)), 300);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    '@id': `${hotelBaseUrl(url, locale)}#hotel`,
    name: pick(hotel.name, locale),
    description,
    url,
    telephone: hotel.phones[0],
    email: hotel.email,
    image: images,
    checkinTime: hotel.checkInTime || fallbackTimes.checkIn,
    checkoutTime: hotel.checkOutTime || fallbackTimes.checkOut,
    address: compact({
      '@type': 'PostalAddress',
      streetAddress: [address.reference, address.colony].filter(Boolean).join(', '),
      addressLocality: address.city,
      addressRegion: address.state,
      postalCode: address.postalCode,
      addressCountry: address.country,
    }),
  });
}

/** `@id` del hotel: la portada del idioma por defecto (es la misma entidad en todos los idiomas). */
function hotelBaseUrl(homeUrl: string, locale: Locale): string {
  return locale === 'es' ? homeUrl : homeUrl.replace(new RegExp(`${locale}/$`), '');
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function hotelRoomJsonLd(input: {
  room: PublicRoomType;
  locale: Locale;
  url: string;
  hotelId: string;
  image?: string | undefined;
}): Json {
  const { room, locale, url, hotelId, image } = input;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'HotelRoom',
    name: pick(room.name, locale),
    description: truncate(toPlainText(pick(room.description, locale)), 300),
    url,
    image,
    occupancy: { '@type': 'QuantitativeValue', maxValue: room.adults + room.children },
    containedInPlace: { '@id': hotelId },
  });
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SitemapEntry {
  loc: string;
  alternates?: HreflangLink[];
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const links = (entry.alternates ?? []).map(
      (link) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(link.hreflang)}" href="${escapeXml(link.href)}"/>`,
    );
    return ['  <url>', `    <loc>${escapeXml(entry.loc)}</loc>`, ...links, '  </url>'].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function robotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}
