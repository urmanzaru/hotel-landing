/**
 * De la respuesta cruda de la API a los datos públicos del sitio.
 *
 * Cada objeto de salida se construye campo por campo: lo que no se copia aquí no llega al snapshot
 * (RFC, razón social, régimen CFDI, producto por defecto, otros hoteles, etc.).
 */
import type { SiteConfig } from '../../site.config.ts';
import {
  hotelRawSchema,
  roomTypeRawSchema,
  type HotelRaw,
  type ImageRaw,
  type RoomTypeRaw,
} from './schemas.ts';
import type {
  ChargeType,
  ImageSource,
  Localized,
  PublicHotel,
  PublicRoomType,
  SnapshotCore,
} from './types.ts';

/** Acumula imágenes referenciadas y avisos mientras se mapea. */
export class Collector {
  readonly images = new Map<string, ImageSource>();
  englishFallbacks = 0;
  private readonly apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  }

  /** Registra la imagen y devuelve su id (el del archivo), o `null` si no se puede identificar. */
  addImage(raw: ImageRaw | null | undefined): string | null {
    if (!raw) return null;
    const id = imageId(raw.urlImage);
    if (!id) return null;
    if (!this.images.has(id)) {
      this.images.set(id, {
        id,
        sourceUrl: resolveImageUrl(raw.urlImage, this.apiBaseUrl),
        name: raw.name.trim(),
        description: raw.description.trim(),
        author: raw.author.trim(),
        linkCopyright: raw.linkCopyright.trim(),
      });
    }
    return id;
  }

  localized(es: string, en: string): Localized {
    const spanish = es.trim();
    const english = en.trim();
    if (!english && spanish) this.englishFallbacks += 1;
    return { es: spanish, en: english || spanish };
  }
}

/** Id del archivo de imagen: último segmento de `urlImage` (`imagen/<id>`), sin query. */
export function imageId(urlImage: string): string | null {
  const path = urlImage.split(/[?#]/)[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  return segments.at(-1) ?? null;
}

/** Las URLs llegan relativas (`imagen/<id>`); se anteponen a la URL base salvo que ya sean absolutas. */
export function resolveImageUrl(urlImage: string, apiBaseUrl: string): string {
  if (/^https?:\/\//i.test(urlImage)) return urlImage;
  return `${apiBaseUrl.replace(/\/+$/, '')}/${urlImage.replace(/^\/+/, '')}`;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `chargeType` llega como string (`"NOCHE"`); el front lo tipa como enum numérico (1 = noches, 2 = horas). */
export function mapChargeType(value: string | number | null | undefined): ChargeType {
  if (typeof value === 'number') return value === 2 ? 'hour' : 'night';
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized.startsWith('HORA') || normalized === '2') return 'hour';
  return 'night';
}

function ensureArray(value: unknown, label: string): unknown[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label}: se esperaba un arreglo`);
  return value;
}

/** Elige el hotel por id exacto. Nunca por posición ni por heurística de URL. */
export function selectHotel(message: unknown, hotelId: string): HotelRaw {
  const hotels = ensureArray(message, 'GET /hotel');
  const match = hotels.find(
    (item): item is { id: string } =>
      typeof item === 'object' && item !== null && (item as { id?: unknown }).id === hotelId,
  );
  if (!match) {
    const ids = hotels.map((item) => (item as { id?: unknown } | null)?.id).filter(Boolean);
    throw new Error(
      `GET /hotel: no existe el hotel "${hotelId}" (la API devolvió ${hotels.length}: ${ids.join(', ') || 'ninguno'})`,
    );
  }
  const parsed = hotelRawSchema.safeParse(match);
  if (!parsed.success) {
    throw new Error(
      `GET /hotel: el hotel "${hotelId}" no cumple el esquema: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

const PHONE_SEPARATORS = /[,;/\n]+/;

export function mapHotel(raw: HotelRaw, config: SiteConfig, collector: Collector): PublicHotel {
  const address = raw.address;
  return {
    id: raw.id,
    name: collector.localized(raw.nameSpanish, raw.nameEnglish),
    category: collector.localized(raw.categorySpanish, raw.categoryEnglish),
    description: collector.localized(raw.descriptionSpanish, raw.descriptionEnglish),
    logoId: collector.addImage(raw.logo),
    phones: raw.phones
      .split(PHONE_SEPARATORS)
      .map((phone) => phone.trim())
      .filter(Boolean),
    email: raw.email.trim(),
    address: {
      reference: address?.reference.trim() ?? '',
      colony: address?.colony.trim() ?? '',
      city: address?.city.trim() ?? '',
      state: address?.state.trim() ?? '',
      postalCode: address?.postalCode.trim() ?? '',
      country: address?.country.trim() ?? '',
    },
    checkInTime: raw.entryTime.trim() || config.checkInTime,
    checkOutTime: raw.departureTime.trim() || config.checkOutTime,
    imageIds: raw.images.flatMap((image) => collector.addImage(image) ?? []),
    politics: raw.politics
      .filter((policy) => policy.status !== false)
      .map((policy) => ({
        id: policy.id,
        name: collector.localized(policy.esName, policy.enName),
        description: collector.localized(policy.esDescription, policy.enDescription),
      })),
  };
}

/** Valida cada tipo de habitación por separado: uno inválido se descarta sin tumbar los demás. */
export function parseRoomTypes(message: unknown): RoomTypeRaw[] {
  return ensureArray(message, 'GET /roomType').flatMap((item) => {
    const parsed = roomTypeRawSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Solo tipos activos (`status === true`, igual que el sitio actual), ordenados por nombre. */
export function mapRoomTypes(raws: RoomTypeRaw[], collector: Collector): PublicRoomType[] {
  const active = raws
    .filter((raw) => raw.status === true)
    .sort((a, b) => a.esName.localeCompare(b.esName, 'es') || a.id.localeCompare(b.id));

  const slugs = new Set<string>();
  return active.map((raw) => {
    const base = slugify(raw.esName) || 'habitacion';
    // Si el nombre se repite, el sufijo con el id mantiene el slug único. El desempate por id (arriba) hace que
    // el reparto no dependa del orden en que la API devuelva los tipos.
    const slug = slugs.has(base) ? `${base}-${raw.id.slice(-4)}` : base;
    slugs.add(slug);
    return {
      id: raw.id,
      slug,
      name: collector.localized(raw.esName, raw.enName),
      description: collector.localized(raw.esDescription, raw.enDescription),
      adults: Math.max(0, Math.trunc(raw.nAdults ?? 0)),
      children: Math.max(0, Math.trunc(raw.nChilds ?? 0)),
      chargeType: mapChargeType(raw.chargeType),
      photoMainId: collector.addImage(raw.photoMain),
      imageIds: raw.images.flatMap((image) => collector.addImage(image) ?? []),
    };
  });
}

/** Construye los datos públicos (sin procesar imágenes) a partir de las dos respuestas de la API. */
export function buildSnapshotCore(
  hotelsMessage: unknown,
  roomTypesMessage: unknown,
  config: SiteConfig,
): SnapshotCore {
  const collector = new Collector(config.apiBaseUrl);
  const hotel = mapHotel(selectHotel(hotelsMessage, config.hotelId), config, collector);
  const rawRoomTypes = parseRoomTypes(roomTypesMessage);
  const roomTypes = mapRoomTypes(rawRoomTypes, collector);
  return {
    hotel,
    roomTypes,
    imageSources: [...collector.images.values()],
    stats: {
      roomTypesTotal: rawRoomTypes.length,
      roomTypesActive: roomTypes.length,
      englishFallbacks: collector.englishFallbacks,
    },
  };
}
