/**
 * `[CLIENT=<slug>] npm run brand:assets` — genera las versiones web del logo del cliente desde
 * `docs/brand/<logoFile>-source.png` (La Cabaña: `logo-lacabana-source.png`; sin `logoFile`, `<slug>-logo`).
 * El original suele ser un PNG grande sin vector: se reduce a anchos pequeños, donde se ve nítido.
 * Salida en `public/brand/`: `<logoFile>-96/192/384.webp` y los iconos `<logoFile>-icon-32/180.png`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { loadSiteConfig } from '../site.config.ts';

const root = process.cwd();
const config = loadSiteConfig(process.env);
const name = config.logoFile ?? `${config.slug}-logo`;
const source = path.join(root, 'docs', 'brand', `${name}-source.png`);
if (!existsSync(source)) {
  console.error(
    `✖ Falta ${path.relative(root, source)} (logo original del cliente «${config.slug}»)`,
  );
  process.exit(1);
}
const outDir = path.join(root, 'public', 'brand');
const WIDTHS = [96, 192, 384] as const;

await mkdir(outDir, { recursive: true });
for (const width of WIDTHS) {
  const file = path.join(outDir, `${name}-${width}.webp`);
  const info = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(file);
  console.log(
    `✔ ${path.relative(root, file)} ${info.width}×${info.height} ${(info.size / 1024).toFixed(1)} KB`,
  );
}

// Iconos (favicon y pantalla de inicio de iOS): el logo centrado en un cuadrado del color crema de la marca
// (`--color-cream` del tema del cliente o, si no lo cambia, el de tokens.css).
const tokens = readFileSync(path.join(root, 'src', 'styles', 'tokens.css'), 'utf8');
const CREAM =
  config.theme['--color-cream'] ??
  /--color-cream:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1] ??
  '#ffffff';
for (const [size, icon] of [
  [32, 'icon-32.png'],
  [180, 'icon-180.png'],
] as const) {
  const file = path.join(outDir, `${name}-${icon}`);
  const logo = await sharp(source)
    .resize({ height: Math.round(size * 0.9), width: size, fit: 'inside' })
    .toBuffer();
  const info = await sharp({
    create: { width: size, height: size, channels: 4, background: CREAM },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(
    `✔ ${path.relative(root, file)} ${info.width}×${info.height} ${(info.size / 1024).toFixed(1)} KB`,
  );
}
