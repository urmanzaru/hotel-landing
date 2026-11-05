import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../../site.config.ts';
import type { ApiClient } from '../../src/data/client.ts';
import {
  createFixtureImageFetcher,
  generateFixtureSnapshot,
  sampleIndex,
} from '../../src/data/fixture.ts';
import { pruneImages } from '../../src/data/images.ts';
import { runPipeline } from '../../src/data/pipeline.ts';
import { snapshotSchema } from '../../src/data/types.ts';

const root = process.cwd();
const config = loadSiteConfig({});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'hotel-fixture-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const outputs = () => ({
  snapshotPath: path.join(dir, 'snapshot.json'),
  imagesOutDir: path.join(dir, 'public', 'img'),
  cacheDir: path.join(dir, '.cache', 'fixture'),
});

describe('snapshot de muestra', () => {
  it('se marca como fixture y trae datos y todas sus imágenes', async () => {
    const result = await generateFixtureSnapshot(root, config, outputs());
    expect(result.snapshot.dataSource).toBe('fixture');
    expect(result.broken).toEqual([]);
    expect(result.snapshot.roomTypes.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(result.snapshot.images).length).toBeGreaterThanOrEqual(5);
    const onDisk = snapshotSchema.parse(JSON.parse(await readFile(outputs().snapshotPath, 'utf8')));
    expect(onDisk.dataSource).toBe('fixture');
  });

  it('el logo conserva su transparencia (PNG) y las fotos son JPEG', async () => {
    const { snapshot } = await generateFixtureSnapshot(root, config, outputs());
    expect(snapshot.images['5fe1ffca46f0600fec51463b']?.fallbackFormat).toBe('png');
    expect(snapshot.images['6018facbe13600442e6aaa87']?.fallbackFormat).toBe('jpeg');
  });

  it('reparte las imágenes entre las ilustraciones de forma estable', () => {
    expect(sampleIndex('abc', 4)).toBe(sampleIndex('abc', 4));
    expect(sampleIndex('abc', 4)).toBeGreaterThanOrEqual(0);
    expect(sampleIndex('abc', 4)).toBeLessThan(4);
  });

  it('el generador de imágenes devuelve el logo tal cual y un JPEG para el resto', async () => {
    const fetcher = createFixtureImageFetcher({
      samplesDir: path.join(root, 'src', 'assets', 'design-sample'),
      logoFile: path.join(root, 'docs', 'brand', 'logo-lacabana-source.png'),
      logoId: 'logo-id',
    });
    const logo = await fetcher('https://x.test/imagen/logo-id');
    expect(logo.bytes?.subarray(1, 4).toString()).toBe('PNG');
    const photo = await fetcher('https://x.test/imagen/otra');
    expect(photo.bytes?.subarray(0, 2).toString('hex')).toBe('ffd8');
  });
});

describe('protección: los datos de muestra no se publican', () => {
  const failing: ApiClient = {
    async getMessage() {
      throw new Error('HTTP 403 Forbidden');
    },
  };

  it('un snapshot de muestra en caché NUNCA sirve de respaldo de uno real', async () => {
    // Se genera uno de muestra y queda como `last-good` en la caché…
    await generateFixtureSnapshot(root, config, outputs());
    expect(existsSync(path.join(outputs().cacheDir, 'last-good-snapshot.json'))).toBe(true);

    // …y una ejecución REAL con la API caída, sobre esa misma caché, debe fallar en vez de reutilizarlo.
    await expect(
      runPipeline({
        client: failing,
        config,
        cacheDir: outputs().cacheDir,
        snapshotPath: path.join(dir, 'real.json'),
        imagesOutDir: outputs().imagesOutDir,
      }),
    ).rejects.toThrow(/no hay uno anterior/);
    expect(existsSync(path.join(dir, 'real.json'))).toBe(false);
  });

  const runAssert = (snapshotPath: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/assert-live-data.ts'], {
      cwd: root,
      env: { ...process.env, SNAPSHOT_PATH: snapshotPath },
      encoding: 'utf8',
    });

  it('data:assert-live rechaza un snapshot de muestra', async () => {
    await generateFixtureSnapshot(root, config, outputs());
    const result = runAssert(outputs().snapshotPath);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/MUESTRA/);
  });

  it('data:assert-live acepta un snapshot real y rechaza uno inexistente', async () => {
    await generateFixtureSnapshot(root, config, outputs());
    const real = JSON.parse(await readFile(outputs().snapshotPath, 'utf8')) as Record<
      string,
      unknown
    >;
    real['dataSource'] = 'api';
    const realPath = path.join(dir, 'api.json');
    await writeFile(realPath, JSON.stringify(real));
    expect(runAssert(realPath).status).toBe(0);
    expect(runAssert(path.join(dir, 'no-existe.json')).status).toBe(1);
  });

  it('un snapshot antiguo sin dataSource se trata como real (compatibilidad)', async () => {
    const { snapshot } = await generateFixtureSnapshot(root, config, outputs());
    // Un snapshot guardado antes de existir `dataSource`: la clave simplemente no está.
    const legacy: Record<string, unknown> = { ...snapshot };
    delete legacy['dataSource'];
    expect('dataSource' in legacy).toBe(false);
    expect(snapshotSchema.parse(legacy).dataSource).toBe('api');
  });
});

describe('pruneImages', () => {
  it('borra las carpetas que ya no están en el snapshot y respeta archivos sueltos', async () => {
    const out = path.join(dir, 'img');
    for (const id of ['viva', 'huerfana1', 'huerfana2']) {
      await mkdir(path.join(out, id), { recursive: true });
      await writeFile(path.join(out, id, '480.webp'), 'x');
    }
    await writeFile(path.join(out, 'leeme.txt'), 'x');

    const removed = await pruneImages(out, ['viva']);
    expect(removed.sort()).toEqual(['huerfana1', 'huerfana2']);
    expect(existsSync(path.join(out, 'viva', '480.webp'))).toBe(true);
    expect(existsSync(path.join(out, 'huerfana1'))).toBe(false);
    expect(existsSync(path.join(out, 'leeme.txt'))).toBe(true);
  });

  it('no falla si la carpeta no existe', async () => {
    expect(await pruneImages(path.join(dir, 'no-existe'), [])).toEqual([]);
  });

  it('el pipeline elimina restos de datos de muestra al generar un snapshot real', async () => {
    await generateFixtureSnapshot(root, config, outputs());
    const fixtureDirs = ['5fe1ffca46f0600fec51463b', '6018facbe13600442e6aaa87'];
    for (const id of fixtureDirs)
      expect(existsSync(path.join(outputs().imagesOutDir, id))).toBe(true);

    // Una "ejecución real" cuyo snapshot solo contiene otra imagen.
    const realClient: ApiClient = {
      async getMessage(endpoint) {
        if (endpoint === '/roomType') {
          return [
            {
              id: 'r1',
              esName: 'Única',
              status: true,
              nAdults: 2,
              photoMain: { urlImage: 'imagen/soloreal' },
            },
          ];
        }
        return [{ id: config.hotelId, nameSpanish: 'Hotel real', images: [] }];
      },
    };
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#123456' },
    })
      .jpeg()
      .toBuffer();
    const result = await runPipeline({
      client: realClient,
      config,
      cacheDir: path.join(dir, '.cache', 'real'),
      snapshotPath: path.join(dir, 'real.json'),
      imagesOutDir: outputs().imagesOutDir,
      fetchImage: async () => ({ ok: true, status: 200, bytes: jpeg }),
    });
    expect(result.snapshot.dataSource).toBe('api');
    expect(existsSync(path.join(outputs().imagesOutDir, 'soloreal'))).toBe(true);
    for (const id of fixtureDirs)
      expect(existsSync(path.join(outputs().imagesOutDir, id))).toBe(false);
  });
});
