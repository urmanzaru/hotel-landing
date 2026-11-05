import lacabana from './clients/lacabana.config.ts';
import type { ClientConfig } from './clients/types.ts';

/** Clientes disponibles. Para dar de alta uno nuevo: crear su archivo en `clients/` y registrarlo aquí. */
export const clients: Record<string, ClientConfig> = {
  [lacabana.slug]: lacabana,
};

export const DEFAULT_CLIENT = 'lacabana';

export type SiteConfig = ClientConfig;

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
  };
}
