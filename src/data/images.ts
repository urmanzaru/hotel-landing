/**
 * Descarga y optimiza las imágenes del PMS. Solo para el build (usa `sharp`); las páginas no importan este módulo.
 *
 * - Caché de originales en `cacheDir/<id>.bin`: no se vuelven a descargar entre builds.
 * - Una imagen que da 404 o no se puede decodificar NO rompe el build: se reporta y el sitio usa un placeholder.
 * - Genera WebP y un respaldo (JPEG, o PNG si la imagen tiene transparencia) en varios anchos, sin ampliar.
 */
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { BrokenImage, ImageAsset, ImageSource } from './types.ts';

export const DEFAULT_WIDTHS = [480, 768, 1200, 1920] as const;

export interface FetchedImage {
  ok: boolean;
  status: number;
  bytes?: Buffer;
}
export type ImageFetcher = (url: string) => Promise<FetchedImage>;

export interface ProcessImagesOptions {
  /** Carpeta de caché de originales (`.cache/images`). */
  cacheDir: string;
  /** Carpeta de salida dentro de `public/` (`public/img`). */
  outDir: string;
  widths?: readonly number[];
  fetchImage?: ImageFetcher;
  concurrency?: number;
}

export interface ProcessImagesResult {
  assets: Record<string, ImageAsset>;
  broken: BrokenImage[];
}

/**
 * Sin `Origin`: el sitio publicado carga las imágenes con `<img>`/CSS, que no lo envían, y la API responde 200.
 */
export const defaultFetchImage: ImageFetcher = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    await response.body?.cancel();
    return { ok: false, status: response.status };
  }
  return { ok: true, status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
};

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Anchos a generar: los de la lista que no superan el original; si ninguno, el ancho original. */
export function pickWidths(originalWidth: number, widths: readonly number[]): number[] {
  const picked = widths.filter((width) => width <= originalWidth);
  const largest = Math.max(...widths);
  if (originalWidth < largest && !picked.includes(originalWidth)) picked.push(originalWidth);
  return [...new Set(picked)].sort((a, b) => a - b);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadOriginal(
  source: ImageSource,
  cacheDir: string,
  fetchImage: ImageFetcher,
): Promise<{ bytes: Buffer } | { error: string }> {
  const cached = path.join(cacheDir, `${source.id}.bin`);
  if (await exists(cached)) return { bytes: await readFile(cached) };

  let fetched: FetchedImage;
  try {
    fetched = await fetchImage(source.sourceUrl);
  } catch (error) {
    return { error: `error de red: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!fetched.ok || !fetched.bytes) return { error: `HTTP ${fetched.status}` };

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, fetched.bytes);
  return { bytes: fetched.bytes };
}

async function processOne(
  source: ImageSource,
  options: Required<Pick<ProcessImagesOptions, 'cacheDir' | 'outDir' | 'fetchImage'>> & {
    widths: readonly number[];
  },
): Promise<{ asset: ImageAsset } | { broken: BrokenImage }> {
  const fail = (reason: string) => ({
    broken: { id: source.id, sourceUrl: source.sourceUrl, reason },
  });

  const original = await loadOriginal(source, options.cacheDir, options.fetchImage);
  if ('error' in original) return fail(original.error);

  try {
    const input = sharp(original.bytes, { failOn: 'error' });
    const metadata = await input.metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height) return fail('no se pudo leer el tamaño de la imagen');

    const fallbackFormat = metadata.hasAlpha ? 'png' : 'jpeg';
    const fallbackExt = fallbackFormat === 'png' ? 'png' : 'jpg';
    const targetDir = path.join(options.outDir, source.id);
    await mkdir(targetDir, { recursive: true });

    const variants: ImageAsset['variants'] = [];
    for (const target of pickWidths(width, options.widths)) {
      const webpFile = path.join(targetDir, `${target}.webp`);
      const fallbackFile = path.join(targetDir, `${target}.${fallbackExt}`);
      if (!(await exists(webpFile)) || !(await exists(fallbackFile))) {
        const resized = () =>
          sharp(original.bytes, { failOn: 'error' })
            .rotate()
            .resize({ width: target, withoutEnlargement: true });
        await resized().webp({ quality: 78 }).toFile(webpFile);
        await (
          fallbackFormat === 'png'
            ? resized().png({ compressionLevel: 9 })
            : resized().jpeg({ quality: 80, mozjpeg: true })
        ).toFile(fallbackFile);
      }
      variants.push({
        width: target,
        webp: `img/${source.id}/${target}.webp`,
        fallback: `img/${source.id}/${target}.${fallbackExt}`,
      });
    }

    return {
      asset: {
        id: source.id,
        sourceUrl: source.sourceUrl,
        name: source.name,
        description: source.description,
        author: source.author,
        linkCopyright: source.linkCopyright,
        width,
        height,
        fallbackFormat,
        variants,
      },
    };
  } catch (error) {
    return fail(
      `imagen no decodificable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function processImages(
  sources: ImageSource[],
  options: ProcessImagesOptions,
): Promise<ProcessImagesResult> {
  const resolved = {
    cacheDir: options.cacheDir,
    outDir: options.outDir,
    widths: options.widths ?? DEFAULT_WIDTHS,
    fetchImage: options.fetchImage ?? defaultFetchImage,
  };
  const results = await mapPool(sources, options.concurrency ?? 6, (source) =>
    processOne(source, resolved),
  );

  const assets: Record<string, ImageAsset> = {};
  const broken: BrokenImage[] = [];
  for (const result of results) {
    if ('asset' in result) assets[result.asset.id] = result.asset;
    else broken.push(result.broken);
  }
  return { assets, broken };
}

/**
 * Borra de `outDir` las carpetas de imágenes que ya no están en el snapshot (imágenes eliminadas del PMS o restos
 * de datos de muestra), para que no lleguen a `dist/`. Solo toca subcarpetas; ignora archivos sueltos.
 */
export async function pruneImages(outDir: string, keepIds: Iterable<string>): Promise<string[]> {
  const keep = new Set(keepIds);
  let entries: Dirent[];
  try {
    entries = await readdir(outDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !keep.has(entry.name)) {
      await rm(path.join(outDir, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}
