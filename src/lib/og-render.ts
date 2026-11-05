/**
 * Genera las imágenes para compartir en el build: recorte 1200×630 de la variante más grande de la foto; sin foto,
 * el logo sobre el crema de la marca (color leído de los tokens + tema del cliente, nunca escrito a mano).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { ImageAsset } from '../data/types.ts';
import { parseHexTokens } from './contrast.ts';
import { OG_IMAGE } from './og.ts';
import { siteConfig } from './site.ts';

const root = process.cwd();

function brandColor(token: string): string {
  const tokens = parseHexTokens(readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8'));
  return (siteConfig.theme as Record<string, string>)[token] ?? tokens[token] ?? '#ffffff';
}

export async function renderOgImage(asset: ImageAsset | undefined): Promise<Buffer> {
  const { width, height } = OG_IMAGE;
  const source = asset?.variants.at(-1);
  const file = source ? path.join(root, 'public', source.fallback) : undefined;
  if (file && existsSync(file)) {
    return sharp(file)
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  }

  const logo = siteConfig.logoFile
    ? path.join(root, 'public', 'brand', `${siteConfig.logoFile}-384.webp`)
    : undefined;
  const layers =
    logo && existsSync(logo)
      ? [
          {
            input: await sharp(logo)
              .resize({ height: Math.round(height * 0.7), fit: 'inside' })
              .toBuffer(),
            gravity: 'centre' as const,
          },
        ]
      : [];
  return sharp({
    create: { width, height, channels: 3, background: brandColor('--color-cream') },
  })
    .composite(layers)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
