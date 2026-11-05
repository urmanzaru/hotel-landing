/**
 * `npm run deploy:check`: humo de `dist/` ANTES de subir por FTP (playbook 07). Usa `NOINDEX` y `OUT_DIR` como el
 * build: en producción la portada no puede llevar noindex; en staging, sí.
 */
import path from 'node:path';
import { loadSiteConfig } from '../site.config.ts';
import { getSnapshot } from '../src/data/load.ts';
import { checkDist } from '../src/lib/deploy-checks.ts';

const config = loadSiteConfig(process.env);
const dir = path.resolve(process.env['OUT_DIR'] ?? 'dist');
const { errors, warnings } = checkDist(dir, {
  hotelName: getSnapshot().hotel.name.es,
  noindex: config.noindex,
});
for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`✖ ${error}`);
  process.exit(1);
}
console.log(
  `✔ ${path.relative(process.cwd(), dir)} listo para subir (${config.noindex ? 'staging, noindex' : 'indexable'})`,
);
