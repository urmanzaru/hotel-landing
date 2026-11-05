/**
 * Comprobaciones del despliegue (playbook 07):
 * - `checkDist`: humo ANTES de subir por FTP (la salida tiene lo esencial y el modo de indexación esperado).
 * - `verifyDeployment`: DESPUÉS de subir, contra el sitio publicado (responde, es nuestro sitio, las imágenes cargan
 *   y el hosting aplica el `.htaccess`).
 * Devuelven `errors` (el job falla) y `warnings` (se avisa; p. ej. el hosting ignora una cabecera).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

  const legacy = await doFetch(`${base}roomTypes`, { redirect: 'manual' });
  const location = legacy.headers.get('location') ?? '';
  if (legacy.status !== 301 || !location.includes('habitaciones/')) {
    warnings.push(
      `La ruta antigua /roomTypes respondió ${legacy.status} (se esperaba 301 a habitaciones/): revisa el .htaccess`,
    );
  }

  const secret = await doFetch(`${base}.htaccess`, { redirect: 'manual' });
  if (secret.status === 200)
    errors.push('El .htaccess se puede descargar: el servidor no lo protege');

  return { errors, warnings };
}
