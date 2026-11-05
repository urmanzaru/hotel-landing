/**
 * Datos de MUESTRA para desarrollar sin acceso a la API del PMS: respuestas sintéticas de `tests/fixtures/api/` e
 * imágenes generadas desde las ilustraciones de `src/assets/design-sample/`. El snapshot resultante lleva
 * `dataSource: 'fixture'` y no puede publicarse (`npm run data:assert-live`).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { SiteConfig } from '../../site.config.ts';
import type { ApiClient } from './client.ts';
import type { ImageFetcher } from './images.ts';
import { runPipeline, type PipelineResult } from './pipeline.ts';

export function createFixtureClient(fixturesDir: string): ApiClient {
  return {
    async getMessage(endpoint) {
      const file =
        endpoint === '/hotel' ? 'hotel.json' : endpoint === '/roomType' ? 'roomType.json' : null;
      if (!file) throw new Error(`Los datos de muestra no incluyen ${endpoint}`);
      return JSON.parse(await readFile(path.join(fixturesDir, file), 'utf8')) as unknown;
    },
  };
}

/** Suma de los códigos del id: reparte las imágenes entre las ilustraciones de muestra de forma estable. */
export function sampleIndex(id: string, count: number): number {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return sum % count;
}

export function createFixtureImageFetcher(options: {
  samplesDir: string;
  /** Archivo del logo (PNG con transparencia) para la imagen del logo del hotel. */
  logoFile: string;
  logoId: string;
  sampleCount?: number;
}): ImageFetcher {
  const count = options.sampleCount ?? 4;
  return async (url) => {
    const id = url.split('/').filter(Boolean).at(-1) ?? '';
    if (id === options.logoId) {
      return { ok: true, status: 200, bytes: await readFile(options.logoFile) };
    }
    const svg = await readFile(
      path.join(options.samplesDir, `sample-${sampleIndex(id, count) + 1}.svg`),
    );
    const bytes = await sharp(svg, { density: 150 })
      .resize({ width: 1600 })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { ok: true, status: 200, bytes };
  };
}

export interface FixtureOutputs {
  log?: (message: string) => void;
  snapshotPath?: string;
  imagesOutDir?: string;
  cacheDir?: string;
}

/** Genera `src/data/snapshot.json` e imágenes con datos de muestra. Usa una caché propia, separada de la real. */
export async function generateFixtureSnapshot(
  root: string,
  config: SiteConfig,
  outputs: FixtureOutputs = {},
): Promise<PipelineResult> {
  const envSnapshot = process.env['SNAPSHOT_PATH'];
  return runPipeline({
    client: createFixtureClient(path.join(root, 'tests', 'fixtures', 'api')),
    config: { ...config, hotelId: '5fe1ffca46f0600fec51463d' },
    cacheDir: outputs.cacheDir ?? path.join(root, '.cache', 'fixture'),
    snapshotPath:
      outputs.snapshotPath ??
      (envSnapshot ? path.resolve(envSnapshot) : path.join(root, 'src', 'data', 'snapshot.json')),
    imagesOutDir: outputs.imagesOutDir ?? path.join(root, 'public', 'img'),
    fetchImage: createFixtureImageFetcher({
      samplesDir: path.join(root, 'src', 'assets', 'design-sample'),
      logoFile: path.join(root, 'docs', 'brand', 'logo-lacabana-source.png'),
      logoId: '5fe1ffca46f0600fec51463b',
    }),
    dataSource: 'fixture',
    ...(outputs.log ? { log: outputs.log } : {}),
  });
}
