/**
 * Registro de hoteles cliente: un `clients/<slug>.config.ts` por hotel, importado aquí. `npm run client:new` añade
 * la línea; `tests/unit/clients.test.ts` falla si un archivo de cliente no está registrado.
 */
import type { ClientConfig } from './types.ts';
import lacabana from './lacabana.config.ts';

export const CLIENTS: readonly ClientConfig[] = [lacabana];
