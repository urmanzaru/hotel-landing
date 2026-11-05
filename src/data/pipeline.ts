/**
 * Orquesta la generación del snapshot: API → datos públicos → imágenes → validación → archivo.
 *
 * Política de fallo (ver playbook 02): si la API falla o el resultado no pasa las comprobaciones de sanidad,
 * se usa el ÚLTIMO snapshot bueno guardado en caché; si no hay ninguno, se lanza un error y NO se despliega.
 * Nunca se publica un sitio vacío.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SiteConfig } from '../../site.config.ts';
import type { ApiClient } from './client.ts';
import { processImages, type ImageFetcher } from './images.ts';
import { buildSnapshotCore } from './mappers.ts';
import { snapshotSchema, type BrokenImage, type ImageSource, type Snapshot } from './types.ts';

export interface PipelineOptions {
  client: ApiClient;
  config: SiteConfig;
  /** Caché: originales de imágenes y último snapshot bueno (`.cache`). */
  cacheDir: string;
  /** Destino del snapshot (`src/data/snapshot.json`). */
  snapshotPath: string;
  /** Salida de imágenes optimizadas (`public/img`). */
  imagesOutDir: string;
  fetchImage?: ImageFetcher;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface PipelineResult {
  snapshot: Snapshot;
  source: 'api' | 'cache';
  broken: BrokenImage[];
  /** Por qué se usó el respaldo (solo si `source === 'cache'`). */
  fallbackReason?: string;
}

/** Comprobaciones mínimas para aceptar un snapshot; lanza con todos los problemas encontrados. */
export function assertSnapshotSane(snapshot: Snapshot): void {
  const problems: string[] = [];
  if (!snapshot.hotel.name.es) problems.push('el hotel no tiene nombre');
  if (snapshot.roomTypes.length < 1) problems.push('no hay ningún tipo de habitación activo');
  if (Object.keys(snapshot.images).length < 1) problems.push('no hay ninguna imagen disponible');
  if (problems.length > 0) throw new Error(`Snapshot no válido: ${problems.join('; ')}`);
}

function hashContent(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readCachedSnapshot(file: string): Promise<Snapshot | null> {
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function buildFromApi(options: PipelineOptions): Promise<PipelineResult> {
  const { client, config } = options;
  const [hotels, roomTypes] = await Promise.all([
    client.getMessage('/hotel'),
    client.getMessage('/roomType'),
  ]);
  const core = buildSnapshotCore(hotels, roomTypes, config);

  const { assets, broken } = await processImages(core.imageSources, {
    cacheDir: path.join(options.cacheDir, 'images'),
    outDir: options.imagesOutDir,
    ...(options.fetchImage ? { fetchImage: options.fetchImage } : {}),
  });

  const content = {
    hotel: core.hotel,
    roomTypes: core.roomTypes,
    images: assets,
  };
  const snapshot: Snapshot = {
    schemaVersion: 1,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    contentHash: hashContent(content),
    ...content,
    stats: {
      roomTypesTotal: core.stats.roomTypesTotal,
      roomTypesActive: core.stats.roomTypesActive,
      imagesReferenced: core.imageSources.length,
      imagesAvailable: Object.keys(assets).length,
      imagesBroken: broken.length,
      englishFallbacks: core.stats.englishFallbacks,
    },
  };
  assertSnapshotSane(snapshot);
  return { snapshot, source: 'api', broken };
}

/** Rehace las imágenes del snapshot en caché usando solo los originales ya descargados. */
async function rebuildFromCache(
  cached: Snapshot,
  options: PipelineOptions,
  reason: string,
): Promise<PipelineResult> {
  const sources: ImageSource[] = Object.values(cached.images).map((image) => ({
    id: image.id,
    sourceUrl: image.sourceUrl,
    name: image.name,
    description: image.description,
    author: image.author,
    linkCopyright: image.linkCopyright,
  }));
  const offline: ImageFetcher = async () => {
    throw new Error('sin red: se usa solo la caché de imágenes');
  };
  const { assets, broken } = await processImages(sources, {
    cacheDir: path.join(options.cacheDir, 'images'),
    outDir: options.imagesOutDir,
    fetchImage: offline,
  });
  const snapshot: Snapshot = { ...cached, images: assets };
  assertSnapshotSane(snapshot);
  return { snapshot, source: 'cache', broken, fallbackReason: reason };
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const log = options.log ?? (() => {});
  const lastGood = path.join(options.cacheDir, 'last-good-snapshot.json');

  let result: PipelineResult;
  try {
    result = await buildFromApi(options);
    await writeJson(lastGood, result.snapshot);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`⚠ No se pudo generar un snapshot nuevo: ${reason}`);
    const cached = await readCachedSnapshot(lastGood);
    if (!cached) {
      throw new Error(
        `No se pudo generar el snapshot y no hay uno anterior en caché (${lastGood}). Causa: ${reason}`,
        { cause: error },
      );
    }
    log(`⚠ Se usa el último snapshot bueno (${cached.generatedAt}).`);
    result = await rebuildFromCache(cached, options, reason);
  }

  await writeJson(options.snapshotPath, result.snapshot);
  return result;
}
