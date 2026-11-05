/**
 * `npm run dist:privacy`: falla si `dist/` contiene datos fiscales del hotel (RFC, razón social, régimen…). Corre en
 * CI tras el build y, dentro de `deploy:check`, antes de cada despliegue (prueba imprescindible 4 del playbook 08).
 */
import path from 'node:path';
import { findPrivateData } from '../src/lib/deploy-checks.ts';

const dir = path.resolve(process.env['OUT_DIR'] ?? process.argv[2] ?? 'dist');
const findings = findPrivateData(dir);
if (findings.length > 0) {
  console.error(`✖ Datos fiscales en ${path.relative(process.cwd(), dir)}:`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`✔ Sin datos fiscales en ${path.relative(process.cwd(), dir)}`);
