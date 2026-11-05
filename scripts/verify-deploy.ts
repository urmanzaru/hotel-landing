/**
 * `npm run deploy:verify -- <url>`: comprueba el sitio YA publicado (playbook 07). Reintenta unos segundos por si
 * el servidor tarda en ver los archivos nuevos. Errores → código 1; avisos → solo se muestran.
 */
import { getSnapshot } from '../src/data/load.ts';
import { verifyDeployment, type CheckResult } from '../src/lib/deploy-checks.ts';

const siteUrl = process.argv[2] ?? process.env['SITE_URL'];
if (!siteUrl) {
  console.error('✖ Uso: npm run deploy:verify -- https://dominio/ (o SITE_URL)');
  process.exit(1);
}
const hotelName = getSnapshot().hotel.name.es;

let result: CheckResult = { errors: ['sin comprobar'], warnings: [] };
for (let attempt = 1; attempt <= 3; attempt += 1) {
  result = await verifyDeployment(siteUrl, { hotelName });
  if (result.errors.length === 0) break;
  console.warn(`Intento ${attempt}: ${result.errors.join(' · ')}`);
  if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 10_000));
}
for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
if (result.errors.length > 0) {
  for (const error of result.errors) console.error(`✖ ${error}`);
  process.exit(1);
}
console.log(`✔ ${siteUrl} publicado y respondiendo`);
