/** Lectura del snapshot desde las páginas de Astro (build). No importa `sharp` ni el cliente de API. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { snapshotSchema, type ImageAsset, type Snapshot } from './types.ts';

let cached: Snapshot | undefined;

export function getSnapshot(): Snapshot {
  if (cached) return cached;
  const file = path.join(process.cwd(), 'src', 'data', 'snapshot.json');
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error(
      `No existe ${file}. Ejecuta \`npm run data:fetch\` antes de construir el sitio.`,
    );
  }
  cached = snapshotSchema.parse(JSON.parse(raw));
  return cached;
}

/** Imagen por id, o `undefined` si no está disponible (404 en el PMS): el llamador usa un placeholder. */
export function getImage(
  snapshot: Snapshot,
  id: string | null | undefined,
): ImageAsset | undefined {
  return id ? snapshot.images[id] : undefined;
}
