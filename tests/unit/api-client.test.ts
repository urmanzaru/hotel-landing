import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from '../../src/data/client.ts';

type Handler = (req: IncomingMessage, res: ServerResponse, call: number) => void;

let server: Server | undefined;

async function start(handler: Handler): Promise<string> {
  let call = 0;
  server = createServer((req, res) => {
    call += 1;
    handler(req, res, call);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const fast = { retryDelayMs: 0, sleep: async () => {} };

describe('createApiClient', () => {
  it('envía el Origin configurado (Node puede fijarlo) y no envía Empresa', async () => {
    let seen: IncomingMessage['headers'] = {};
    const baseUrl = await start((req, res) => {
      seen = req.headers;
      json(res, 200, { status: 'Success', message: [{ id: 'a' }] });
    });
    const client = createApiClient({ baseUrl, origin: 'http://localhost:4202', ...fast });

    expect(await client.getMessage('/roomType')).toEqual([{ id: 'a' }]);
    expect(seen.origin).toBe('http://localhost:4202');
    expect(seen.empresa).toBeUndefined();
  });

  it('devuelve null cuando message es null', async () => {
    const baseUrl = await start((_req, res) =>
      json(res, 200, { status: 'Success', message: null }),
    );
    const client = createApiClient({ baseUrl, origin: 'http://x', ...fast });
    expect(await client.getMessage('/card')).toBeNull();
  });

  it('403 en texto plano: error http sin reintentos', async () => {
    let calls = 0;
    const baseUrl = await start((_req, res) => {
      calls += 1;
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
    });
    const client = createApiClient({ baseUrl, origin: 'http://x', ...fast });

    const error = await client.getMessage('/roomType').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 403 });
    expect((error as ApiError).message).toContain('Forbidden');
    expect(calls).toBe(1);
  });

  it('reintenta 5xx y se recupera', async () => {
    const baseUrl = await start((_req, res, call) =>
      call < 3
        ? json(res, 500, { status: 'Error', message: 'boom' })
        : json(res, 200, { status: 'Success', message: 'ok' }),
    );
    const client = createApiClient({ baseUrl, origin: 'http://x', ...fast });
    expect(await client.getMessage('/hotel')).toBe('ok');
  });

  it('agota los reintentos con 5xx persistente', async () => {
    let calls = 0;
    const baseUrl = await start((_req, res) => {
      calls += 1;
      json(res, 500, { status: 'Error', message: 'not found' });
    });
    const client = createApiClient({ baseUrl, origin: 'http://x', retries: 2, ...fast });
    await expect(client.getMessage('/hotel')).rejects.toMatchObject({ kind: 'http', status: 500 });
    expect(calls).toBe(3);
  });

  it('status "Error" con HTTP 200 es un error de sobre', async () => {
    const baseUrl = await start((_req, res) =>
      json(res, 200, { status: 'Error', message: 'fallo' }),
    );
    const client = createApiClient({ baseUrl, origin: 'http://x', ...fast });
    await expect(client.getMessage('/hotel')).rejects.toMatchObject({ kind: 'envelope' });
  });

  it('un 200 que no es JSON es un error de sobre', async () => {
    const baseUrl = await start((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    });
    const client = createApiClient({ baseUrl, origin: 'http://x', ...fast });
    await expect(client.getMessage('/hotel')).rejects.toMatchObject({ kind: 'envelope' });
  });

  it('timeout: error retryable que se agota', async () => {
    const baseUrl = await start(() => {
      /* nunca responde */
    });
    const client = createApiClient({
      baseUrl,
      origin: 'http://x',
      timeoutMs: 50,
      retries: 1,
      ...fast,
    });
    await expect(client.getMessage('/hotel')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('error de red cuando no hay servidor, mostrando la causa real', async () => {
    // Un puerto que acaba de cerrarse: la conexión se rechaza (el puerto 1 lo bloquea fetch como "bad port").
    const baseUrl = await start((_req, res) =>
      json(res, 200, { status: 'Success', message: null }),
    );
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    const client = createApiClient({ baseUrl, origin: 'http://x', retries: 0, ...fast });

    const error = await client.getMessage('/hotel').catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network' });
    // La causa real (no solo "fetch failed") debe verse para poder diagnosticar.
    expect((error as ApiError).message).toContain('ECONNREFUSED');
  });
});
