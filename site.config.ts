import { CLIENTS } from './clients/index.ts';
import type { ClientConfig } from './clients/types.ts';

/** Clientes disponibles, por slug. Alta de uno nuevo: `npm run client:new` (ver docs/runbooks/nuevo-cliente.md). */
export const clients: Record<string, ClientConfig> = Object.fromEntries(
  CLIENTS.map((client) => [client.slug, client]),
);

export const DEFAULT_CLIENT = 'lacabana';

export type SiteConfig = ClientConfig & {
  /**
   * `NOINDEX=1` (staging): todas las páginas con `noindex`, `robots.txt` que bloquea, sitemap vacío y
   * `X-Robots-Tag` en el `.htaccess`.
   */
  noindex: boolean;
};

type Env = Record<string, string | undefined>;

function normalizeUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} no es una URL válida: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} debe empezar con http:// o https://: "${value}"`);
  }
  // `origin` no lleva ruta ni barra final; la API base tampoco.
  return url.origin;
}

/**
 * Resuelve la configuración del sitio: el cliente elegido con `CLIENT` y las
 * sobrescrituras de entorno `SITE_ORIGIN`, `PUBLIC_API_URL` y `HOTEL_ID`.
 */
export function loadSiteConfig(env: Env = process.env): SiteConfig {
  const slug = env.CLIENT?.trim() || DEFAULT_CLIENT;
  const client = clients[slug];
  if (!client) {
    throw new Error(`CLIENT="${slug}" no existe. Disponibles: ${Object.keys(clients).join(', ')}`);
  }

  const origin = env.SITE_ORIGIN?.trim();
  const apiBaseUrl = env.PUBLIC_API_URL?.trim();
  const hotelId = env.HOTEL_ID?.trim();

  return {
    ...client,
    origin: normalizeUrl('SITE_ORIGIN', origin || client.origin),
    apiBaseUrl: normalizeUrl('PUBLIC_API_URL', apiBaseUrl || client.apiBaseUrl),
    hotelId: hotelId || client.hotelId,
    noindex: ['1', 'true', 'yes'].includes((env.NOINDEX ?? '').trim().toLowerCase()),
  };
}

/** Normaliza la base del sitio: siempre empieza y termina con `/` (`""` → `/`, `nuevo` → `/nuevo/`). */
export function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (/[^A-Za-z0-9._~/-]/.test(trimmed)) throw new Error(`BASE_PATH no válido: "${raw}"`);
  return trimmed ? `/${trimmed}/` : '/';
}
