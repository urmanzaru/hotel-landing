/**
 * `npm run brand:assets` — genera las versiones web del logo desde `docs/brand/logo-lacabana-source.png`.
 * El original es un PNG de ~780 px (no hay vector): se reduce a anchos pequeños, donde se ve nítido.
 * Cuando exista el SVG del cliente, este script deja de hacer falta.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'docs', 'brand', 'logo-lacabana-source.png');
const outDir = path.join(root, 'public', 'brand');
const WIDTHS = [96, 192, 384] as const;

await mkdir(outDir, { recursive: true });
for (const width of WIDTHS) {
  const file = path.join(outDir, `logo-lacabana-${width}.webp`);
  const info = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(file);
  console.log(
    `✔ ${path.relative(root, file)} ${info.width}×${info.height} ${(info.size / 1024).toFixed(1)} KB`,
  );
}
