/** Comprueba que toda ruta `/img/...` referenciada en el HTML generado exista en `dist/`. */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export interface ImageCheckResult {
  checked: number;
  missing: { page: string; asset: string }[];
}

/** `img/<id>/<ancho>.<ext>` precedido por `/`, comilla, paréntesis, coma o espacio (src, srcset, url()). */
const IMG_REFERENCE = /(?<=[\s"'(,/])(img\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.(?:webp|jpe?g|png))/g;

export async function checkDistImages(distDir: string): Promise<ImageCheckResult> {
  const result: ImageCheckResult = { checked: 0, missing: [] };
  for await (const file of walk(distDir)) {
    if (!file.endsWith('.html')) continue;
    const html = await readFile(file, 'utf8');
    const seen = new Set<string>();
    for (const match of html.matchAll(IMG_REFERENCE)) {
      const asset = match[1];
      if (!asset || seen.has(asset)) continue;
      seen.add(asset);
      result.checked += 1;
      try {
        await stat(path.join(distDir, asset));
      } catch {
        result.missing.push({ page: path.relative(distDir, file), asset });
      }
    }
  }
  return result;
}
