/**
 * Flujo de cotización con la API SIMULADA (`page.route`). Ninguna prueba llega a la API real: cualquier petición a
 * `receiveCotization` que no simule la propia prueba se aborta y hace fallar la prueba (crearía registros en el PMS).
 */
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const API = '**/receiveCotization';
/** 12:00 en Ciudad de México (zona del hotel) del 5 de noviembre de 2026. */
const NOW = new Date('2026-11-05T18:00:00Z');

interface SnapshotLite {
  roomTypes: { slug: string; name: { es: string; en: string } }[];
}
const snapshot = (): SnapshotLite =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), 'src/data/snapshot.json'), 'utf8'),
  ) as SnapshotLite;

type Reply = (route: Route) => Promise<void> | void;
const ok: Reply = (route) =>
  route.fulfill({ status: 200, json: { status: 'Success', message: { id: 'abc123' } } });

/** Simula la API y devuelve los cuerpos recibidos. */
async function mockApi(page: Page, reply: Reply = ok) {
  const bodies: unknown[] = [];
  await page.route(API, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    bodies.push(route.request().postDataJSON());
    await reply(route);
  });
  return bodies;
}

let unmocked: string[] = [];

test.beforeEach(async ({ page }) => {
  // Red de seguridad: lo que no simule la prueba nunca sale hacia la API real (y la prueba falla).
  unmocked = [];
  await page.route(API, (route) => {
    unmocked.push(route.request().url());
    return route.abort();
  });
  await page.clock.install({ time: NOW });
});

test.afterEach(() => {
  expect(unmocked, 'peticiones a la API sin simular').toEqual([]);
});

async function open(page: Page, url = '/cotizar/') {
  await page.goto(url);
  await expect(page.getByRole('button', { name: /Enviar solicitud|Send request/ })).toBeEnabled();
}

async function fillValid(page: Page) {
  await page.getByLabel('Llegada').fill('2026-11-20');
  await page.getByLabel('Salida').fill('2026-11-23');
  await page.getByLabel('Adultos').selectOption('2');
  await page.getByLabel('Nombre completo').fill('PRUEBA Ana Pérez');
  await page.getByLabel('Correo electrónico').fill('ana@example.com');
  await page.getByLabel(/Acepto que usen mis datos/).check();
  // El formulario exige ≥ 3 s desde la carga (anti-bots).
  await page.clock.fastForward(4000);
}

const submit = (page: Page) => page.getByRole('button', { name: 'Enviar solicitud' }).click();

test.describe('envío', () => {
  test('éxito: manda el payload correcto, confirma con resumen y limpia el formulario', async ({
    page,
  }) => {
    const bodies = await mockApi(page);
    const room = snapshot().roomTypes[0];
    if (!room) throw new Error('el snapshot no tiene habitaciones');
    await open(page, `/cotizar/?room=${room.slug}`);
    await fillValid(page);
    await page.getByLabel('Niños (menores de 18)').selectOption('2');
    await page.getByLabel('Edad del niño 1').selectOption('4');
    await page.getByLabel('Edad del niño 2').selectOption('12');
    await page.getByLabel('Habitaciones', { exact: true }).selectOption('2');
    await page.getByLabel(/habitaciones estén juntas/).check();
    await page.getByLabel('Teléfono o WhatsApp').fill('+52 958 000 0000');
    await page.getByLabel('Comentarios').fill('Llegamos tarde');
    await submit(page);

    const success = page.locator('[data-quote-success]');
    await expect(success).toBeVisible();
    await expect(success).toBeFocused();
    await expect(success).toContainText('Solicitud enviada');
    await expect(success).toContainText('ana@example.com');
    await expect(success).toContainText('20 de noviembre de 2026');
    await expect(success).toContainText('23 de noviembre de 2026 (3 noches)');
    await expect(success).toContainText('2 adultos · 2 niños (edades: 4, 12)');
    await expect(page.locator('form[data-quote-form]')).toBeHidden();

    expect(bodies).toEqual([
      {
        checkin: '2026-11-20T00:00:00.000Z',
        checkout: '2026-11-23T00:00:00.000Z',
        adults: 2,
        children: [4, 12],
        rooms: 2,
        roomsTogether: true,
        name: 'PRUEBA Ana Pérez',
        email: 'ana@example.com',
        phone: '+52 958 000 0000',
        address: '',
        notes: `Habitación de interés: ${room.name.es}\n\nLlegamos tarde`,
      },
    ]);

    await page.getByRole('button', { name: 'Hacer otra solicitud' }).click();
    await expect(page.getByLabel('Nombre completo')).toHaveValue('');
    await expect(page.getByLabel('Llegada')).toBeFocused();
    await expect(page.locator('[data-child-ages] select')).toHaveCount(0);
  });

  test('en inglés: textos en inglés y aviso del idioma para el hotel', async ({ page }) => {
    const bodies = await mockApi(page);
    await open(page, '/en/quote/');
    await page.getByLabel('Check-in').fill('2026-11-20');
    await page.getByLabel('Check-out').fill('2026-11-22');
    await page.getByLabel('Full name').fill('PRUEBA John');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel(/I agree/).check();
    await page.clock.fastForward(4000);
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.locator('[data-quote-success]')).toContainText('Request sent');
    await expect(page.locator('[data-quote-success]')).toContainText('(2 nights)');
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { notes: string }).notes).toBe('Idioma del huésped: inglés');
  });

  for (const [name, reply] of [
    ['500', (route: Route) => route.fulfill({ status: 500, body: 'error' })],
    [
      '200 sin "Success"',
      (route: Route) => route.fulfill({ status: 200, json: { status: 'Error' } }),
    ],
    ['red caída', (route: Route) => route.abort('failed')],
  ] as const) {
    test(`fallo (${name}): conserva los datos, ofrece canales alternos y no reintenta`, async ({
      page,
    }) => {
      const bodies = await mockApi(page, reply);
      await open(page);
      await fillValid(page);
      await submit(page);

      const failure = page.locator('[data-quote-failure]');
      await expect(failure).toBeVisible();
      await expect(failure).toBeFocused();
      await expect(failure).toContainText('No pudimos enviar tu solicitud');
      await expect(page.getByLabel('Nombre completo')).toHaveValue('PRUEBA Ana Pérez');
      const mail = failure.getByRole('link', { name: 'Enviar por correo' });
      const href = decodeURIComponent((await mail.getAttribute('href')) ?? '');
      expect(href).toMatch(/^mailto:/);
      expect(href).toContain('Nombre: PRUEBA Ana Pérez');
      expect(href).toContain('Llegada: 20 de noviembre de 2026');
      await expect(failure.getByRole('link', { name: /^Llamar al/ })).toHaveAttribute(
        'href',
        /^tel:/,
      );
      await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeEnabled();
      expect(bodies).toHaveLength(1);
    });
  }

  test('tiempo de espera: a los 15 s se cancela y se muestra el fallo', async ({ page }) => {
    const bodies = await mockApi(page, () => new Promise<void>(() => {})); // nunca responde
    await open(page);
    await fillValid(page);
    await submit(page);
    await expect(page.getByRole('button', { name: 'Enviando…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await page.clock.fastForward(14_000);
    await expect(page.locator('[data-quote-failure]')).toBeHidden();
    await page.clock.fastForward(2_000);
    await expect(page.locator('[data-quote-failure]')).toBeVisible();
    expect(bodies).toHaveLength(1);
  });

  test('403: mensaje genérico al huésped y el motivo en la consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await mockApi(page, (route) => route.fulfill({ status: 403, body: 'Forbidden' }));
    await open(page);
    await fillValid(page);
    await submit(page);
    await expect(page.locator('[data-quote-failure]')).toBeVisible();
    await expect(page.locator('[data-quote-failure]')).not.toContainText('403');
    expect(errors.join('\n')).toMatch(/403.*no está registrado/);
  });

  test('doble clic: una sola petición y el botón ocupado mientras tanto', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const bodies = await mockApi(page, async (route) => {
      await gate;
      await ok(route);
    });
    await open(page);
    await fillValid(page);
    const button = page.getByRole('button', { name: 'Enviar solicitud' });
    await button.dblclick();
    const busy = page.getByRole('button', { name: 'Enviando…' });
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Enter');
    release();
    await expect(page.locator('[data-quote-success]')).toBeVisible();
    expect(bodies).toHaveLength(1);
  });
});

test.describe('anti-spam', () => {
  test('señuelo relleno: finge el éxito y no envía nada', async ({ page }) => {
    const bodies = await mockApi(page);
    await open(page);
    await fillValid(page);
    await page.locator('#website').fill('http://spam.example', { force: true });
    await submit(page);
    await expect(page.locator('[data-quote-success]')).toBeVisible();
    expect(bodies).toHaveLength(0);
  });

  test('envío en menos de 3 s desde la carga: finge el éxito y no envía nada', async ({ page }) => {
    const bodies = await mockApi(page);
    await open(page);
    await page.getByLabel('Llegada').fill('2026-11-20');
    await page.getByLabel('Salida').fill('2026-11-21');
    await page.getByLabel('Nombre completo').fill('Bot');
    await page.getByLabel('Correo electrónico').fill('bot@example.com');
    await page.getByLabel(/Acepto que usen mis datos/).check();
    await submit(page);
    await expect(page.locator('[data-quote-success]')).toBeVisible();
    expect(bodies).toHaveLength(0);
  });

  test('el señuelo no es accesible ni tabulable', async ({ page }) => {
    await open(page);
    await expect(page.locator('#website')).toHaveAttribute('tabindex', '-1');
    await expect(page.getByRole('textbox', { name: 'Deja este campo vacío' })).toHaveCount(0);
  });
});

test.describe('validación', () => {
  test('al enviar vacío: resumen enfocado, errores en línea y nada se envía', async ({ page }) => {
    const bodies = await mockApi(page);
    await open(page);
    await page.clock.fastForward(4000);
    await submit(page);

    const summary = page.locator('#quote-errors');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).toHaveText([
      'Elige la fecha de llegada',
      'Elige la fecha de salida',
      'Escribe tu nombre',
      'Escribe tu correo electrónico',
      'Acepta el uso de tus datos para poder enviar la solicitud',
    ]);
    const email = page.getByLabel('Correo electrónico');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(/Escribe tu correo electrónico/);

    await summary.getByRole('link', { name: 'Escribe tu nombre' }).click();
    await expect(page.getByLabel('Nombre completo')).toBeFocused();
    await page.keyboard.type('Ana');
    await expect(page.getByLabel('Nombre completo')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(summary.getByRole('link')).toHaveCount(4);
    expect(bodies).toHaveLength(0);
  });

  test('al salir de un campo se valida solo ese campo', async ({ page }) => {
    await open(page);
    await page.getByLabel('Correo electrónico').fill('ana@');
    await page.getByLabel('Teléfono o WhatsApp').focus();
    await expect(page.locator('#email-error')).toHaveText(/correo válido/);
    await expect(page.locator('#name-error')).toBeHidden();
    await page.getByLabel('Correo electrónico').fill('ana@example.com');
    await expect(page.locator('#email-error')).toBeHidden();
  });

  test('fechas: mínimo hoy en la zona del hotel, salida posterior y edad de cada niño', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByLabel('Llegada')).toHaveAttribute('min', '2026-11-05');
    await page.getByLabel('Llegada').fill('2026-11-20');
    await expect(page.getByLabel('Salida')).toHaveValue('2026-11-21');
    await expect(page.getByLabel('Salida')).toHaveAttribute('min', '2026-11-21');
    await page.getByLabel('Salida').fill('2026-11-19');
    await page.getByLabel('Niños (menores de 18)').selectOption('1');
    await expect(page.getByLabel('Edad del niño 1')).toBeVisible();
    await page.clock.fastForward(4000);
    await submit(page);
    await expect(page.locator('#checkout-error')).toHaveText(/después de la llegada/);
    await expect(page.locator('#child-age-1-error')).toHaveText(/edad del niño 1/);
  });

  test('«juntas» solo aparece con más de una habitación', async ({ page }) => {
    await open(page);
    const together = page.getByLabel(/habitaciones estén juntas/);
    await expect(together).toBeHidden();
    await page.getByLabel('Habitaciones', { exact: true }).selectOption('3');
    await expect(together).toBeVisible();
  });
});

test.describe('precarga', () => {
  test('habitación y fechas válidas desde la URL; las inválidas se ignoran', async ({ page }) => {
    const room = snapshot().roomTypes.at(-1);
    if (!room) throw new Error('el snapshot no tiene habitaciones');
    await open(page, `/cotizar/?room=${room.slug}&checkin=2026-12-01&checkout=2026-12-04`);
    await expect(page.getByLabel('Habitación de interés')).toHaveValue(room.slug);
    await expect(page.getByLabel('Llegada')).toHaveValue('2026-12-01');
    await expect(page.getByLabel('Salida')).toHaveValue('2026-12-04');

    await open(page, '/cotizar/?room=no-existe&checkin=2020-01-01&checkout=fecha');
    await expect(page.getByLabel('Habitación de interés')).toHaveValue('');
    await expect(page.getByLabel('Llegada')).toHaveValue('');
    await expect(page.getByLabel('Salida')).toHaveValue('');
  });
});

test.describe('accesibilidad', () => {
  test('axe sin violaciones: inicial, con errores, con fallo y con éxito', async ({ page }) => {
    // Sin desplazamiento suave: axe mide el estado final y no un fotograma a medio scroll bajo la cabecera fija.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let fail = true;
    await mockApi(page, (route) => (fail ? route.fulfill({ status: 500, body: '' }) : ok(route)));
    await open(page);
    const check = async (state: string) => {
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
        state,
      ).toEqual([]);
    };
    await check('inicial');
    await page.getByLabel('Niños (menores de 18)').selectOption('2');
    await page.getByLabel('Habitaciones', { exact: true }).selectOption('2');
    await page.clock.fastForward(4000);
    await submit(page);
    await check('con errores');
    await fillValid(page);
    await page.getByLabel('Niños (menores de 18)').selectOption('0');
    await submit(page);
    await expect(page.locator('[data-quote-failure]')).toBeVisible();
    await check('con fallo');
    fail = false;
    await submit(page);
    await expect(page.locator('[data-quote-success]')).toBeVisible();
    await check('con éxito');
  });

  test('roles y nombres para lectores de pantalla', async ({ page }) => {
    await open(page);
    for (const group of ['Fechas', 'Huéspedes y habitaciones', 'Tus datos']) {
      await expect(page.getByRole('group', { name: group })).toBeVisible();
    }
    await expect(page.getByRole('combobox', { name: 'Adultos' })).toHaveValue('2');
    await expect(page.getByRole('textbox', { name: /Nombre completo/ })).toHaveAttribute(
      'autocomplete',
      'name',
    );
    await expect(page.getByRole('checkbox', { name: /Acepto que usen mis datos/ })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /políticas y aviso de privacidad/ }),
    ).toHaveAttribute('href', '/politicas/');
  });

  test('todo el flujo se completa solo con teclado', async ({ page }) => {
    const bodies = await mockApi(page);
    await open(page);
    /** Tab hasta llegar al control (los campos de fecha tienen paradas internas: mes, día, año). */
    const tabTo = async (selector: string, max = 6) => {
      const target = page.locator(selector);
      for (let i = 0; i < max; i += 1) {
        await page.keyboard.press('Tab');
        if (await target.evaluate((el) => el === document.activeElement)) return;
      }
      throw new Error(`No se llegó con Tab a ${selector}`);
    };
    // Como un usuario de teclado: «Saltar al contenido» y Tab hasta la llegada (entra por el mes).
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await tabTo('#checkin');
    await page.keyboard.type('11202026'); // mm/dd/aaaa (navegador en inglés de EE. UU.)
    await tabTo('#checkout');
    await expect(page.getByLabel('Salida')).toHaveValue('2026-11-21'); // se propone una noche
    await page.keyboard.type('11222026');
    await tabTo('#adults');
    await tabTo('#children', 1);
    await page.keyboard.press('ArrowDown'); // 1 niño
    await tabTo('#rooms', 1);
    await tabTo('#child-age-1', 1);
    await page.keyboard.press('ArrowDown'); // «Menos de 1 año»
    await page.keyboard.press('ArrowDown'); // 1 año
    await tabTo('#roomType', 1);
    await tabTo('#name', 1);
    await page.keyboard.type('PRUEBA Teclado');
    await tabTo('#email', 1);
    await page.keyboard.type('teclado@example.com');
    await tabTo('#privacy', 4); // teléfono, ciudad, comentarios
    await page.keyboard.press('Space');
    await expect(page.getByLabel(/Acepto que usen mis datos/)).toBeChecked();
    await tabTo('[data-quote-submit]', 2); // tras el enlace a las políticas
    await page.clock.fastForward(4000);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-quote-success]')).toBeFocused();
    expect(bodies).toEqual([
      expect.objectContaining({
        checkin: '2026-11-20T00:00:00.000Z',
        checkout: '2026-11-22T00:00:00.000Z',
        adults: 2,
        children: [1],
        name: 'PRUEBA Teclado',
        email: 'teclado@example.com',
      }),
    ]);
  });
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('el botón no envía y se ofrecen teléfono y correo', async ({ page }) => {
    await page.goto('/cotizar/');
    await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeDisabled();
    // (El motor de texto de Playwright no mira dentro de <noscript>: se localiza por CSS.)
    const notice = page.locator('noscript .alert');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('necesitas activar JavaScript');
    await expect(notice.locator('a[href^="tel:"]').first()).toBeVisible();
    await expect(notice.locator('a[href^="mailto:"]')).toBeVisible();
    const aside = page.getByRole('complementary', { name: 'Contacto' });
    await expect(aside.getByRole('link', { name: /^Llamar al/ }).first()).toHaveAttribute(
      'href',
      /^tel:/,
    );
  });
});
