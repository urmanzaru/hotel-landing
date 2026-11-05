/**
 * Construye el sitio completo (`astro build`) en variantes que el sitio real puede encontrarse y revisa el HTML.
 * Son lentas (unos segundos cada una) pero cazan lo que ni los tipos ni las pruebas de componentes ven:
 * enlaces sin la base del staging y páginas que se rompen con datos vacíos.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../../site.config.ts';
import { generateFixtureSnapshot } from '../../src/data/fixture.ts';

const root = process.cwd();
const astroBin = path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
const TIMEOUT = 180_000;

let work: string;
let fixtureSnapshot: string;

beforeAll(async () => {
  work = await mkdtemp(path.join(os.tmpdir(), 'hotel-build-'));
  fixtureSnapshot = path.join(work, 'fixture.json');
  await generateFixtureSnapshot(root, loadSiteConfig({}), {
    snapshotPath: fixtureSnapshot,
    imagesOutDir: path.join(work, 'img'),
    cacheDir: path.join(work, 'cache'),
  });
}, TIMEOUT);

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

/**
 * Entorno del `astro build` hijo. Vitest inyecta en `process.env` variables de Vite (`BASE_URL`, `MODE`, `DEV`,
 * `NODE_ENV`…) que el hijo heredaría y le pisarían la base del sitio: el HTML saldría sin `/nuevo/` aunque el sitio
 * esté bien. Se quitan para que el build sea igual al de una terminal limpia.
 */
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

function build(name: string, env: Record<string, string>) {
  const outDir = path.join(work, name);
  const result = spawnSync(process.execPath, [astroBin, 'build'], {
    cwd: root,
    encoding: 'utf8',
    env: cleanEnv({ ...env, OUT_DIR: outDir }),
    timeout: TIMEOUT,
  });
  return { outDir, status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const read = (outDir: string, file: string) => readFile(path.join(outDir, file), 'utf8');

describe('variante: servido desde una subcarpeta (BASE_PATH=/nuevo/)', () => {
  let outDir = '';
  let build_: ReturnType<typeof build>;
  beforeAll(() => {
    build_ = build('base', { BASE_PATH: '/nuevo/', SNAPSHOT_PATH: fixtureSnapshot });
    outDir = build_.outDir;
  }, TIMEOUT);

  it('el build termina bien', () => {
    expect(build_.status, build_.output).toBe(0);
  });

  it('ningún enlace ni recurso interno escapa de la base: todos empiezan por /nuevo/', async () => {
    const offenders: string[] = [];
    let checked = 0;
    for await (const file of walk(outDir)) {
      if (!/\.(html|css)$/.test(file)) continue;
      const text = await readFile(file, 'utf8');
      const rel = path.relative(outDir, file);
      const urls: string[] = [];
      for (const m of text.matchAll(/\b(?:href|src)="([^"]*)"/g))
        if (m[1] !== undefined) urls.push(m[1]);
      for (const m of text.matchAll(/\bsrcset="([^"]*)"/g)) {
        for (const part of (m[1] ?? '').split(',')) urls.push(part.trim().split(/\s+/)[0] ?? '');
      }
      for (const m of text.matchAll(/url\(\s*['"]?([^'")\s]+)/g))
        if (m[1] !== undefined) urls.push(m[1]);
      for (const url of urls) {
        if (!url.startsWith('/') || url.startsWith('//')) continue; // externos, anclas, tel:, mailto:
        checked += 1;
        if (!url.startsWith('/nuevo/')) offenders.push(`${rel}: ${url}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it('los archivos y páginas a los que apuntan existen en la salida', async () => {
    const missing: string[] = [];
    for await (const file of walk(outDir)) {
      if (!file.endsWith('.html')) continue;
      const html = await readFile(file, 'utf8');
      for (const m of html.matchAll(/\b(?:href|src)="(\/nuevo\/[^"#?]*)/g)) {
        const target = (m[1] ?? '').replace(/^\/nuevo\//, '');
        if (target.startsWith('img/')) continue; // las genera el pipeline de imágenes, no este build
        const full = path.join(outDir, target);
        const ok =
          target === '' || target.endsWith('/')
            ? existsSync(path.join(full, 'index.html'))
            : existsSync(full);
        if (!ok) missing.push(`${path.relative(outDir, file)} → ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('canónica, sitemap y rutas antiguas respetan la base', async () => {
    expect(await read(outDir, 'habitaciones/index.html')).toContain(
      '<link rel="canonical" href="http://localhost:4202/nuevo/habitaciones/">',
    );
    expect(await read(outDir, 'roomTypes/index.html')).toContain('url=/nuevo/habitaciones/');
  });

  it('el enlace de idioma respeta la base', async () => {
    const html = await read(outDir, 'habitaciones/familiar/index.html');
    expect(html).toMatch(/<a class="lang"[^>]*href="\/nuevo\/en\/rooms\/familiar\/"/);
  });
});

describe('variante: hotel sin habitaciones, fotos, políticas ni contacto', () => {
  let outDir = '';
  let build_: ReturnType<typeof build>;
  beforeAll(async () => {
    const snapshot = JSON.parse(await readFile(fixtureSnapshot, 'utf8')) as {
      roomTypes: unknown[];
      images: Record<string, unknown>;
      hotel: Record<string, unknown>;
    };
    snapshot.roomTypes = [];
    snapshot.images = {};
    Object.assign(snapshot.hotel, {
      imageIds: [],
      politics: [],
      phones: [],
      email: '',
      logoId: null,
    });
    const emptyPath = path.join(work, 'empty.json');
    await writeFile(emptyPath, JSON.stringify(snapshot));
    build_ = build('empty', { SNAPSHOT_PATH: emptyPath });
    outDir = build_.outDir;
  }, TIMEOUT);

  it('el build termina bien (nada se rompe por datos vacíos)', () => {
    expect(build_.status, build_.output).toBe(0);
  });

  it('habitaciones: muestra un aviso en lugar de una lista vacía y no genera detalles', async () => {
    const html = await read(outDir, 'habitaciones/index.html');
    expect(html).toContain('Estamos actualizando la información de nuestras habitaciones');
    expect(html).not.toContain('class="room"');
    expect(existsSync(path.join(outDir, 'habitaciones', 'familiar'))).toBe(false);
  });

  it('portada: sin sección de habitaciones ni de fotos, y con placeholder en lugar de imagen', async () => {
    const html = await read(outDir, 'index.html');
    expect(html).not.toContain('id="habitaciones"');
    expect(html).not.toContain('id="fotos"');
    expect(html).toContain('pic__placeholder');
    expect(html).not.toMatch(/<img[^>]+src="[^"]*\/img\//);
    expect(html).not.toContain('Ver habitaciones'); // el botón secundario del hero desaparece
  });

  it('galería y contacto muestran avisos claros', async () => {
    expect(await read(outDir, 'galeria/index.html')).toContain('Pronto publicaremos nuevas fotos.');
    const contact = await read(outDir, 'contacto/index.html');
    expect(contact).toContain('Estamos actualizando nuestros datos de contacto.');
    expect(contact).not.toContain('href="tel:');
    expect(contact).not.toContain('href="mailto:');
  });

  it('sin políticas: el pie no enlaza a ellas y la página se marca noindex', async () => {
    expect(await read(outDir, 'index.html')).not.toContain('Políticas y privacidad');
    const policies = await read(outDir, 'politicas/index.html');
    expect(policies).toContain('Estamos preparando esta información.');
    expect(policies).toMatch(/<meta name="robots" content="noindex/);
  });

  it('no queda ninguna imagen rota en ninguna página', async () => {
    const broken: string[] = [];
    for await (const file of walk(outDir)) {
      if (!file.endsWith('.html')) continue;
      const html = await readFile(file, 'utf8');
      for (const m of html.matchAll(/<img[^>]*\ssrc="(\/img\/[^"]+)"/g))
        broken.push(`${path.relative(outDir, file)}: ${m[1]}`);
    }
    expect(broken).toEqual([]);
  });
});

describe('variante: habitación renombrada en el PMS (alias de slug, playbook 09)', () => {
  let outDir = '';
  let build_: ReturnType<typeof build>;
  let room = { id: '', slug: '' };
  beforeAll(async () => {
    const snapshot = JSON.parse(await readFile(fixtureSnapshot, 'utf8')) as {
      roomTypes: { id: string; slug: string }[];
      roomSlugAliases?: Record<string, string>;
    };
    const first = snapshot.roomTypes[0];
    if (!first) throw new Error('la muestra no tiene habitaciones');
    room = first;
    snapshot.roomSlugAliases = { 'nombre-anterior': first.id };
    const aliasPath = path.join(work, 'alias.json');
    await writeFile(aliasPath, JSON.stringify(snapshot));
    const env = { SNAPSHOT_PATH: aliasPath, BASE_PATH: '/nuevo/' };
    build_ = build('alias', env);
    outDir = build_.outDir;
    // El postbuild de `npm run build`: escribe el .htaccess con los 301 de los alias.
    const htaccess = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/write-htaccess.ts'], {
      cwd: root,
      encoding: 'utf8',
      env: cleanEnv({ ...env, OUT_DIR: outDir }),
      timeout: TIMEOUT,
    });
    if (htaccess.status !== 0) throw new Error(htaccess.stderr);
  }, TIMEOUT);

  it('el build termina bien', () => {
    expect(build_.status, build_.output).toBe(0);
  });

  it('la URL anterior lleva a la actual en cada idioma (respaldo sin .htaccess), sin indexarse', async () => {
    for (const [old, current] of [
      ['habitaciones/nombre-anterior/index.html', `/nuevo/habitaciones/${room.slug}/`],
      ['en/rooms/nombre-anterior/index.html', `/nuevo/en/rooms/${room.slug}/`],
    ] as const) {
      const html = await read(outDir, old);
      expect(html, old).toContain(`content="0; url=${current}"`);
      expect(html, old).toContain('<meta name="robots" content="noindex"');
      expect(html, old).toContain(`href="http://localhost:4202${current}"`);
    }
  });

  it('el .htaccess lleva el 301 y el sitemap no incluye la URL anterior', async () => {
    const htaccess = await read(outDir, '.htaccess');
    expect(htaccess).toContain(
      `RedirectMatch 301 ^/nuevo/habitaciones/nombre-anterior/?$ /nuevo/habitaciones/${room.slug}/`,
    );
    expect(await read(outDir, 'sitemap.xml')).not.toContain('nombre-anterior');
  });
});

describe('variante: datos reales (dataSource: api)', () => {
  let outDir = '';
  let build_: ReturnType<typeof build>;
  const ORIGIN = 'https://hotel.example';
  beforeAll(async () => {
    const snapshot = JSON.parse(await readFile(fixtureSnapshot, 'utf8')) as Record<string, unknown>;
    snapshot['dataSource'] = 'api';
    const livePath = path.join(work, 'live.json');
    await writeFile(livePath, JSON.stringify(snapshot));
    build_ = build('live', { SNAPSHOT_PATH: livePath, SITE_ORIGIN: ORIGIN });
    outDir = build_.outDir;
  }, TIMEOUT);

  it('el build termina bien y ninguna página pública lleva noindex', async () => {
    expect(build_.status, build_.output).toBe(0);
    for (const file of ['index.html', 'habitaciones/index.html', 'en/rooms/familiar/index.html']) {
      expect(await read(outDir, file), file).not.toContain('noindex');
    }
  });

  it('robots.txt apunta al sitemap con el origen de producción', async () => {
    expect(await read(outDir, 'robots.txt')).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
    );
  });

  it('sitemap: cada página en los dos idiomas con sus alternativas; sin 404, diseño ni redirecciones', async () => {
    const xml = await read(outDir, 'sitemap.xml');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(`${ORIGIN}/`);
    expect(locs).toContain(`${ORIGIN}/en/rooms/familiar/`);
    expect(locs).toContain(`${ORIGIN}/politicas/`);
    expect(new Set(locs).size).toBe(locs.length);
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/habitaciones/familiar/"/>`,
    );
    expect(xml).not.toMatch(/404|design|roomTypes|contactUS|og\//);
    // Cada URL del sitemap es una página que existe en la salida.
    for (const loc of locs) {
      const rel = (loc ?? '').replace(ORIGIN, '').replace(/^\//, '');
      expect(existsSync(path.join(outDir, rel, 'index.html')), loc).toBe(true);
    }
  });

  it('la canónica usa el origen de producción', async () => {
    expect(await read(outDir, 'habitaciones/index.html')).toContain(
      `<link rel="canonical" href="${ORIGIN}/habitaciones/">`,
    );
  });
});

describe('construcción', () => {
  it('rechaza un BASE_PATH inválido con un mensaje claro', () => {
    const result = build('bad-base', { BASE_PATH: '/nuevo?x=1', SNAPSHOT_PATH: fixtureSnapshot });
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/BASE_PATH no válido/);
  });

  it('sin snapshot falla con una instrucción útil (no genera un sitio vacío)', () => {
    const result = build('no-snapshot', { SNAPSHOT_PATH: path.join(work, 'no-existe.json') });
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/data:fetch/);
  });
});
