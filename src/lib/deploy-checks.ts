/**
 * Comprobaciones del despliegue (playbook 07):
 * - `checkDist`: humo ANTES de subir por FTP (la salida tiene lo esencial y el modo de indexación esperado).
 * - `verifyDeployment`: DESPUÉS de subir, contra el sitio publicado (responde, es nuestro sitio, las imágenes cargan
 *   y el hosting aplica el `.htaccess`).
 * - `findPrivateData`: ningún dato fiscal del hotel llega a la salida (regla del proyecto; prueba 4 del playbook 08).
 * Devuelven `errors` (el job falla) y `warnings` (se avisa; p. ej. el hosting ignora una cabecera).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGACY_REDIRECTS } from './legacy.ts';
import { routes } from './routes.ts';

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

export function checkDist(
  dir: string,
  options: { hotelName: string; noindex: boolean },
): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const required = [
    'index.html',
    'habitaciones/index.html',
    'cotizar/index.html',
    '404.html',
    '.htaccess',
  ];
  for (const file of required) {
    if (!existsSync(path.join(dir, file))) errors.push(`Falta ${file}`);
  }
  if (!existsSync(path.join(dir, '_astro'))) errors.push('Falta la carpeta _astro/ (CSS y JS)');

  const indexFile = path.join(dir, 'index.html');
  if (existsSync(indexFile)) {
    const html = readFileSync(indexFile, 'utf8');
    if (!html.includes(options.hotelName)) {
      errors.push(`La portada no contiene el nombre del hotel («${options.hotelName}»)`);
    }
    const noindex = /<meta name="robots" content="noindex/.test(html);
    if (options.noindex && !noindex)
      errors.push('Se esperaba noindex (staging) y la portada no lo lleva');
    if (!options.noindex && noindex) {
      errors.push(
        'La portada lleva noindex: no se publica en producción (¿datos de muestra o NOINDEX=1?)',
      );
    }
  }
  for (const finding of findPrivateData(dir))
    errors.push(`Datos fiscales en la salida: ${finding}`);
  const htaccess = path.join(dir, '.htaccess');
  if (existsSync(htaccess)) {
    const text = readFileSync(htaccess, 'utf8');
    if (options.noindex !== text.includes('X-Robots-Tag')) {
      errors.push('El .htaccess no coincide con el modo de indexación (X-Robots-Tag)');
    }
  }
  return { errors, warnings };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const TEXT_FILE = /\.(html|js|mjs|css|json|xml|txt|svg|webmanifest)$|^\.htaccess$/;

/** Lo que el PMS manda del hotel y no debe publicarse: los campos (por si un mapper los deja pasar) y los valores. */
const PRIVATE_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'campo rfc', pattern: /\brfc\b/i },
  { label: 'campo businessName', pattern: /\bbusinessName/i },
  { label: 'campo regimenCFDI', pattern: /\bregimenCFDI/i },
  { label: 'campo productOrServiceDefault', pattern: /\bproductOrServiceDefault/i },
  // RFC mexicano: 3 (moral) o 4 (física) letras, fecha AAMMDD y homoclave.
  { label: 'un RFC', pattern: /\b[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}\b/ },
  { label: 'una razón social (S.A. de C.V.)', pattern: /\bS\.?\s?A\.?\s+de\s+C\.?\s?V\b/i },
];

function textFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && TEXT_FILE.test(entry.name))
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    )
    .sort();
}

/**
 * Busca datos fiscales en los archivos de texto de `dir`. Devuelve `archivo: qué` sin el valor encontrado (para no
 * copiarlo a los registros de CI). Los `data:` en línea (imágenes en base64) se ignoran: pueden parecer un RFC.
 */
export function findPrivateData(dir: string): string[] {
  const findings: string[] = [];
  for (const file of textFiles(dir)) {
    const text = readFileSync(path.join(dir, file), 'utf8').replace(/data:[^"')\s]+/g, '');
    for (const { label, pattern } of PRIVATE_PATTERNS) {
      if (pattern.test(text)) findings.push(`${file}: ${label}`);
    }
  }
  return findings.sort();
}

/** `siteUrl` es la URL pública del sitio con su base y barra final (`https://hotel.mx/` o `https://hotel.mx/nuevo/`). */
export async function verifyDeployment(
  siteUrl: string,
  options: { hotelName: string; fetch?: Fetch },
): Promise<CheckResult> {
  const doFetch: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  // Evita respuestas de una caché intermedia: se pide una URL única.
  const bust = `?verify=${Date.now()}`;

  let html = '';
  try {
    const home = await doFetch(`${base}${bust}`, { redirect: 'follow' });
    html = await home.text();
    if (home.status !== 200) errors.push(`La portada respondió ${home.status}`);
    else if (!html.includes(options.hotelName)) {
      errors.push(
        `La portada no contiene «${options.hotelName}»: ¿se publicó en otra carpeta o sigue el sitio anterior?`,
      );
    }
    const headers = home.headers;
    if (!headers.get('content-security-policy')) {
      warnings.push(
        'Sin Content-Security-Policy: el hosting no aplica el .htaccess (¿mod_headers?)',
      );
    }
    if (!/no-cache/.test(headers.get('cache-control') ?? '')) {
      warnings.push(
        'El HTML no lleva Cache-Control: no-cache (los cambios pueden tardar en verse)',
      );
    }
  } catch (error) {
    errors.push(
      `No se pudo abrir ${base}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { errors, warnings };
  }

  const image = /<img[^>]+src="([^"]+\/img\/[^"]+)"/.exec(html)?.[1];
  if (image) {
    const response = await doFetch(new URL(image, base).toString());
    if (response.status !== 200) errors.push(`La imagen ${image} respondió ${response.status}`);
  } else {
    warnings.push('La portada no tiene imágenes del PMS para comprobar');
  }

  // Rutas del sitio anterior: 301 a su equivalente. Si el hosting ignora el .htaccess siguen funcionando por la
  // página de respaldo ([legacy].astro), así que es un aviso, no un error.
  const basePath = new URL(base).pathname;
  const badRedirects: string[] = [];
  for (const { from, to } of LEGACY_REDIRECTS) {
    const url = `${base}${from.slice(1)}`;
    const expected = `${basePath}${routes[to].es.slice(1)}`;
    const response = await doFetch(url, { redirect: 'manual' });
    const location = response.headers.get('location');
    const target = location ? new URL(location, url).pathname : '';
    if (response.status !== 301) {
      badRedirects.push(`${from} → ${response.status} (se esperaba 301 a ${expected})`);
    } else if (target !== expected) {
      badRedirects.push(`${from} → 301 a ${target || '(sin Location)'} (se esperaba ${expected})`);
    }
  }
  if (badRedirects.length > 0) {
    warnings.push(
      `Rutas antiguas sin su 301 (revisa el .htaccess; los enlaces viejos usan la página de respaldo): ${badRedirects.join(', ')}`,
    );
  }

  const secret = await doFetch(`${base}.htaccess`, { redirect: 'manual' });
  if (secret.status === 200)
    errors.push('El .htaccess se puede descargar: el servidor no lo protege');

  return { errors, warnings };
}
