/**
 * Esquemas de la respuesta CRUDA de la API del PMS (según `api-endpoints.md`).
 *
 * Son tolerantes a propósito (`looseObject`, campos opcionales con valor por defecto): la API manda campos que
 * nadie declara y omite otros. Solo se exige lo que el sitio no puede inventar (ids y nombres).
 */
import { z } from 'zod';

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

/** Valida cada elemento por separado y descarta los inválidos en lugar de fallar todo el arreglo. */
function lenientArray<T extends z.ZodType>(schema: T) {
  return z
    .array(z.unknown())
    .nullish()
    .transform((items) =>
      (items ?? []).flatMap((item) => {
        const result = schema.safeParse(item);
        return result.success ? [result.data as z.output<T>] : [];
      }),
    );
}

export const imageRawSchema = z.looseObject({
  id: text,
  name: text,
  description: text,
  urlImage: z.string().min(1),
  contentType: text,
  author: text,
  linkCopyright: text,
});
export type ImageRaw = z.infer<typeof imageRawSchema>;

export const policyRawSchema = z.looseObject({
  id: z.string(),
  esName: text,
  enName: text,
  esDescription: text,
  enDescription: text,
  status: z.boolean().nullish(),
});
export type PolicyRaw = z.infer<typeof policyRawSchema>;

const addressRawSchema = z.looseObject({
  reference: text,
  colony: text,
  city: text,
  state: text,
  postalCode: text,
  country: text,
});

export const hotelRawSchema = z.looseObject({
  id: z.string().min(1),
  nameSpanish: z.string().min(1),
  nameEnglish: text,
  categorySpanish: text,
  categoryEnglish: text,
  descriptionSpanish: text,
  descriptionEnglish: text,
  phones: text,
  email: text,
  entryTime: text,
  departureTime: text,
  logo: imageRawSchema.nullish(),
  address: addressRawSchema.nullish(),
  images: lenientArray(imageRawSchema),
  politics: lenientArray(policyRawSchema),
});
export type HotelRaw = z.infer<typeof hotelRawSchema>;

export const roomTypeRawSchema = z.looseObject({
  id: z.string().min(1),
  esName: z.string().min(1),
  enName: text,
  esDescription: text,
  enDescription: text,
  status: z.boolean().nullish(),
  nAdults: z.number().nullish(),
  nChilds: z.number().nullish(),
  /** Llega como string (`"NOCHE"`) aunque el front lo tipa como enum numérico. */
  chargeType: z.union([z.string(), z.number()]).nullish(),
  images: lenientArray(imageRawSchema),
  photoMain: imageRawSchema.nullish(),
});
export type RoomTypeRaw = z.infer<typeof roomTypeRawSchema>;

/** Sobre de todas las respuestas JSON: `{ status: "Success" | "Error", message: ... }`. */
export const envelopeSchema = z.object({
  status: z.union([z.string(), z.number()]),
  message: z.unknown(),
});
