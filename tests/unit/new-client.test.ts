import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ClientConfig } from '../../clients/types.ts';
import {
  clientConfigSource,
  clientIdentifier,
  negativeNumberArgs,
  nextDevPort,
  registerClient,
  validateNewClient,
  type NewClientInput,
} from '../../src/lib/new-client.ts';

const good: NewClientInput = {
  slug: 'hotel-mar',
  hotelId: '0123456789abcdef01234567',
  devPort: 4203,
  apiBaseUrl: 'https://apihotel-dev.spinoff.website',
  timeZone: 'America/Cancun',
  lat: 21.1619,
  lng: -86.8515,
  locales: ['es', 'en'],
};

describe('client:new (alta de un hotel, playbook 09)', () => {
  it('acepta datos correctos', () => {
    expect(validateNewClient(good, ['lacabana'])).toEqual([]);
  });

  it('explica cada dato que falta o está mal', () => {
    const problems = validateNewClient(
      {
        ...good,
        slug: 'Hotel Mar',
        hotelId: '123',
        devPort: 80,
        apiBaseUrl: 'http://api',
        timeZone: 'Cancun',
        lat: 0,
        lng: 999,
        locales: ['en'],
      },
      [],
    );
    expect(problems.map((problem) => problem.split(/[: ]/)[0])).toEqual([
      'slug',
      '--hotel-id',
      '--dev-port',
      '--api',
      '--tz',
      '--lat',
      '--lng',
      '--locales',
    ]);
    expect(validateNewClient(good, ['hotel-mar'])).toEqual(['ya existe un cliente «hotel-mar»']);
  });

  it('el archivo generado es una configuración válida con los datos dados', async () => {
    // Se escribe junto a una copia de types.ts y se importa de verdad.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'client-'));
    try {
      await copyFile(path.join(process.cwd(), 'clients/types.ts'), path.join(dir, 'types.ts'));
      const file = path.join(dir, 'hotel-mar.config.ts');
      await writeFile(file, clientConfigSource(good));
      const config = ((await import(pathToFileURL(file).href)) as { default: ClientConfig })
        .default;
      expect(config).toMatchObject({
        slug: 'hotel-mar',
        hotelId: good.hotelId,
        origin: 'http://localhost:4203',
        timeZone: 'America/Cancun',
        locales: ['es', 'en'],
        coordinates: { lat: 21.1619, lng: -86.8515 },
        theme: {},
      });
      expect(config.logoFile).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('registra el cliente en clients/index.ts en orden alfabético y sin duplicar', () => {
    const current = readFileSync(path.join(process.cwd(), 'clients/index.ts'), 'utf8');
    const once = registerClient(current, 'hotel-mar');
    expect(once).toContain("import hotelMar from './hotel-mar.config.ts';");
    expect(once).toContain("import lacabana from './lacabana.config.ts';");
    expect(once.indexOf('hotelMar from')).toBeLessThan(once.indexOf('lacabana from'));
    expect(once).toContain('export const CLIENTS: readonly ClientConfig[] = [hotelMar, lacabana];');
    expect(once).toContain("import type { ClientConfig } from './types.ts';");
    expect(registerClient(once, 'hotel-mar')).toBe(once);
    expect(registerClient(once, 'arena')).toContain('= [arena, hotelMar, lacabana];');
  });

  it('acepta coordenadas negativas sin «=» (toda la longitud de México es negativa)', () => {
    expect(
      negativeNumberArgs(['hotel-mar', '--lat', '21.1', '--lng', '-86.85', '--tz', 'X']),
    ).toEqual(['hotel-mar', '--lat', '21.1', '--lng=-86.85', '--tz', 'X']);
    expect(negativeNumberArgs(['--lat', '-9', '--lng=-1'])).toEqual(['--lat=-9', '--lng=-1']);
    // Otra opción tras --lng no se pega (falta el valor y lo dirá la validación).
    expect(negativeNumberArgs(['--lng', '--tz', 'X'])).toEqual(['--lng', '--tz', 'X']);
  });

  it('identificador y siguiente puerto de desarrollo', () => {
    expect(clientIdentifier('hotel-mar-2')).toBe('hotelMar2');
    expect(nextDevPort(['http://localhost:4202'])).toBe(4203);
    expect(nextDevPort(['http://localhost:4202', 'http://localhost:4207', 'https://x.mx'])).toBe(
      4208,
    );
  });
});
