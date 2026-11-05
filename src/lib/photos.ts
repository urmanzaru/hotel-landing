/** Fotos del snapshot convertidas a lo que pintan las páginas. Una imagen sin asset (404 en el PMS) simplemente no aparece. */
import type { Locale } from '../../clients/types.ts';
import type { ImageAsset, PublicRoomType, Snapshot } from '../data/types.ts';
import { t } from '../i18n/ui.ts';
import { pick } from './content.ts';
import type { GalleryItem } from './gallery.ts';

function toItem(asset: ImageAsset, alt: string, locale: Locale): GalleryItem {
  const credit = asset.author ? `${t(locale, 'common.credit')}: ${asset.author}` : '';
  return {
    asset,
    alt,
    caption: [alt, credit].filter(Boolean).join(' · ') || undefined,
  };
}

/** Quita ids repetidos conservando el orden, y los que no tienen imagen disponible. */
function availableAssets(snapshot: Snapshot, ids: (string | null)[]): ImageAsset[] {
  const seen = new Set<string>();
  const assets: ImageAsset[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const asset = snapshot.images[id];
    if (asset) assets.push(asset);
  }
  return assets;
}

/** Fotos del hotel y, a continuación, las de sus habitaciones (sin repetir). */
export function hotelGallery(snapshot: Snapshot, locale: Locale): GalleryItem[] {
  const hotelName = pick(snapshot.hotel.name, locale);
  const roomIds = snapshot.roomTypes.flatMap((room) => [room.photoMainId, ...room.imageIds]);
  return availableAssets(snapshot, [...snapshot.hotel.imageIds, ...roomIds]).map((asset) =>
    toItem(asset, asset.name || hotelName, locale),
  );
}

/** Foto principal de la habitación y después el resto. */
export function roomGallery(
  snapshot: Snapshot,
  room: PublicRoomType,
  locale: Locale,
): GalleryItem[] {
  const roomName = pick(room.name, locale);
  return availableAssets(snapshot, [room.photoMainId, ...room.imageIds]).map((asset) =>
    toItem(asset, asset.name ? `${roomName} — ${asset.name}` : roomName, locale),
  );
}

/** Imagen principal de una habitación (o la primera disponible). */
export function roomCover(snapshot: Snapshot, room: PublicRoomType): ImageAsset | undefined {
  return availableAssets(snapshot, [room.photoMainId, ...room.imageIds])[0];
}

/** Imagen de portada del hotel: la primera foto del hotel; si no hay, la de la primera habitación con foto. */
export function heroImage(snapshot: Snapshot): ImageAsset | undefined {
  const own = availableAssets(snapshot, snapshot.hotel.imageIds)[0];
  if (own) return own;
  for (const room of snapshot.roomTypes) {
    const cover = roomCover(snapshot, room);
    if (cover) return cover;
  }
  return undefined;
}

export interface PhotoCredit {
  author: string;
  /** Solo http(s): nunca `javascript:` ni otros esquemas que vengan del PMS. */
  href: string | null;
  work: string;
}

/** Créditos de las fotos con autor, sin repetir. */
export function photoCredits(items: GalleryItem[]): PhotoCredit[] {
  const seen = new Set<string>();
  const credits: PhotoCredit[] = [];
  for (const { asset } of items) {
    if (!asset?.author) continue;
    const key = `${asset.author}|${asset.linkCopyright}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      author: asset.author,
      href: /^https?:\/\//i.test(asset.linkCopyright) ? asset.linkCopyright : null,
      work: asset.name,
    });
  }
  return credits;
}
