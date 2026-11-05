/**
 * `.htaccess` del sitio (playbook 07), generado en `postbuild` por `scripts/write-htaccess.ts`. El servidor no se
 * configura: solo recibe archivos, así que todo va aquí. Reglas:
 * - Todo lo que depende de un módulo va dentro de `<IfModule>`: si el hosting no lo tiene, se ignora en vez de dar
 *   500 en todo el sitio.
 * - `.well-known/` nunca se redirige (validación del certificado SSL).
 * - La CSP autoriza los scripts en línea por su hash (no `'unsafe-inline'`).
 */
import { createHash } from 'node:crypto';
import { htaccessRedirects } from './legacy.ts';

export interface HtaccessOptions {
  /** Base del sitio: `/` (producción) o `/nuevo/` (staging). */
  base: string;
  /** Origen canónico (`SITE_ORIGIN`). Con `https:` se fuerza https y el host. */
  origin: string;
  /** Origen de la API del PMS: el formulario de cotización hace `fetch` a él. */
  apiOrigin: string;
  /** Hashes CSP (`'sha256-…'`) de los scripts en línea del sitio. */
  scriptHashes: string[];
  /** Staging: `X-Robots-Tag: noindex`. */
  noindex: boolean;
  /** Cloudflare Turnstile activado para este cliente. */
  turnstile: boolean;
  /** Reglas propias del hosting que hay que conservar (se copian al principio). */
  extra?: string | undefined;
}

const TURNSTILE = 'https://challenges.cloudflare.com';

/** Hash CSP de cada `<script>` en línea ejecutable (no JSON-LD ni con `src`), sin repetir. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const [, attrs = '', body = ''] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    if (/\bsrc\s*=/.test(attrs) || /type\s*=\s*["']?application\/(ld\+)?json/i.test(attrs))
      continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...hashes];
}

/** Los valores van entre comillas en el `.htaccess`: un salto de línea o una comilla lo romperían. */
function safe(name: string, value: string): string {
  if (/["\r\n\\]/.test(value))
    throw new Error(`${name} contiene caracteres no permitidos: ${value}`);
  return value;
}

export function contentSecurityPolicy(options: HtaccessOptions): string {
  const api = safe('apiOrigin', new URL(options.apiOrigin).origin);
  const extraScript = options.turnstile ? [TURNSTILE] : [];
  const directives = [
    "default-src 'self'",
    ["script-src 'self'", ...options.scriptHashes.map((h) => safe('hash', h)), ...extraScript].join(
      ' ',
    ),
    // Astro emite atributos `style` (variables CSS): los hashes no cubren atributos.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api}`,
    options.turnstile ? `frame-src ${TURNSTILE}` : "frame-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(options.origin.startsWith('https:') ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildHtaccess(options: HtaccessOptions): string {
  const origin = new URL(safe('origin', options.origin));
  const base = safe('base', options.base);
  const host = origin.host;
  const csp = contentSecurityPolicy(options);
  const forceHttps = origin.protocol === 'https:';

  const sections: string[] = [
    '# Generado por scripts/write-htaccess.ts (playbook 07). No editar a mano: se sobrescribe en cada build.',
  ];
  if (options.extra?.trim()) {
    sections.push(
      `# --- Reglas propias del hosting (clients/<cliente>.htaccess) ---\n${options.extra.trim()}`,
    );
  }

  sections.push(
    ['Options -Indexes', 'DirectoryIndex index.html', `ErrorDocument 404 ${base}404.html`].join(
      '\n',
    ),
  );

  if (forceHttps) {
    sections.push(
      [
        '# https y un solo host canónico. `.well-known/` queda fuera (validación del certificado).',
        '<IfModule mod_rewrite.c>',
        '  RewriteEngine On',
        '  RewriteCond %{REQUEST_URI} !/\\.well-known/',
        '  RewriteCond %{HTTPS} !=on',
        '  RewriteCond %{HTTP:X-Forwarded-Proto} !https',
        `  RewriteRule ^ https://${host}%{REQUEST_URI} [R=301,L]`,
        '  RewriteCond %{REQUEST_URI} !/\\.well-known/',
        `  RewriteCond %{HTTP_HOST} !^${escapeRegex(host)}$ [NC]`,
        `  RewriteRule ^ https://${host}%{REQUEST_URI} [R=301,L]`,
        '</IfModule>',
      ].join('\n'),
    );
  }

  sections.push(
    [
      '# Rutas del sitio Angular anterior (src/lib/legacy.ts).',
      '<IfModule mod_alias.c>',
      ...htaccessRedirects(base)
        .split('\n')
        .map((line) => `  ${line}`),
      '</IfModule>',
    ].join('\n'),
  );

  sections.push(
    [
      '<IfModule mod_mime.c>',
      '  AddType image/webp .webp',
      '  AddType font/woff2 .woff2',
      '  AddType application/manifest+json .webmanifest',
      '  AddDefaultCharset utf-8',
      '  AddCharset utf-8 .html .css .js .xml .txt',
      '</IfModule>',
      '<IfModule mod_deflate.c>',
      '  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml application/xml application/javascript text/javascript application/json image/svg+xml',
      '</IfModule>',
    ].join('\n'),
  );

  sections.push(
    [
      '<IfModule mod_headers.c>',
      '  Header always set X-Content-Type-Options "nosniff"',
      '  Header always set Referrer-Policy "strict-origin-when-cross-origin"',
      '  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"',
      '  Header always set X-Frame-Options "SAMEORIGIN"',
      `  Header always set Content-Security-Policy "${csp}"`,
      ...(options.noindex ? ['  Header always set X-Robots-Tag "noindex, nofollow"'] : []),
      '  # HTML: revalidar siempre (los datos del PMS cambian en cada reconstrucción).',
      '  <FilesMatch "\\.html$">',
      '    Header set Cache-Control "no-cache"',
      '  </FilesMatch>',
      '  # Resto de recursos sin hash (logo, imágenes para compartir, sitemap): un día.',
      '  <FilesMatch "\\.(jpe?g|png|webp|svg|ico|xml|txt)$">',
      '    Header set Cache-Control "public, max-age=86400"',
      '  </FilesMatch>',
      '</IfModule>',
    ].join('\n'),
  );

  return `${sections.join('\n\n')}\n`;
}

/** `.htaccess` de una carpeta de recursos (`_astro/`, `img/`): sobrescribe la caché del de la raíz. */
export function cacheHtaccess(options: { maxAge: number; immutable: boolean }): string {
  const value = `public, max-age=${options.maxAge}${options.immutable ? ', immutable' : ''}`;
  return [
    '# Generado por scripts/write-htaccess.ts (playbook 07).',
    '<IfModule mod_headers.c>',
    `  Header set Cache-Control "${value}"`,
    '  <FilesMatch ".*">',
    `    Header set Cache-Control "${value}"`,
    '  </FilesMatch>',
    '</IfModule>',
    '',
  ].join('\n');
}
