import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const DESIGN = '/design/';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const [name, viewport] of [
  ['escritorio', { width: 1280, height: 900 }],
  ['móvil', { width: 390, height: 844 }],
] as const) {
  test.describe(`página de diseño — ${name}`, () => {
    test.use({ viewport });

    test('cumple WCAG 2.2 AA según axe (sin violaciones)', async ({ page }) => {
      await page.goto(DESIGN);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      );
      expect(summary).toEqual([]);
    });

    test('no se desborda horizontalmente', async ({ page }) => {
      await page.goto(DESIGN);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('no pide nada a dominios externos (fuentes e iconos autoalojados)', async ({ page }) => {
      const hosts = new Set<string>();
      page.on('request', (request) => {
        const { protocol, host } = new URL(request.url());
        if (protocol.startsWith('http')) hosts.add(host);
      });
      await page.goto(DESIGN, { waitUntil: 'networkidle' });
      expect([...hosts]).toEqual([new URL(page.url()).host]);
    });

    test('las imágenes con foto cargan de verdad y no hay imágenes rotas', async ({ page }) => {
      await page.goto(DESIGN);
      // Las del visor (<dialog> cerrado) no tienen src hasta que se abre: no cuentan.
      const images = page.locator('img[src]:not(dialog img)');
      const total = await images.count();
      expect(total).toBeGreaterThanOrEqual(8);
      for (let i = 0; i < total; i += 1) {
        const image = images.nth(i);
        await image.scrollIntoViewIfNeeded(); // dispara la carga de las `loading="lazy"`
        await expect
          .poll(
            () => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
            {
              message: `imagen ${i}: ${await image.getAttribute('src')}`,
            },
          )
          .toBe(true);
      }
    });

    test('los controles táctiles miden al menos 44 px', async ({ page }) => {
      await page.goto(DESIGN);
      const small = await page.$$eval(
        '.btn, .control, .lang, .menu summary, .header nav a',
        (elements) =>
          elements
            .map((el) => ({ el, box: el.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0 && box.height > 0 && box.height < 43.5)
            .map(({ el, box }) => `${el.className || el.tagName}: ${Math.round(box.height)}px`),
      );
      expect(small).toEqual([]);
    });

    test('ningún icono SVG visible colapsa (tamaño ~0)', async ({ page }) => {
      await page.goto(DESIGN);
      const collapsed = await page.$$eval('svg', (svgs) =>
        svgs
          .filter((svg) => svg.getClientRects().length > 0)
          .filter((svg) => {
            const box = svg.getBoundingClientRect();
            // Colapsado = prácticamente invisible (0,27 px medido); ningún icono real baja de 16 px.
            return box.width < 8 || box.height < 8;
          })
          .map((svg) => svg.parentElement?.className || svg.parentElement?.tagName),
      );
      expect(collapsed).toEqual([]);
    });

    test('un formulario con error expone aria-invalid y describe el error', async ({ page }) => {
      await page.goto(DESIGN);
      const field = page.locator('#e-mail');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await field.getAttribute('aria-describedby');
      expect(describedBy).toContain('e-mail-error');
      await expect(page.locator('#e-mail-error')).toContainText('correo electrónico válido');
      await expect(page.getByLabel('Nombre completo')).toBeVisible();
    });
  });
}

test.describe('visor de la galería', () => {
  test('abre con clic, navega con flechas, cierra con Esc y devuelve el foco', async ({ page }) => {
    await page.goto(DESIGN);
    const first = page.locator('a[data-gallery-item]').first();
    await first.scrollIntoViewIfNeeded();
    await first.click();

    const dialog = page.locator('dialog.lightbox');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-lightbox-pos]')).toHaveText('Foto 1 de 4');
    await expect(dialog.locator('[data-lightbox-img]')).toHaveAttribute(
      'alt',
      'Atardecer sobre el mar',
    );

    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('[data-lightbox-pos]')).toHaveText('Foto 2 de 4');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('[data-lightbox-pos]')).toHaveText('Foto 4 de 4'); // da la vuelta

    // El foco queda dentro del visor mientras está abierto.
    expect(
      await page.evaluate(() =>
        document.querySelector('dialog[open]')?.contains(document.activeElement),
      ),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
  });

  test('cierra con el botón y con clic en el fondo', async ({ page }) => {
    await page.goto(DESIGN);
    const first = page.locator('a[data-gallery-item]').first();
    await first.scrollIntoViewIfNeeded();
    await first.click();
    const dialog = page.locator('dialog.lightbox');
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toBeHidden();

    await first.click();
    await expect(dialog).toBeVisible();
    await dialog.click({ position: { x: 5, y: 300 } });
    await expect(dialog).toBeHidden();
  });

  test('cada miniatura es un enlace a la foto grande (funciona sin JavaScript)', async ({
    page,
  }) => {
    await page.goto(DESIGN);
    const hrefs = await page.$$eval('a[data-gallery-item]', (links) =>
      links.map((link) => link.getAttribute('href')),
    );
    expect(hrefs).toHaveLength(4);
    for (const href of hrefs) expect(href).toMatch(/\.svg$/);
  });
});

test.describe('navegación', () => {
  test('en móvil el menú se abre con teclado y solo se ve el menú móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DESIGN);
    await expect(page.locator('.nav--desktop')).toBeHidden();

    const summary = page.locator('.menu summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('.menu__panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Habitaciones' })).toBeVisible();
  });

  for (const width of [360, 390, 768]) {
    test(`el nombre del hotel no se sale de la cabecera a ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(DESIGN);
      const header = await page.locator('.header').boundingBox();
      const name = await page.locator('.brand__name').boundingBox();
      if (!header || !name) throw new Error('no se pudo medir la cabecera');
      expect(name.y).toBeGreaterThanOrEqual(header.y);
      expect(name.y + name.height).toBeLessThanOrEqual(header.y + header.height);
      // Y el icono del menú no le ha quitado todo el espacio: el nombre cabe en tres líneas como máximo.
      expect(name.height).toBeLessThanOrEqual(75);
    });
  }

  test('en escritorio se ve el menú completo y no el botón de menú', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(DESIGN);
    await expect(
      page.locator('.nav--desktop').getByRole('link', { name: 'Galería' }),
    ).toBeVisible();
    await expect(page.locator('.menu')).toBeHidden();
    await expect(page.locator('.sticky-cta')).toBeHidden();
  });

  test('en móvil hay una barra fija de cotización y el enlace de salto al contenido', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DESIGN);
    await expect(
      page.locator('.sticky-cta').getByRole('link', { name: 'Solicitar cotización' }),
    ).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  });

  test('el enlace de idioma lleva a la versión equivalente', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(DESIGN);
    await expect(page.locator('a.lang')).toHaveAttribute('href', '/en/');
    await expect(page.locator('a.lang')).toHaveAttribute('lang', 'en');
  });
});

test('respeta prefers-reduced-motion (sin transiciones)', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(DESIGN);
  const duration = await page
    .locator('.btn')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
  await context.close();
});
