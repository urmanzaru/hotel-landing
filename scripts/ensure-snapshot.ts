/**
 * Se ejecuta antes de `dev` y `build` (hooks `predev`/`prebuild`): si no hay snapshot, genera uno de MUESTRA para
 * que el proyecto arranque sin la API. Si ya existe (real o de muestra), no hace nada.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { loadSiteConfig } from '../site.config.ts';
import { generateFixtureSnapshot } from '../src/data/fixture.ts';

const root = process.cwd();
const file = process.env['SNAPSHOT_PATH']
  ? path.resolve(process.env['SNAPSHOT_PATH'])
  : path.join(root, 'src', 'data', 'snapshot.json');

try {
  await access(file);
} catch {
  console.warn('⚠ No hay snapshot: se genera uno de MUESTRA (npm run data:fetch usa la API real).');
  await generateFixtureSnapshot(root, loadSiteConfig(process.env));
}
