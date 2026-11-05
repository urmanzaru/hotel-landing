import type { ImageAsset } from '../data/types.ts';
import { url } from './url.ts';

export interface GalleryItem {
  /** Imagen del snapshot (con variantes) o, alternativamente, una imagen suelta con `src`, `width` y `height`. */
  asset?: ImageAsset | undefined;
  src?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  alt: string;
  caption?: string | undefined;
}

/** URL de la foto grande: la variante más ancha del asset, o `src`. Vacía si no hay imagen. */
export function fullUrl(item: GalleryItem): string {
  const widest = item.asset?.variants.at(-1);
  if (widest) return url(widest.webp);
  return item.src ?? '';
}

/** Solo se muestran los elementos con imagen disponible (las que dan 404 en el PMS no tienen asset ni `src`). */
export function withImage(items: GalleryItem[]): GalleryItem[] {
  return items.filter((item) => fullUrl(item) !== '');
}
