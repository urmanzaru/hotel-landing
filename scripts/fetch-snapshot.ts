/** `npm run data:fetch`: descarga datos del PMS, optimiza imágenes y deja `src/data/snapshot.json`. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSiteConfig } from '../site.config.ts';
import { createApiClient } from '../src/data/client.ts';
import { runPipeline } from '../src/data/pipeline.ts';

const root = process.cwd();
const config = loadSiteConfig(process.env);
console.log(`Cliente: ${config.slug} · API: ${config.apiBaseUrl} · Origin: ${config.origin}`);

try {
  const result = await runPipeline({
    client: createApiClient({ baseUrl: config.apiBaseUrl, origin: config.origin }),
    config,
    cacheDir: path.join(root, '.cache'),
    snapshotPath: path.join(root, 'src', 'data', 'snapshot.json'),
    imagesOutDir: path.join(root, 'public', 'img'),
    log: (message) => console.warn(message),
  });

  await mkdir(path.join(root, 'reports'), { recursive: true });
  await writeFile(
    path.join(root, 'reports', 'broken-images.json'),
    `${JSON.stringify(result.broken, null, 2)}\n`,
    'utf8',
  );

  const { stats, hotel } = result.snapshot;
  console.log(`✔ Snapshot (${result.source}): ${hotel.name.es}`);
  console.log(`  Habitaciones activas: ${stats.roomTypesActive} de ${stats.roomTypesTotal}`);
  console.log(
    `  Imágenes: ${stats.imagesAvailable} disponibles, ${stats.imagesBroken} rotas (reports/broken-images.json)`,
  );
  if (stats.englishFallbacks > 0) {
    console.log(`  Textos sin traducción al inglés (se usa el español): ${stats.englishFallbacks}`);
  }
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
