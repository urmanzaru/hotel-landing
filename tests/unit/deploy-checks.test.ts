import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDist, verifyDeployment } from '../../src/lib/deploy-checks.ts';

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
    '/nuevo/roomTypes': {
      status: 301,
      headers: { location: 'https://hotel.example/nuevo/habitaciones/' },
    },
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

  it('sitio caído → error claro', async () => {
    const failing = async () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await verifyDeployment(SITE, { hotelName: HOTEL, fetch: failing });
    expect(result.errors).toEqual([`No se pudo abrir ${SITE}: ECONNREFUSED`]);
  });
});
