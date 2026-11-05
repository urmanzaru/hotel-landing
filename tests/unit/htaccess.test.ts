import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildHtaccess,
  cacheHtaccess,
  contentSecurityPolicy,
  inlineScriptHashes,
  type HtaccessOptions,
} from '../../src/lib/htaccess.ts';

const sha = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`;

const base: HtaccessOptions = {
  base: '/',
  origin: 'https://www.hotel.example',
  apiOrigin: 'https://api.hotel.example',
  scriptHashes: [sha('console.log(1)')],
  noindex: false,
  turnstile: false,
};

describe('inlineScriptHashes', () => {
  it('toma el hash exacto de cada script ejecutable en línea, sin repetir', () => {
    const html = `
      <script type="module">console.log(1)</script>
      <script>console.log(1)</script>
      <script type="application/ld+json">{"a":1}</script>
      <script type="module" src="/_astro/x.js"></script>
      <script>\nlet a = "é";\n</script>`;
    expect(inlineScriptHashes(html)).toEqual([sha('console.log(1)'), sha('\nlet a = "é";\n')]);
  });

  it('sin scripts en línea no hay hashes', () => {
    expect(inlineScriptHashes('<p>hola</p><script src="/a.js"></script>')).toEqual([]);
  });
});

describe('contentSecurityPolicy', () => {
  it('solo el propio sitio, la API y los scripts en línea conocidos', () => {
    const csp = contentSecurityPolicy(base);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' ${sha('console.log(1)')}`);
    expect(csp).toContain("connect-src 'self' https://api.hotel.example");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain('challenges.cloudflare.com');
    expect(csp).not.toContain('"');
  });

  it('con Turnstile permite su script y su iframe', () => {
    const csp = contentSecurityPolicy({ ...base, turnstile: true });
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
  });

  it('en http (desarrollo) no fuerza https en los recursos', () => {
    expect(contentSecurityPolicy({ ...base, origin: 'http://localhost:4202' })).not.toContain(
      'upgrade-insecure-requests',
    );
  });
});

describe('buildHtaccess', () => {
  const out = buildHtaccess(base);

  it('todo va dentro de <IfModule> (sin el módulo no rompe el sitio)', () => {
    const lines = out.split('\n');
    let depth = 0;
    const exposed: string[] = [];
    for (const line of lines.map((l) => l.trim())) {
      if (line.startsWith('<IfModule')) depth += 1;
      else if (line.startsWith('</IfModule')) depth -= 1;
      else if (
        depth === 0 &&
        line &&
        !line.startsWith('#') &&
        !/^(Options|DirectoryIndex|ErrorDocument)\b/.test(line) // núcleo de Apache: siempre existe
      ) {
        exposed.push(line);
      }
    }
    expect(depth).toBe(0);
    expect(exposed).toEqual([]);
  });

  it('sin listado de carpetas, índice y página 404 con la base', () => {
    expect(out).toContain('Options -Indexes');
    expect(out).toContain('DirectoryIndex index.html');
    expect(out).toContain('ErrorDocument 404 /404.html');
    expect(buildHtaccess({ ...base, base: '/nuevo/' })).toContain(
      'ErrorDocument 404 /nuevo/404.html',
    );
  });

  it('fuerza https y el host canónico, salvo para .well-known (validación del certificado)', () => {
    expect(out).toContain('RewriteCond %{REQUEST_URI} !/\\.well-known/');
    expect(out).toContain('RewriteCond %{HTTP:X-Forwarded-Proto} !https');
    expect(out).toContain('RewriteRule ^ https://www.hotel.example%{REQUEST_URI} [R=301,L]');
    expect(out).toContain('RewriteCond %{HTTP_HOST} !^www\\.hotel\\.example$ [NC]');
    // Con un origen http (sin certificado) no se fuerza nada.
    expect(buildHtaccess({ ...base, origin: 'http://localhost:4202' })).not.toContain(
      'RewriteRule ^ https',
    );
  });

  it('el propio .htaccess (y cualquier .ht*) no se puede descargar aunque el hosting no lo proteja', () => {
    // Con mod_rewrite, que ya hace falta (no exige otro AllowOverride: un `Require` podría dar 500).
    for (const variant of [out, buildHtaccess({ ...base, origin: 'http://localhost:4202' })]) {
      expect(variant).toContain('RewriteRule (^|/)\\.ht - [F,L]');
    }
  });

  it('redirige las rutas del sitio anterior con 301', () => {
    expect(out).toContain('RedirectMatch 301 ^/roomTypes/?$ /habitaciones/');
  });

  it('cabeceras de seguridad, CSP entre comillas y HTML sin caché', () => {
    expect(out).toContain('Header always set X-Content-Type-Options "nosniff"');
    expect(out).toContain('Header always set Referrer-Policy "strict-origin-when-cross-origin"');
    expect(out).toContain(
      `Header always set Content-Security-Policy "${contentSecurityPolicy(base)}"`,
    );
    expect(out).toMatch(/<FilesMatch "\\\.html\$">\s*Header set Cache-Control "no-cache"/);
    expect(out).toContain('AddOutputFilterByType DEFLATE text/html');
    expect(out).not.toContain('X-Robots-Tag');
  });

  it('staging: noindex también por cabecera', () => {
    expect(buildHtaccess({ ...base, noindex: true })).toContain(
      'Header always set X-Robots-Tag "noindex, nofollow"',
    );
  });

  it('las reglas propias del hosting se conservan al principio', () => {
    const extra = 'SetEnv PHP_VER 8\n# regla del hosting';
    const text = buildHtaccess({ ...base, extra });
    expect(text.indexOf('SetEnv PHP_VER 8')).toBeLessThan(text.indexOf('Options -Indexes'));
  });

  it('rechaza valores que romperían el archivo (saltos de línea o comillas)', () => {
    expect(() =>
      buildHtaccess({ ...base, origin: 'https://a.example"\nRewriteEngine Off' }),
    ).toThrow();
    expect(() => buildHtaccess({ ...base, apiOrigin: 'https://a.example" x' })).toThrow();
  });
});

describe('cacheHtaccess', () => {
  it('archivos con hash: un año e inmutables', () => {
    expect(cacheHtaccess({ maxAge: 31536000, immutable: true })).toContain(
      'Header set Cache-Control "public, max-age=31536000, immutable"',
    );
  });
  it('otros recursos: el tiempo indicado, sin immutable', () => {
    const out = cacheHtaccess({ maxAge: 604800, immutable: false });
    expect(out).toContain('Header set Cache-Control "public, max-age=604800"');
    expect(out).toContain('<IfModule mod_headers.c>');
  });
});
