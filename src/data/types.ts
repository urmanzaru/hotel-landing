/**
 * Forma PÚBLICA y normalizada de los datos del sitio (lo que se guarda en `snapshot.json` y consumen las páginas).
 * Los esquemas son la fuente de verdad: los tipos se infieren de ellos.
 *
 * Todo se construye campo por campo desde la respuesta de la API (lista blanca), así que ningún dato fiscal o
 * de otros hoteles puede llegar al snapshot por accidente.
 */
import { z } from 'zod';

export const localizedSchema = z.object({ es: z.string(), en: z.string() });
export type Localized = z.infer<typeof localizedSchema>;

export const imageVariantSchema = z.object({
  width: z.number().int().positive(),
  /** Ruta relativa al sitio (sin `/` inicial): se prefija con `BASE_URL` al renderizar. */
  webp: z.string(),
  fallback: z.string(),
});

export const imageAssetSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  linkCopyright: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fallbackFormat: z.enum(['jpeg', 'png']),
  variants: z.array(imageVariantSchema).min(1),
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

export const publicPolicySchema = z.object({
  id: z.string(),
  name: localizedSchema,
  description: localizedSchema,
});
export type PublicPolicy = z.infer<typeof publicPolicySchema>;

export const publicHotelSchema = z.object({
  id: z.string(),
  name: localizedSchema,
  category: localizedSchema,
  description: localizedSchema,
  logoId: z.string().nullable(),
  phones: z.array(z.string()),
  email: z.string(),
  address: z.object({
    reference: z.string(),
    colony: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
  }),
  checkInTime: z.string(),
  checkOutTime: z.string(),
  imageIds: z.array(z.string()),
  politics: z.array(publicPolicySchema),
});
export type PublicHotel = z.infer<typeof publicHotelSchema>;

export const chargeTypeSchema = z.enum(['night', 'hour']);
export type ChargeType = z.infer<typeof chargeTypeSchema>;

export const publicRoomTypeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: localizedSchema,
  description: localizedSchema,
  adults: z.number().int().nonnegative(),
  children: z.number().int().nonnegative(),
  chargeType: chargeTypeSchema,
  photoMainId: z.string().nullable(),
  imageIds: z.array(z.string()),
});
export type PublicRoomType = z.infer<typeof publicRoomTypeSchema>;

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  /**
   * `api` = datos reales del PMS. `fixture` = datos de muestra para desarrollo: NUNCA deben publicarse
   * (`npm run data:assert-live` lo comprueba) ni usarse como respaldo de un snapshot real.
   */
  dataSource: z.enum(['api', 'fixture']).default('api'),
  generatedAt: z.string(),
  /** Hash del contenido (sin `generatedAt`): permite saber si el PMS cambió algo entre dos builds. */
  contentHash: z.string(),
  hotel: publicHotelSchema,
  roomTypes: z.array(publicRoomTypeSchema),
  images: z.record(z.string(), imageAssetSchema),
  stats: z.object({
    roomTypesTotal: z.number().int(),
    roomTypesActive: z.number().int(),
    imagesReferenced: z.number().int(),
    imagesAvailable: z.number().int(),
    imagesBroken: z.number().int(),
    englishFallbacks: z.number().int(),
  }),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Imagen referenciada por los datos, antes de descargarla y optimizarla. */
export interface ImageSource {
  /** Id del archivo: último segmento de `urlImage` (coincide con los `*Selected` del PMS). */
  id: string;
  sourceUrl: string;
  name: string;
  description: string;
  author: string;
  linkCopyright: string;
}

/** Datos ya normalizados, todavía sin procesar las imágenes. */
export interface SnapshotCore {
  hotel: PublicHotel;
  roomTypes: PublicRoomType[];
  imageSources: ImageSource[];
  stats: { roomTypesTotal: number; roomTypesActive: number; englishFallbacks: number };
}

export interface BrokenImage {
  id: string;
  sourceUrl: string;
  reason: string;
}
