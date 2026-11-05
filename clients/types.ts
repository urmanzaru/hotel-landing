/** Configuración de un cliente (hotel). Un archivo por cliente en `clients/<slug>.config.ts`. */

export type Locale = 'es' | 'en';

export interface ClientConfig {
  /** Identificador corto; coincide con el valor de la variable `CLIENT`. */
  slug: string;
  /** Id del hotel en el PMS. El sitio elige el hotel por este id, nunca por posición ni heurística. */
  hotelId: string;
  /**
   * Origin con el que la API del PMS identifica al hotel (campo `url` del hotel en el PMS).
   * Debe coincidir exactamente: esquema + host + puerto, sin barra final.
   */
  origin: string;
  /** URL base de la API del PMS. */
  apiBaseUrl: string;
  defaultLocale: Locale;
  locales: readonly Locale[];
  /** Zona horaria IANA del hotel; se usa para validar "hoy" en el formulario de cotización. */
  timeZone: string;
  /** Horas de entrada y salida (HH:mm) usadas si el PMS no las trae. */
  checkInTime: string;
  checkOutTime: string;
  /** Coordenadas manuales: la API del PMS devuelve valores inválidos. */
  coordinates: { lat: number; lng: number };
  /** Contacto opcional que no viene del PMS. */
  contact: { whatsapp?: string };
  /** Sobrescrituras de tokens CSS del sistema de diseño (playbook 03), p. ej. `{ '--color-brand': '#6B3220' }`. */
  theme: Record<`--${string}`, string>;
}

export function defineClient(config: ClientConfig): ClientConfig {
  return config;
}
