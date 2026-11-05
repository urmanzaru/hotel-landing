/**
 * `postbuild`: escribe los `.htaccess` de la salida (playbook 07).
 * - `<salida>/.htaccess`: https y host canónico, redirecciones del sitio anterior, cabeceras de seguridad con CSP
 *   (hashes de los scripts en línea reales del build), compresión, caché del HTML y `X-Robots-Tag` en staging.
 * - `<salida>/_astro/.htaccess`: un año e inmutable (nombres con hash). `<salida>/img/.htaccess`: una semana.
 * Variables: las mismas del build (`CLIENT`, `SITE_ORIGIN`, `PUBLIC_API_URL`, `BASE_PATH`, `NOINDEX`, `OUT_DIR`).
 * Reglas propias del hosting que haya que conservar: `clients/<cliente>.htaccess` (se copian al principio).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';
import { loadSiteConfig, normalizeBase } from '../site.config.ts';
import { buildHtaccess, cacheHtaccess, inlineScriptHashes } from '../src/lib/htaccess.ts';

const root = process.cwd();
const env = { ...loadEnv('production', root, ''), ...process.env };
const config = loadSiteConfig(env);
const outDir = path.resolve(root, env['OUT_DIR'] ?? 'dist');

async function* htmlFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

if (!existsSync(path.join(outDir, 'index.html'))) {
  console.error(`✖ No hay build en ${outDir}: ejecuta antes \`astro build\`.`);
  process.exit(1);
}

const hashes = new Set<string>();
for await (const file of htmlFiles(outDir)) {
  for (const hash of inlineScriptHashes(await readFile(file, 'utf8'))) hashes.add(hash);
}

const extraFile = path.join(root, 'clients', `${config.slug}.htaccess`);
const extra = existsSync(extraFile) ? await readFile(extraFile, 'utf8') : undefined;

await writeFile(
  path.join(outDir, '.htaccess'),
  buildHtaccess({
    base: normalizeBase(env['BASE_PATH']),
    origin: config.origin,
    apiOrigin: config.apiBaseUrl,
    scriptHashes: [...hashes].sort(),
    noindex: config.noindex,
    turnstile: Boolean(config.quote?.turnstileSiteKey),
    extra,
  }),
  'utf8',
);
const folders = [
  ['_astro', cacheHtaccess({ maxAge: 31536000, immutable: true })],
  ['img', cacheHtaccess({ maxAge: 604800, immutable: false })],
] as const;
for (const [folder, content] of folders) {
  if (existsSync(path.join(outDir, folder))) {
    await writeFile(path.join(outDir, folder, '.htaccess'), content, 'utf8');
  }
}

console.log(
  `✔ .htaccess en ${path.relative(root, outDir) || '.'} (origen ${config.origin}, ${hashes.size} script(s) en línea${
    config.noindex ? ', noindex' : ''
  }${extra ? ', con reglas propias del hosting' : ''})`,
);
