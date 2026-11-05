import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type Locale = 'es' | 'en';
const LOCALES: Locale[] = ['es', 'en'];
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Rutas estáticas por idioma (reflejo de `src/lib/routes.ts`; si divergen, falla la prueba de enlaces). */
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
  roomTypes: { slug: string; name: Record<Locale, string> }[];
}
/** El snapshot lo genera `prebuild` antes de que arranque el servidor: se lee dentro de las pruebas, no al importar. */
const snapshot = (): SnapshotLite =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), 'src/data/snapshot.json'), 'utf8'),
  ) as SnapshotLite;

const staticPages = Object.entries(ROUTES).flatMap(([key, byLocale]) =>
  LOCALES.map((locale) => ({ key, locale, url: byLocale[locale] })),
);

async function visit(page: Page, url: string) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(url);
  return { response, errors };
}

test.describe('páginas estáticas (es y en)', () => {
  for (const { key, locale, url } of staticPages) {
    test(`${key} [${locale}] responde 200 con un único h1, idioma y título correctos`, async ({
      page,
    }) => {
      const { response, errors } = await visit(page, url);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main#main')).toHaveCount(1);
      const hotelName = snapshot().hotel.name[locale];
      expect(await page.title()).toContain(hotelName);
      expect(errors).toEqual([]);
    });

    test(`${key} [${locale}] cumple WCAG 2.2 AA según axe`, async ({ page }) => {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);
    });

    test(`${key} [${locale}] no se desborda en 360 px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(url);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('habitaciones: detalle', () => {
  test('cada habitación tiene su página en es y en, con su nombre como h1', async ({ page }) => {
    const { roomTypes } = snapshot();
    expect(roomTypes.length).toBeGreaterThan(0);
    for (const room of roomTypes) {
      for (const locale of LOCALES) {
        const url = `${ROUTES['rooms']?.[locale]}${room.slug}/`;
        const response = await page.goto(url);
        expect(response?.status(), url).toBe(200);
        await expect(page.locator('h1'), url).toHaveText(room.name[locale]);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
      }
    }
  });

  test('el enlace de idioma lleva a LA MISMA habitación en el otro idioma', async ({ page }) => {
    const room = snapshot().roomTypes[0];
    if (!room) throw new Error('el snapshot no tiene habitaciones');
    await page.goto(`/habitaciones/${room.slug}/`);
    await expect(page.locator('a.lang')).toHaveAttribute('href', `/en/rooms/${room.slug}/`);
    await page.goto(`/en/rooms/${room.slug}/`);
    await expect(page.locator('a.lang')).toHaveAttribute('href', `/habitaciones/${room.slug}/`);
  });

  test('cumple axe y el CTA lleva a cotizar con la habitación precargada', async ({ page }) => {
    const room = snapshot().roomTypes[0];
    if (!room) throw new Error('el snapshot no tiene habitaciones');
    await page.goto(`/habitaciones/${room.slug}/`);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await expect(page.getByRole('link', { name: 'Cotizar esta habitación' })).toHaveAttribute(
      'href',
      `/cotizar/?room=${room.slug}`,
    );
  });

  test('un slug inexistente da 404', async ({ page }) => {
    const response = await page.goto('/habitaciones/no-existe/');
    expect(response?.status()).toBe(404);
  });
});

test.describe('imágenes', () => {
  test('todas las <img> tienen alt, ancho y alto (sin saltos de maquetación) y solo la portada es prioritaria', async ({
    page,
  }) => {
    for (const { url } of staticPages) {
      await page.goto(url);
      const problems = await page.$$eval('img:not(dialog img)', (images) =>
        images.flatMap((img) => {
          const issues: string[] = [];
          const label = img.getAttribute('src') ?? '(sin src)';
          if (!img.hasAttribute('alt')) issues.push(`${label}: sin alt`);
          if (!img.getAttribute('width') || !img.getAttribute('height'))
            issues.push(`${label}: sin width/height`);
          return issues;
        }),
      );
      expect(problems, url).toEqual([]);
    }

    await page.goto('/');
    const eager = await page.$$eval('img[fetchpriority="high"]', (images) => images.length);
    expect(eager).toBeLessThanOrEqual(1);
    const lazyBelowFold = await page.$$eval(
      '#habitaciones img:not(dialog img), #fotos img:not(dialog img)',
      (images) => images.every((img) => img.getAttribute('loading') === 'lazy'),
    );
    expect(lazyBelowFold).toBe(true);
  });

  test('todas las imágenes cargan (ninguna rota)', async ({ page }) => {
    for (const { url } of staticPages) {
      await page.goto(url);
      for (const image of await page.locator('img[src]:not(dialog img)').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(
            () => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
            { message: url },
          )
          .toBe(true);
      }
    }
  });
});

test.describe('enlaces y navegación', () => {
  test('ningún enlace interno da 404 (verificador de enlaces)', async ({ page }) => {
    const seen = new Set<string>();
    const broken: string[] = [];
    const rooms = snapshot().roomTypes.flatMap((room) =>
      LOCALES.map((locale) => `${ROUTES['rooms']?.[locale]}${room.slug}/`),
    );
    for (const url of [...staticPages.map((p) => p.url), ...rooms]) {
      await page.goto(url);
      const hrefs = await page.$$eval('a[href]', (links) =>
        links.map((a) => a.getAttribute('href') ?? ''),
      );
      for (const href of hrefs) {
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        const target = href.split('#')[0] ?? '';
        if (!target || seen.has(target)) continue;
        seen.add(target);
        const response = await page.request.get(target);
        if (response.status() !== 200) broken.push(`${url} → ${href} (${response.status()})`);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
    expect(broken).toEqual([]);
  });

  test('el enlace de idioma conserva la página equivalente en cada ruta', async ({ page }) => {
    for (const [key, byLocale] of Object.entries(ROUTES)) {
      await page.goto(byLocale.es);
      await expect(page.locator('a.lang'), `${key} es→en`).toHaveAttribute('href', byLocale.en);
      await page.goto(byLocale.en);
      await expect(page.locator('a.lang'), `${key} en→es`).toHaveAttribute('href', byLocale.es);
    }
  });

  test('el menú marca la página actual con aria-current', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/habitaciones/');
    await expect(page.locator('.nav--desktop a[aria-current="page"]')).toHaveText('Habitaciones');
  });

  test('la portada ofrece cotizar y ver habitaciones', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('.hero');
    await expect(hero.getByRole('link', { name: 'Solicitar cotización' })).toHaveAttribute(
      'href',
      '/cotizar/',
    );
    await expect(hero.getByRole('link', { name: 'Ver habitaciones' })).toHaveAttribute(
      'href',
      '/habitaciones/',
    );
  });

  test('el enlace de mapas abre en pestaña nueva con rel seguro', async ({ page }) => {
    await page.goto('/ubicacion/');
    const link = page.getByRole('link', { name: 'Abrir en Google Maps' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /google\.com\/maps/);
  });

  test('los teléfonos y el correo del contacto son enlaces tel: y mailto:', async ({ page }) => {
    await page.goto('/contacto/');
    expect(await page.locator('a[href^="tel:"]').count()).toBeGreaterThan(0);
    expect(await page.locator('a[href^="mailto:"]').count()).toBeGreaterThan(0);
  });
});

test.describe('datos de muestra y 404', () => {
  test('con datos de muestra TODAS las páginas llevan noindex; con datos reales, ninguna', async ({
    page,
  }) => {
    const expected = snapshot().dataSource === 'fixture';
    for (const url of ['/', '/habitaciones/', '/en/']) {
      await page.goto(url);
      const robots = await page.locator('meta[name="robots"]').count();
      expect(robots > 0, url).toBe(expected);
    }
  });

  test('404.html existe, es bilingüe y ofrece volver', async ({ page }) => {
    const response = await page.goto('/404.html');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('No encontramos esa página');
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
    await expect(page.locator('[lang="en"]').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('la página de cotización no muestra la barra fija de «Cotizar»', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/cotizar/');
    await expect(page.locator('.sticky-cta')).toHaveCount(0);
  });
});
