/**
 * El `.htaccess` generado, servido por un Apache 2.4 REAL (`npm run test:apache`; requiere `apache2`).
 * Un error de sintaxis en `.htaccess` deja TODO el sitio en 500, y las reglas (https, host, 301, caché, CSP) solo se
 * pueden comprobar de verdad en Apache: por eso esta prueba existe aunque sea lenta.
 *
 * Construye tres variantes con los datos del snapshot actual:
 * - `prod`:    SITE_ORIGIN=https://hotel.example, raíz del dominio.
 * - `staging`: misma web en `/nuevo/` con NOINDEX=1.
 * - `abierto`: origen http://hotel.test en `/abierto/` (sin forzar https) para abrirla con Chromium y vigilar la CSP.
 *   Chromium no se conecta a Apache: cada petición se reenvía desde la prueba y se le devuelve la respuesta real
 *   (estado, cabeceras y cuerpo), así la CSP que aplica el navegador es la que envía Apache.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSnapshot } from '../../src/data/load.ts';
import { verifyDeployment } from '../../src/lib/deploy-checks.ts';

const root = process.cwd();
const APACHE = ['/usr/sbin/apache2', '/usr/sbin/httpd'].find((bin) => existsSync(bin));
const MODULES = ['/usr/lib/apache2/modules', '/usr/lib64/httpd/modules'].find((dir) =>
  existsSync(dir),
);
const TIMEOUT = 300_000;
const PORT = 18_000 + Math.floor(Math.random() * 1000);
const HOST = 'hotel.example';
/** Dominio ficticio que abre Chromium; `page.route` le contesta con las respuestas reales de Apache. */
const BROWSER_HOST = 'hotel.test';

let work = '';
let www = '';
/** Raíz del host virtual del navegador: fuera de `www`, para que no le afecte el `.htaccess` de producción. */
let www2 = '';
let apache: ChildProcess | undefined;

function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('VITEST') ||
      ['BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR', 'NODE_ENV', 'TEST'].includes(key)
    ) {
      delete env[key];
    }
  }
  return { ...env, ...extra };
}

/** `astro build` + el `postbuild` que escribe los `.htaccess`, igual que `npm run build`. */
function build(outDir: string, env: Record<string, string>): void {
  const options = {
    cwd: root,
    encoding: 'utf8' as const,
    env: cleanEnv({ ...env, OUT_DIR: outDir }),
  };
  for (const args of [
    [path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'],
    ['--import', 'tsx', 'scripts/write-htaccess.ts'],
  ]) {
    const result = spawnSync(process.execPath, args, { ...options, timeout: TIMEOUT });
    if (result.status !== 0)
      throw new Error(`${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
}

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  raw: Buffer;
}

function get(urlPath: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: urlPath,
        headers: { Host: HOST, 'X-Forwarded-Proto': 'https', ...headers },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: raw.toString('utf8'),
            raw,
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function firstFile(dir: string, pattern: RegExp): Promise<string> {
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && pattern.test(entry.name)) {
      return path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    }
  }
  throw new Error(`No hay ${pattern} en ${dir}`);
}

const skip = !APACHE || !MODULES;

describe.skipIf(skip)('.htaccess en Apache real', () => {
  beforeAll(async () => {
    work = await mkdtemp(path.join(os.tmpdir(), 'hotel-apache-'));
    www = path.join(work, 'www');
    www2 = path.join(work, 'www2');
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ensure-snapshot.ts'], { cwd: root });
    build(www, { SITE_ORIGIN: `https://${HOST}` });
    build(path.join(www, 'nuevo'), {
      SITE_ORIGIN: `https://${HOST}`,
      BASE_PATH: '/nuevo/',
      NOINDEX: '1',
    });
    build(path.join(www2, 'abierto'), {
      SITE_ORIGIN: `http://${BROWSER_HOST}`,
      BASE_PATH: '/abierto/',
    });
    // La validación del certificado vive en .well-known/ y nunca debe redirigirse.
    await mkdir(path.join(www, '.well-known', 'acme-challenge'), { recursive: true });
    await writeFile(path.join(www, '.well-known', 'acme-challenge', 'token'), 'ok');

    const load = [
      'mpm_event',
      'authz_core',
      'dir',
      'mime',
      'rewrite',
      'headers',
      'filter',
      'deflate',
      'alias',
      // Como en un hosting real: sin `Options -Indexes` listaría las carpetas.
      'autoindex',
    ]
      .map((name) => `LoadModule ${name}_module ${MODULES}/mod_${name}.so`)
      .join('\n');
    const conf = path.join(work, 'httpd.conf');
    await writeFile(
      conf,
      `ServerRoot "${work}"
Listen 127.0.0.1:${PORT}
${load}
ServerName ${HOST}
PidFile "${work}/httpd.pid"
ErrorLog "${work}/error.log"
DefaultRuntimeDir "${work}"
User www-data
Group www-data
TypesConfig /etc/mime.types
<Directory "${work}">
  AllowOverride All
  Require all granted
  Options FollowSymLinks Indexes
</Directory>
<VirtualHost *:${PORT}>
  ServerName ${HOST}
  ServerAlias www.otro.example
  DocumentRoot "${www}"
</VirtualHost>
<VirtualHost *:${PORT}>
  ServerName ${BROWSER_HOST}
  DocumentRoot "${www2}"
</VirtualHost>
`,
    );
    // Apache sirve como www-data: los archivos temporales deben ser legibles.
    await chmod(work, 0o755);
    spawnSync('chmod', ['-R', 'a+rX', work]);
    const check = spawnSync(APACHE as string, ['-t', '-f', conf], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(check.stderr);
    apache = spawn(APACHE as string, ['-f', conf, '-DFOREGROUND'], { stdio: 'inherit' });
    for (let i = 0; i < 50; i += 1) {
      try {
        await get('/.well-known/acme-challenge/token');
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error('Apache no arrancó');
  }, TIMEOUT);

  afterAll(async () => {
    apache?.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (work) await rm(work, { recursive: true, force: true });
  });

  describe('producción (raíz, https)', () => {
    it('sirve la portada con cabeceras de seguridad, CSP, compresión y HTML sin caché', async () => {
      const reply = await get('/', { 'Accept-Encoding': 'gzip' });
      expect(reply.status).toBe(200);
      expect(reply.headers['x-content-type-options']).toBe('nosniff');
      expect(reply.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(reply.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(reply.headers['content-security-policy']).toMatch(/script-src 'self' 'sha256-/);
      expect(reply.headers['content-encoding']).toBe('gzip');
      expect(reply.headers['cache-control']).toBe('no-cache');
      expect(reply.headers['x-robots-tag']).toBeUndefined();
    });

    it('http → https y otro host → host canónico (301)', async () => {
      const http_ = await get('/habitaciones/', { 'X-Forwarded-Proto': 'http' });
      expect(http_.status).toBe(301);
      expect(http_.headers.location).toBe(`https://${HOST}/habitaciones/`);
      const otherHost = await get('/galeria/', { Host: 'www.otro.example' });
      expect(otherHost.status).toBe(301);
      expect(otherHost.headers.location).toBe(`https://${HOST}/galeria/`);
    });

    it('.well-known/ no se redirige (el certificado se sigue validando por http)', async () => {
      const reply = await get('/.well-known/acme-challenge/token', { 'X-Forwarded-Proto': 'http' });
      expect(reply.status).toBe(200);
      expect(reply.body).toBe('ok');
    });

    it('las rutas del sitio anterior responden 301 a las nuevas', async () => {
      for (const [from, to] of [
        ['/roomTypes', '/habitaciones/'],
        ['/contactUS/', '/contacto/'],
        ['/hotel', '/'],
        ['/selectRooms', '/cotizar/'],
      ]) {
        const reply = await get(from as string);
        expect(reply.status, from).toBe(301);
        expect(new URL(reply.headers.location ?? '', `https://${HOST}`).pathname, from).toBe(to);
      }
    });

    it('ningún .htaccess se puede descargar, aunque el servidor no traiga la regla `.ht*`', async () => {
      // Este httpd.conf mínimo NO incluye el `<FilesMatch "^\.ht">` habitual: la protección es del generado.
      for (const file of [
        '/.htaccess',
        '/nuevo/.htaccess',
        '/_astro/.htaccess',
        '/img/.htaccess',
      ]) {
        const reply = await get(file);
        expect(reply.status, file).toBe(403);
        expect(reply.body, file).not.toContain('RewriteEngine');
      }
    });

    it('404 con la página propia y sin listado de carpetas', async () => {
      const missing = await get('/no-existe/');
      expect(missing.status).toBe(404);
      expect(missing.body).toContain('No encontramos esa página');
      const listing = await get('/_astro/');
      expect(listing.status).toBe(403);
      expect(listing.body).not.toContain('Index of');
    });

    it('caché: _astro/ un año inmutable, img/ una semana, el resto un día', async () => {
      const css = await firstFile(path.join(www, '_astro'), /\.css$/);
      expect((await get(`/_astro/${css}`)).headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      const image = await firstFile(path.join(www, 'img'), /\.jpg$/);
      const imageReply = await get(`/img/${image}`);
      expect(imageReply.status).toBe(200);
      expect(imageReply.headers['cache-control']).toBe('public, max-age=604800');
      const og = await get('/og/site.jpg');
      expect(og.headers['cache-control']).toBe('public, max-age=86400');
      expect((await get('/_astro/fraunces-latin-wght-normal.ukD16Tqj.woff2')).status).not.toBe(500);
    });

    it('tipos correctos para WebP, woff2 y el sitemap', async () => {
      const webp = await firstFile(path.join(www, 'img'), /\.webp$/);
      expect((await get(`/img/${webp}`)).headers['content-type']).toBe('image/webp');
      const font = await firstFile(path.join(www, '_astro'), /\.woff2$/);
      expect((await get(`/_astro/${font}`)).headers['content-type']).toBe('font/woff2');
      expect((await get('/sitemap.xml')).headers['content-type']).toMatch(/xml/);
    });
  });

  describe('staging (/nuevo/, NOINDEX)', () => {
    it('noindex por cabecera y en la página; robots bloquea', async () => {
      const reply = await get('/nuevo/');
      expect(reply.status).toBe(200);
      expect(reply.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(reply.body).toContain('<meta name="robots" content="noindex');
      expect((await get('/nuevo/robots.txt')).body).toContain('Disallow: /');
    });

    it('redirecciones y 404 dentro de la subcarpeta', async () => {
      const legacy = await get('/nuevo/roomTypes');
      expect(legacy.status).toBe(301);
      expect(new URL(legacy.headers.location ?? '', `https://${HOST}`).pathname).toBe(
        '/nuevo/habitaciones/',
      );
      const missing = await get('/nuevo/no-existe/');
      expect(missing.status).toBe(404);
      expect(missing.body).toContain('No encontramos esa página');
    });

    it('deploy:verify pasa sin errores ni avisos (todas las rutas antiguas, imagen, CSP, caché)', async () => {
      // El mismo chequeo que corre tras cada despliegue, con las peticiones dirigidas a este Apache.
      const viaApache = async (url: string) => {
        const target = new URL(url);
        const reply = await get(`${target.pathname}${target.search}`, { Host: target.host });
        const headers = new Headers();
        for (const [key, value] of Object.entries(reply.headers)) {
          for (const item of [value ?? ''].flat()) headers.append(key, item);
        }
        return new Response(new Uint8Array(reply.raw), { status: reply.status, headers });
      };
      const result = await verifyDeployment(`https://${HOST}/nuevo/`, {
        hotelName: getSnapshot().hotel.name.es,
        fetch: viaApache,
      });
      expect(result).toEqual({ errors: [], warnings: [] });
    });
  });

  describe('en el navegador, con las cabeceras reales', () => {
    it('la CSP no bloquea nada: el visor, el formulario y las fuentes funcionan', async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.route(`http://${BROWSER_HOST}/**`, async (route) => {
        const { pathname, search } = new URL(route.request().url());
        const reply = await get(`${pathname}${search}`, { Host: BROWSER_HOST });
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(reply.headers)) {
          if (
            value !== undefined &&
            !['content-length', 'transfer-encoding', 'connection'].includes(name)
          ) {
            headers[name] = Array.isArray(value) ? value.join(', ') : value;
          }
        }
        await route.fulfill({ status: reply.status, headers, body: reply.raw });
      });
      const violations: string[] = [];
      page.on('console', (message) => {
        if (/Content Security Policy|Refused to/i.test(message.text()))
          violations.push(message.text());
      });
      const base = `http://${BROWSER_HOST}/abierto/`;
      try {
        const response = await page.goto(base);
        expect(response?.headers()['content-security-policy']).toBeTruthy();
        // El visor de fotos (script en línea autorizado por hash) abre el <dialog>.
        await page.locator('a[data-gallery-item]').first().click();
        await expect.poll(() => page.locator('dialog[open]').count()).toBe(1);
        expect(await page.evaluate(() => document.fonts.check('16px "Karla Variable"'))).toBe(true);

        await page.goto(`${base}cotizar/`);
        // La isla del formulario se ejecutó (sin JS el botón queda deshabilitado).
        await expect.poll(() => page.locator('[data-quote-submit]').isEnabled()).toBe(true);
        expect(violations).toEqual([]);
      } finally {
        await browser.close();
      }
    }, 60_000);
  });
});

it.runIf(skip)('omitida: no hay Apache instalado (sudo apt-get install apache2)', () => {
  expect(skip).toBe(true);
});
