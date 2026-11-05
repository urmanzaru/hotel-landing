/**
 * Cliente de la API del PMS para el BUILD (Node). Fija la cabecera `Origin` con la que la API identifica
 * al hotel; en el navegador la pone el propio navegador.
 *
 * No envía `Empresa` (la API la ignora). Reintenta solo errores de red, timeouts y 5xx.
 */
import { envelopeSchema } from './schemas.ts';

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'envelope';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly path: string;
  readonly status: number | undefined;

  constructor(kind: ApiErrorKind, path: string, message: string, status?: number) {
    super(`${path}: ${message}`);
    this.name = 'ApiError';
    this.kind = kind;
    this.path = path;
    this.status = status;
  }

  get retryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.kind === 'http' && this.status !== undefined && this.status >= 500)
    );
  }
}

/** `fetch failed` esconde la causa real (DNS, conexión rechazada, TLS...): se saca de `error.cause`. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return `${error.message} (${code ? `${code}: ` : ''}${cause.message})`;
  }
  return error.message;
}

export interface ApiClient {
  /** GET `path` y devuelve `message` del sobre (puede ser `null`). */
  getMessage(path: string): Promise<unknown>;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Valor de la cabecera `Origin` (debe coincidir con el campo `url` del hotel en el PMS). */
  origin: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Reintentos adicionales tras el primer intento. */
  retries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function attempt(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        headers: { Origin: options.origin, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ApiError('timeout', path, `sin respuesta en ${timeoutMs} ms`);
      }
      throw new ApiError('network', path, `error de red: ${describeError(error)}`);
    }

    const body = await response.text();
    if (!response.ok) {
      const snippet = body.slice(0, 120).replace(/\s+/g, ' ').trim();
      throw new ApiError(
        'http',
        path,
        `HTTP ${response.status} ${snippet}`.trim(),
        response.status,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new ApiError('envelope', path, 'la respuesta 200 no es JSON válido', response.status);
    }
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new ApiError('envelope', path, 'falta el sobre { status, message }', response.status);
    }
    // `status` es string ("Success"/"Error"), aunque el front lo tipa como number.
    if (String(envelope.data.status).toLowerCase() !== 'success') {
      throw new ApiError(
        'envelope',
        path,
        `status "${String(envelope.data.status)}": ${JSON.stringify(envelope.data.message)}`,
        response.status,
      );
    }
    return envelope.data.message ?? null;
  }

  return {
    async getMessage(path: string): Promise<unknown> {
      let lastError: ApiError | undefined;
      for (let i = 0; i <= retries; i += 1) {
        try {
          return await attempt(path);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          lastError = error;
          if (!error.retryable || i === retries) break;
          await sleep(retryDelayMs * 2 ** i);
        }
      }
      throw lastError ?? new ApiError('network', path, 'error desconocido');
    },
  };
}
