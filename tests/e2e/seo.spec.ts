/**
 * SEO técnico, presupuestos y privacidad (playbook 06) contra el sitio construido.
 * El origen canónico es SITE_ORIGIN (en las pruebas, el mismo `http://localhost:4202` que sirve el sitio).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

type Locale = 'es' | 'en';
const ORIGIN = process.env.SITE_ORIGIN ?? 'http://localhost:4202';
const DIST = path.join(process.cwd(), 'dist');

const ROUTES: Record<string, Record<Locale, string>> = {
  home: { es: '/', en: '/en/' },
  rooms: { es: '/habitaciones/', en: '/en/rooms/' },
  gallery: { es: '/galeria/', en: '/en/gallery/' },
  location: { es: '/ubicacion/', en: '/en/location/' },
  contact: { es: '/contacto/', en: '/en/contact/' },
  quote: { es: '/cotizar/', en: '/en/quote/' },
  policies: { es: '/politicas/', en: '/en/policies/' },
};

interface SnapshotLite {
  dataSource: string;
  hotel: { name: Record<Locale, string> };
  roomTypes: { slug: string; name: Record<Locale, string>; photoMainId: string | null }[];
}
const snapshot = (): SnapshotLite =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), 'src/data/snapshot.json'), 'utf8'),
  ) as SnapshotLite;

/** Todas las páginas públicas, con su ruta en cada idioma. */
function allPages(): Record<Locale, string>[] {
  return [
    ...Object.values(ROUTES),
    ...snapshot().roomTypes.map((room) => ({
      es: `/habitaciones/${room.slug}/`,
      en: `/en/rooms/${room.slug}/`,
    })),
  ];
}

const meta = (page: Page, selector: string) =>
  page.locator(selector).first().getAttribute('content');

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test.describe('metadatos por página', () => {
  test('título y descripción presentes y distintos en cada página e idioma', async ({ page }) => {
    const seen = new Map<string, string>();
    for (const paths of allPages()) {
      for (const locale of ['es', 'en'] as const) {
        await page.goto(paths[locale]);
        const title = await page.title();
        const description = (await meta(page, 'meta[name="description"]')) ?? '';
        expect(title.length, paths[locale]).toBeGreaterThan(10);
        expect(description.length, paths[locale]).toBeGreaterThan(10);
        expect(description.length, paths[locale]).toBeLessThanOrEqual(160);
        // Dos habitaciones del PMS pueden llamarse igual: la pareja título + descripción sí debe ser única.
        const key = `${title} | ${description}`;
        expect(seen.get(key), `${paths[locale]} repite los metadatos de ${seen.get(key)}`).toBe(
          undefined,
        );
        seen.set(key, paths[locale]);
      }
    }
  });

  test('canónica absoluta a sí misma y hreflang es/en/x-default recíprocos', async ({ page }) => {
    for (const paths of allPages()) {
      for (const locale of ['es', 'en'] as const) {
        await page.goto(paths[locale]);
        const where = paths[locale];
        await expect(page.locator('link[rel="canonical"]'), where).toHaveAttribute(
          'href',
          `${ORIGIN}${paths[locale]}`,
        );
        const alternates = await page
          .locator('link[rel="alternate"][hreflang]')
          .evaluateAll((links) =>
            Object.fromEntries(
              links.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
            ),
          );
        expect(alternates, where).toEqual({
          es: `${ORIGIN}${paths.es}`,
          en: `${ORIGIN}${paths.en}`,
          'x-default': `${ORIGIN}${paths.es}`,
        });
        // El enlace visible de idioma lleva a la misma alternativa.
        const other = locale === 'es' ? 'en' : 'es';
        await expect(page.locator('a.lang'), where).toHaveAttribute('href', paths[other]);
      }
    }
  });

  test('Open Graph y Twitter: imagen 1200×630 que existe, URL y textos', async ({
    page,
    request,
  }) => {
    const checked = new Set<string>();
    for (const paths of allPages()) {
      await page.goto(paths.en);
      expect(await meta(page, 'meta[property="og:url"]')).toBe(`${ORIGIN}${paths.en}`);
      expect(await meta(page, 'meta[property="og:title"]')).toBe(await page.title());
      expect(await meta(page, 'meta[property="og:locale"]')).toBe('en_US');
      expect(await meta(page, 'meta[property="og:locale:alternate"]')).toBe('es_MX');
      expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
      expect(await meta(page, 'meta[property="og:image:alt"]')).toBeTruthy();
      const image = (await meta(page, 'meta[property="og:image"]')) ?? '';
      expect(image.startsWith(`${ORIGIN}/og/`), image).toBe(true);
      if (checked.has(image)) continue;
      checked.add(image);
      const response = await request.get(image.replace(ORIGIN, ''));
      expect(response.status(), image).toBe(200);
      expect(response.headers()['content-type']).toContain('image/jpeg');
      const { width, height } = await sharp(await response.body()).metadata();
      expect({ width, height }, image).toEqual({ width: 1200, height: 630 });
    }
    // Las habitaciones con foto tienen su propia imagen.
    const withPhoto = snapshot().roomTypes.find((room) => room.photoMainId);
    if (withPhoto) expect(checked.has(`${ORIGIN}/og/room-${withPhoto.slug}.jpg`)).toBe(true);
  });
});

test.describe('datos estructurados (JSON-LD)', () => {
  test('portada: Hotel con nombre, dirección y horarios; sin reseñas ni precios', async ({
    page,
  }) => {
    for (const locale of ['es', 'en'] as const) {
      await page.goto(ROUTES['home']?.[locale] ?? '/');
      const [hotel] = (await jsonLd(page)).filter((block) => block['@type'] === 'Hotel');
      expect(hotel, locale).toBeDefined();
      expect(hotel).toMatchObject({
        '@context': 'https://schema.org',
        '@id': `${ORIGIN}/#hotel`,
        name: snapshot().hotel.name[locale] || snapshot().hotel.name.es,
        url: `${ORIGIN}${ROUTES['home']?.[locale]}`,
        address: { '@type': 'PostalAddress' },
      });
      expect(hotel).toHaveProperty('checkinTime');
      expect(JSON.stringify(hotel)).not.toMatch(/aggregateRating|review|priceRange|offers/);
    }
  });

  test('páginas interiores: BreadcrumbList cuyo último tramo es la propia página', async ({
    page,
  }) => {
    for (const paths of allPages().slice(1)) {
      for (const locale of ['es', 'en'] as const) {
        await page.goto(paths[locale]);
        const crumbs = (await jsonLd(page)).find((block) => block['@type'] === 'BreadcrumbList');
        const items = (crumbs?.['itemListElement'] ?? []) as { item: string; position: number }[];
        expect(items.length, paths[locale]).toBeGreaterThanOrEqual(2);
        expect(items.at(-1)?.item).toBe(`${ORIGIN}${paths[locale]}`);
        expect(items[0]?.item).toBe(`${ORIGIN}${ROUTES['home']?.[locale]}`);
      }
    }
  });

  test('detalle de habitación: HotelRoom con ocupación y enlace al hotel', async ({ page }) => {
    const room = snapshot().roomTypes[0];
    if (!room) throw new Error('el snapshot no tiene habitaciones');
    await page.goto(`/habitaciones/${room.slug}/`);
    const data = (await jsonLd(page)).find((block) => block['@type'] === 'HotelRoom');
    expect(data).toMatchObject({
      url: `${ORIGIN}/habitaciones/${room.slug}/`,
      occupancy: { '@type': 'QuantitativeValue' },
      containedInPlace: { '@id': `${ORIGIN}/#hotel` },
    });
  });
});

test.describe('robots, sitemap y rutas antiguas', () => {
  test('robots.txt y sitemap.xml coherentes con el origen de los datos', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    const sitemapResponse = await request.get('/sitemap.xml');
    expect(sitemapResponse.status()).toBe(200);
    const sitemap = await sitemapResponse.text();
    if (snapshot().dataSource === 'fixture') {
      // Datos de muestra: nada se indexa.
      expect(robots).toContain('Disallow: /');
      expect(sitemap).not.toContain('<url>');
    } else {
      expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
      for (const paths of allPages()) expect(sitemap).toContain(`<loc>${ORIGIN}${paths.es}</loc>`);
    }
    // El sitemap nunca incluye la galería de diseño, la 404 ni las redirecciones.
    expect(sitemap).not.toMatch(/design|404|roomTypes|contactUS/);
  });

  for (const [from, to] of [
    ['/hotel', '/'],
    ['/roomTypes', '/habitaciones/'],
    ['/locationBlog', '/ubicacion/'],
    ['/contactUS', '/contacto/'],
    ['/quotation', '/cotizar/'],
    ['/selectRooms', '/cotizar/'],
    ['/pandemicInfo', '/politicas/'],
  ] as const) {
    test(`la ruta antigua ${from} lleva a ${to}`, async ({ page }) => {
      await page.goto(`${from}/`);
      await expect(page).toHaveURL(`${ORIGIN}${to}`);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }
});

test.describe('presupuestos de rendimiento', () => {
  /** JS propio de una página construida: scripts en línea + módulos de `/_astro/`, en bytes gzip. */
  function ownJsGzip(htmlFile: string): number {
    const html = readFileSync(htmlFile, 'utf8');
    let total = 0;
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      const [, attrs = '', body = ''] = match;
      if (attrs.includes('application/ld+json')) continue;
      const src = /src="([^"]+)"/.exec(attrs)?.[1];
      const code = src ? readFileSync(path.join(DIST, src)) : Buffer.from(body);
      total += gzipSync(code).length;
    }
    return total;
  }
  const htmlFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return htmlFiles(full);
      return name.endsWith('.html') ? [full] : [];
    });

  test('JS: portada ≤ 20 KB gzip, cotización ≤ 15 KB y 0 KB en páginas sin galería ni formulario', () => {
    expect(ownJsGzip(path.join(DIST, 'index.html'))).toBeLessThanOrEqual(20 * 1024);
    expect(ownJsGzip(path.join(DIST, 'cotizar/index.html'))).toBeLessThanOrEqual(15 * 1024);
    for (const file of htmlFiles(DIST)) {
      const html = readFileSync(file, 'utf8');
      const interactive = html.includes('data-gallery') || html.includes('data-quote-form');
      if (!interactive) expect(ownJsGzip(file), path.relative(DIST, file)).toBe(0);
    }
  });

  test('peso de la portada en móvil (HTML + CSS + fuentes + imágenes visibles) ≤ 1 MB', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    let bytes = 0;
    page.on('response', async (response) => {
      const body = await response.body().catch(() => Buffer.alloc(0));
      bytes += body.length;
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(bytes).toBeLessThanOrEqual(1024 * 1024);
    await context.close();
  });
});

test.describe('privacidad', () => {
  test('ninguna página deja cookies ni pide recursos a terceros', async ({ page, context }) => {
    const hosts = new Set<string>();
    page.on('request', (request) => {
      const { protocol, host } = new URL(request.url());
      if (protocol.startsWith('http')) hosts.add(host);
    });
    for (const paths of allPages()) {
      await page.goto(paths.es, { waitUntil: 'networkidle' });
    }
    expect(await context.cookies()).toEqual([]);
    expect([...hosts]).toEqual([new URL(ORIGIN).host]);
  });

  test('favicon e icono de iOS existen', async ({ page, request }) => {
    await page.goto('/');
    for (const selector of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
      const href = await page.locator(selector).getAttribute('href');
      expect((await request.get(href ?? '')).status(), selector).toBe(200);
    }
  });
});
