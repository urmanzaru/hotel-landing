import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDist, findPrivateData, verifyDeployment } from '../../src/lib/deploy-checks.ts';
import { LEGACY_REDIRECTS } from '../../src/lib/legacy.ts';
import { routes } from '../../src/lib/routes.ts';

const HOTEL = 'Hotel La Cabaña';

describe('checkDist (humo antes de subir)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'dist-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function site(options: { noindex: boolean; htaccessNoindex?: boolean; name?: string }) {
    const robots = options.noindex ? '<meta name="robots" content="noindex, nofollow">' : '';
    await mkdir(path.join(dir, 'habitaciones'), { recursive: true });
    await mkdir(path.join(dir, 'cotizar'), { recursive: true });
    await mkdir(path.join(dir, '_astro'), { recursive: true });
    await writeFile(
      path.join(dir, 'index.html'),
      `<head>${robots}</head><h1>${options.name ?? HOTEL}</h1>`,
    );
    await writeFile(path.join(dir, 'habitaciones/index.html'), '');
    await writeFile(path.join(dir, 'cotizar/index.html'), '');
    await writeFile(path.join(dir, '404.html'), '');
    const tag =
      (options.htaccessNoindex ?? options.noindex)
        ? 'Header always set X-Robots-Tag "noindex"'
        : '';
    await writeFile(path.join(dir, '.htaccess'), `Options -Indexes\n${tag}`);
  }

  it('producción correcta: sin errores', async () => {
    await site({ noindex: false });
    expect(checkDist(dir, { hotelName: HOTEL, noindex: false })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('staging correcto: noindex en la página y en el .htaccess', async () => {
    await site({ noindex: true });
    expect(checkDist(dir, { hotelName: HOTEL, noindex: true }).errors).toEqual([]);
  });

  it('producción con noindex (datos de muestra o NOINDEX olvidado) no se publica', async () => {
    await site({ noindex: true });
    expect(checkDist(dir, { hotelName: HOTEL, noindex: false }).errors.join()).toMatch(/noindex/);
  });

  it('faltan archivos esenciales o el nombre del hotel', async () => {
    await site({ noindex: false, name: 'Otro hotel' });
    await rm(path.join(dir, '.htaccess'));
    await rm(path.join(dir, '_astro'), { recursive: true });
    const { errors } = checkDist(dir, { hotelName: HOTEL, noindex: false });
    expect(errors).toEqual([
      'Falta .htaccess',
      'Falta la carpeta _astro/ (CSS y JS)',
      `La portada no contiene el nombre del hotel («${HOTEL}»)`,
    ]);
  });

  it('el .htaccess debe coincidir con el modo de indexación', async () => {
    await site({ noindex: false, htaccessNoindex: true });
    expect(checkDist(dir, { hotelName: HOTEL, noindex: false }).errors.join()).toMatch(
      /X-Robots-Tag/,
    );
  });
});

describe('findPrivateData (prueba imprescindible 4 del playbook 08)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'dist-'));
    await mkdir(path.join(dir, '_astro'), { recursive: true });
    await mkdir(path.join(dir, 'img'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('un sitio limpio no tiene hallazgos (texto normal, hashes y datos en base64 no cuentan)', async () => {
    await writeFile(
      path.join(dir, 'index.html'),
      '<h1>Hotel La Cabaña</h1><p>Reserva directa. Tel. +52 958 000 0000</p>' +
        '<img src="data:image/png;base64,ABCD123456XYZ0QWERTY123456ABC=">',
    );
    await writeFile(path.join(dir, '_astro/Base.CxYz1234.css'), 'body{margin:0}');
    expect(findPrivateData(dir)).toEqual([]);
  });

  it('detecta campos y valores fiscales en HTML, JS, JSON y XML, sin mostrar el valor', async () => {
    await writeFile(path.join(dir, 'index.html'), '<p>RFC: XAXX010101000</p>');
    await writeFile(path.join(dir, '_astro/app.js'), 'const h={businessName:"X",regimenCFDI:1}');
    await writeFile(path.join(dir, 'datos.json'), '{"productOrServiceDefault":"90111800"}');
    await writeFile(path.join(dir, 'sitemap.xml'), '<x>Hotelera del Sur S.A. de C.V.</x>');
    const findings = findPrivateData(dir);
    expect(findings).toEqual([
      '_astro/app.js: campo businessName',
      '_astro/app.js: campo regimenCFDI',
      'datos.json: campo productOrServiceDefault',
      'index.html: campo rfc',
      'index.html: un RFC',
      'sitemap.xml: una razón social (S.A. de C.V.)',
    ]);
    expect(findings.join()).not.toContain('XAXX010101000');
  });

  it('no lee binarios (imágenes y fuentes)', async () => {
    await writeFile(path.join(dir, 'img/foto.jpg'), 'rfc XAXX010101000');
    expect(findPrivateData(dir)).toEqual([]);
  });

  it('checkDist no deja subir un sitio con datos fiscales', async () => {
    await writeFile(path.join(dir, 'index.html'), '<h1>Hotel La Cabaña</h1><p>XAXX010101000</p>');
    expect(checkDist(dir, { hotelName: HOTEL, noindex: false }).errors).toContain(
      'Datos fiscales en la salida: index.html: un RFC',
    );
  });
});

describe('verifyDeployment (después de subir)', () => {
  const SITE = 'https://hotel.example/nuevo/';
  const home = `<h1>${HOTEL}</h1><img src="/nuevo/img/abc/480.jpg">`;

  type Routes = Record<string, { status: number; body?: string; headers?: Record<string, string> }>;
  const fakeFetch = (routes: Routes) => async (url: string) => {
    const { pathname } = new URL(url);
    const route = routes[pathname] ?? { status: 404 };
    return new Response(route.body ?? '', { status: route.status, headers: route.headers ?? {} });
  };
  const good: Routes = {
    '/nuevo/': {
      status: 200,
      body: home,
      headers: { 'content-security-policy': "default-src 'self'", 'cache-control': 'no-cache' },
    },
    '/nuevo/img/abc/480.jpg': { status: 200 },
    // Todas las rutas del sitio anterior (src/lib/legacy.ts) con su 301, como las genera el .htaccess.
    ...Object.fromEntries(
      LEGACY_REDIRECTS.map(({ from, to }) => [
        `/nuevo${from}`,
        { status: 301, headers: { location: `https://hotel.example/nuevo${routes[to].es}` } },
      ]),
    ),
    '/nuevo/.htaccess': { status: 403 },
  };

  it('sitio publicado correctamente: sin errores ni avisos', async () => {
    expect(await verifyDeployment(SITE, { hotelName: HOTEL, fetch: fakeFetch(good) })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('la portada no es la nuestra (sigue el sitio anterior) → error', async () => {
    const routes = { ...good, '/nuevo/': { status: 200, body: '<app-root></app-root>' } };
    const result = await verifyDeployment(SITE, { hotelName: HOTEL, fetch: fakeFetch(routes) });
    expect(result.errors.join()).toMatch(/no contiene/);
  });

  it('imagen rota o .htaccess descargable → error', async () => {
    const routes = {
      ...good,
      '/nuevo/img/abc/480.jpg': { status: 404 },
      '/nuevo/.htaccess': { status: 200 },
    };
    const { errors } = await verifyDeployment(SITE, { hotelName: HOTEL, fetch: fakeFetch(routes) });
    expect(errors).toHaveLength(2);
  });

  it('hosting que ignora cabeceras o redirecciones → avisos, no errores', async () => {
    const routes = {
      ...good,
      '/nuevo/': { status: 200, body: home },
      '/nuevo/roomTypes': { status: 404 },
    };
    const result = await verifyDeployment(SITE, { hotelName: HOTEL, fetch: fakeFetch(routes) });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });

  it('comprueba TODAS las rutas antiguas y nombra las que no redirigen bien (prueba 7 del playbook 08)', async () => {
    const routesBad = {
      ...good,
      '/nuevo/pandemicInfo': { status: 200, body: '<meta http-equiv="refresh">' },
      '/nuevo/selectRooms': {
        status: 301,
        headers: { location: 'https://hotel.example/nuevo/habitaciones/' },
      },
    };
    const result = await verifyDeployment(SITE, {
      hotelName: HOTEL,
      fetch: fakeFetch(routesBad),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'Rutas antiguas sin su 301 (revisa el .htaccess; los enlaces viejos usan la página de respaldo): ' +
        '/selectRooms → 301 a /nuevo/habitaciones/ (se esperaba /nuevo/cotizar/), ' +
        '/pandemicInfo → 200 (se esperaba 301 a /nuevo/politicas/)',
    ]);
  });

  it('sitio caído → error claro', async () => {
    const failing = async () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await verifyDeployment(SITE, { hotelName: HOTEL, fetch: failing });
    expect(result.errors).toEqual([`No se pudo abrir ${SITE}: ECONNREFUSED`]);
  });
});
