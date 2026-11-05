/** `npm run images:check`: falla si el HTML de `dist/` referencia imágenes que no existen. */
import path from 'node:path';
import { checkDistImages } from '../src/data/check-images.ts';

const distDir = path.join(process.cwd(), process.argv[2] ?? 'dist');
const { checked, missing } = await checkDistImages(distDir);

if (missing.length > 0) {
  console.error(`✖ ${missing.length} imagen(es) referenciadas no existen en ${distDir}:`);
  for (const item of missing) console.error(`  ${item.page} → ${item.asset}`);
  process.exit(1);
}
console.log(`✔ ${checked} referencia(s) a imágenes verificadas en ${distDir}`);
