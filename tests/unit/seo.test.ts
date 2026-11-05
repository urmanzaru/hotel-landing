import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../../site.config.ts';
import { buildSnapshotCore } from '../../src/data/mappers.ts';
import {
  absoluteUrl,
  breadcrumbJsonLd,
  hotelJsonLd,
  hotelRoomJsonLd,
  hreflangLinks,
  robotsTxt,
  serializeJsonLd,
  sitemapXml,
} from '../../src/lib/seo.ts';
import { LEGACY_REDIRECTS, htaccessRedirects } from '../../src/lib/legacy.ts';
import { routes } from '../../src/lib/routes.ts';

const ORIGIN = 'https://hotel.example';
const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/api/${name}.json`, import.meta.url), 'utf8'));
const buildFixtureSnapshotCore = () =>
  buildSnapshotCore(read('hotel'), read('roomType'), loadSiteConfig({}));

describe('URLs absolutas y alternativas de idioma', () => {
  it('absoluteUrl une el origen con la ruta (que ya trae la base)', () => {
    expect(absoluteUrl(ORIGIN, '/habitaciones/')).toBe('https://hotel.example/habitaciones/');
    expect(absoluteUrl(`${ORIGIN}/`, '/nuevo/en/rooms/')).toBe(
      'https://hotel.example/nuevo/en/rooms/',
    );
    expect(absoluteUrl(ORIGIN, 'img/a.jpg')).toBe('https://hotel.example/img/a.jpg');
  });

  it('hreflang: un enlace por idioma y x-default al idioma por defecto', () => {
    expect(hreflangLinks(ORIGIN, { es: '/habitaciones/', en: '/en/rooms/' }, 'es')).toEqual([
      { hreflang: 'es', href: 'https://hotel.example/habitaciones/' },
      { hreflang: 'en', href: 'https://hotel.example/en/rooms/' },
      { hreflang: 'x-default', href: 'https://hotel.example/habitaciones/' },
    ]);
  });
});

describe('JSON-LD', () => {
  it('se serializa sin poder cerrar el <script> que lo contiene', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>', x: 'a & b' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>', x: 'a & b' });
  });

  it('Hotel: datos públicos, sin campos vacíos, sin reseñas ni precios', () => {
    const snapshot = buildFixtureSnapshotCore();
    const data = hotelJsonLd({
      hotel: snapshot.hotel,
      locale: 'es',
      url: `${ORIGIN}/`,
      images: [`${ORIGIN}/img/a.jpg`],
      fallbackTimes: { checkIn: '15:00', checkOut: '12:00' },
    });
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Hotel',
      '@id': `${ORIGIN}/#hotel`,
      name: snapshot.hotel.name.es,
      url: `${ORIGIN}/`,
      telephone: snapshot.hotel.phones[0],
      email: snapshot.hotel.email,
      checkinTime: '15:00',
      checkoutTime: '12:00',
      image: [`${ORIGIN}/img/a.jpg`],
      address: {
        '@type': 'PostalAddress',
        addressLocality: snapshot.hotel.address.city,
        addressRegion: snapshot.hotel.address.state,
        postalCode: snapshot.hotel.address.postalCode,
        addressCountry: snapshot.hotel.address.country,
      },
    });
    const text = JSON.stringify(data);
    for (const forbidden of ['aggregateRating', 'review', 'priceRange', 'offers', 'geo']) {
      expect(text).not.toContain(forbidden);
    }
    expect(Object.values(data).includes('')).toBe(false);
  });

  it('Hotel en inglés usa los textos en inglés y omite lo que no existe', () => {
    const snapshot = buildFixtureSnapshotCore();
    const hotel = { ...snapshot.hotel, email: '', phones: [], imageIds: [] };
    const data = hotelJsonLd({
      hotel,
      locale: 'en',
      url: `${ORIGIN}/en/`,
      images: [],
      fallbackTimes: { checkIn: '15:00', checkOut: '12:00' },
    });
    expect(data['name']).toBe(snapshot.hotel.name.en);
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('image');
  });

  it('BreadcrumbList numera los tramos con URL absoluta', () => {
    expect(
      breadcrumbJsonLd([
        { name: 'Inicio', url: `${ORIGIN}/` },
        { name: 'Habitaciones', url: `${ORIGIN}/habitaciones/` },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Habitaciones', item: `${ORIGIN}/habitaciones/` },
      ],
    });
  });

  it('HotelRoom con ocupación (adultos + niños) y enlace al hotel', () => {
    const room = buildFixtureSnapshotCore().roomTypes[0];
    if (!room) throw new Error('sin habitaciones');
    const data = hotelRoomJsonLd({
      room,
      locale: 'es',
      url: `${ORIGIN}/habitaciones/${room.slug}/`,
      hotelId: `${ORIGIN}/#hotel`,
      image: `${ORIGIN}/img/r.jpg`,
    });
    expect(data).toMatchObject({
      '@type': 'HotelRoom',
      name: room.name.es,
      url: `${ORIGIN}/habitaciones/${room.slug}/`,
      image: `${ORIGIN}/img/r.jpg`,
      occupancy: { '@type': 'QuantitativeValue', maxValue: room.adults + room.children },
      containedInPlace: { '@id': `${ORIGIN}/#hotel` },
    });
  });
});

describe('sitemap y robots', () => {
  it('sitemap con alternativas de idioma y caracteres escapados', () => {
    const xml = sitemapXml([
      {
        loc: `${ORIGIN}/habitaciones/`,
        alternates: hreflangLinks(ORIGIN, { es: '/habitaciones/', en: '/en/rooms/' }, 'es'),
      },
      { loc: `${ORIGIN}/a&b/` },
    ]);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('<loc>https://hotel.example/habitaciones/</loc>');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://hotel.example/en/rooms/"/>',
    );
    expect(xml).toContain('<loc>https://hotel.example/a&amp;b/</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it('robots.txt permite todo y apunta al sitemap absoluto', () => {
    expect(robotsTxt(`${ORIGIN}/sitemap.xml`)).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://hotel.example/sitemap.xml\n',
    );
  });
});

describe('redirecciones del sitio Angular anterior', () => {
  it('cubren las 7 rutas antiguas y apuntan a rutas que existen', () => {
    expect(LEGACY_REDIRECTS.map((r) => r.from).sort()).toEqual(
      [
        '/contactUS',
        '/hotel',
        '/locationBlog',
        '/pandemicInfo',
        '/quotation',
        '/roomTypes',
        '/selectRooms',
      ].sort(),
    );
    for (const redirect of LEGACY_REDIRECTS) expect(routes[redirect.to]).toBeDefined();
  });

  it('genera reglas 301 de Apache, con y sin barra final, respetando la base', () => {
    const rules = htaccessRedirects('/');
    expect(rules).toContain('RedirectMatch 301 ^/roomTypes/?$ /habitaciones/');
    expect(rules).toContain('RedirectMatch 301 ^/hotel/?$ /');
    expect(htaccessRedirects('/nuevo/')).toContain(
      'RedirectMatch 301 ^/nuevo/contactUS/?$ /nuevo/contacto/',
    );
  });
});

describe('páginas indexables', () => {
  it('fijas + detalle de cada habitación, en ambos idiomas; políticas solo si existen', async () => {
    const { indexablePages, isIndexable } = await import('../../src/lib/pages.ts');
    const core = buildFixtureSnapshotCore();
    const pages = indexablePages(core);
    expect(pages).toContainEqual({ es: '/', en: '/en/' });
    expect(pages).toContainEqual({ es: '/politicas/', en: '/en/policies/' });
    const room = core.roomTypes[0];
    if (!room) throw new Error('sin habitaciones');
    expect(pages).toContainEqual({
      es: `/habitaciones/${room.slug}/`,
      en: `/en/rooms/${room.slug}/`,
    });
    expect(pages).toHaveLength(Object.keys(routes).length + core.roomTypes.length);

    const empty = { ...core, hotel: { ...core.hotel, politics: [] } };
    expect(isIndexable('policies', empty)).toBe(false);
    expect(indexablePages(empty)).not.toContainEqual({ es: '/politicas/', en: '/en/policies/' });
  });
});
