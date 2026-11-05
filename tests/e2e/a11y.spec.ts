/**
 * Accesibilidad estructural (WCAG 2.2 AA, playbook 06) en todas las rutas. Axe ya corre en `pages.spec.ts`; aquí
 * se cubre lo que axe no comprueba del todo: jerarquía de encabezados, landmarks únicos, reflow a 320 px
 * (equivale a 1280 px con zoom al 400 %) y espaciado de texto ampliado.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const STATIC = [
  '/',
  '/habitaciones/',
  '/galeria/',
  '/ubicacion/',
  '/contacto/',
  '/cotizar/',
  '/politicas/',
  '/en/',
  '/en/rooms/',
  '/en/gallery/',
  '/en/location/',
  '/en/contact/',
  '/en/quote/',
  '/en/policies/',
  '/404.html',
];
const room = (
  JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/snapshot.json'), 'utf8')) as {
    roomTypes: { slug: string }[];
  }
).roomTypes[0]?.slug;
const PAGES = room ? [...STATIC, `/habitaciones/${room}/`, `/en/rooms/${room}/`] : STATIC;

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const url of PAGES) {
  test.describe(url, () => {
    test('encabezados sin saltos de nivel y un solo <h1> al principio', async ({ page }) => {
      await page.goto(url);
      const levels = await page
        .locator('h1, h2, h3, h4, h5, h6')
        .evaluateAll((headings) =>
          headings
            .filter((h) => h.getClientRects().length > 0 || h.closest('dialog'))
            .map((h) => Number(h.tagName[1])),
        );
      expect(levels[0]).toBe(1);
      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      levels.forEach((level, i) => {
        const previous = levels[i - 1] ?? 1;
        expect(level - previous, `${url}: h${previous} → h${level}`).toBeLessThanOrEqual(1);
      });
    });

    test('landmarks: una cabecera, un main, un pie y navegación con nombre', async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      const navs = page.getByRole('navigation');
      const count = await navs.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const name = await navs
          .nth(i)
          .evaluate((nav) => nav.getAttribute('aria-label') ?? nav.getAttribute('aria-labelledby'));
        expect(name, `${url}: <nav> sin nombre`).toBeTruthy();
      }
    });

    test('reflow: sin desplazamiento horizontal a 320 px (zoom 400 %)', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(url);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test('espaciado de texto ampliado (WCAG 1.4.12) sin desbordes', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(url);
      await page.addStyleTag({
        content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`,
      });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

test('en inglés, los textos del PMS sin traducción se declaran en español', async ({ page }) => {
  await page.goto('/en/');
  const fallbacks = await page.locator('main [lang="es"]').count();
  const snapshot = JSON.parse(
    readFileSync(path.join(process.cwd(), 'src/data/snapshot.json'), 'utf8'),
  ) as { hotel: { category: { en: string; es: string } } };
  if (snapshot.hotel.category.en === '' && snapshot.hotel.category.es !== '') {
    await expect(page.locator('.hero .eyebrow')).toHaveAttribute('lang', 'es');
    expect(fallbacks).toBeGreaterThan(0);
  }
  // Y en español nunca hace falta marcar nada.
  await page.goto('/');
  await expect(page.locator('main [lang]')).toHaveCount(0);
});
