/** Imágenes para compartir (Open Graph / Twitter): tamaño y ruta. La generación está en `og-render.ts` (usa sharp). */
import type { Snapshot } from '../data/types.ts';
import { heroImage, roomCover } from './photos.ts';
import type { ImageAsset } from '../data/types.ts';

/** Tamaño recomendado por Facebook, WhatsApp, LinkedIn y X (1.91:1). */
export const OG_IMAGE = { width: 1200, height: 630 } as const;

/** Ruta relativa al sitio (sin base) de una imagen para compartir. */
export function ogImagePath(name: string): string {
  return `og/${name}.jpg`;
}

/** Imágenes a generar: la del sitio (foto de portada) y una por habitación con foto. */
export function ogSources(snapshot: Snapshot): { name: string; asset: ImageAsset | undefined }[] {
  return [
    { name: 'site', asset: heroImage(snapshot) },
    ...snapshot.roomTypes.flatMap((room) => {
      const asset = roomCover(snapshot, room);
      return asset ? [{ name: `room-${room.slug}`, asset }] : [];
    }),
  ];
}
