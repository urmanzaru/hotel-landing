/**
 * Lógica PURA del formulario de cotización (sin DOM ni red): validación, payload de `POST /receiveCotization`,
 * precarga desde la URL, clasificación de la respuesta y resumen. La isla `src/islands/quote-form.ts` la usa.
 *
 * La API no valida nada (`POST {}` crea un registro vacío), así que TODA la validación vive aquí.
 * Las fechas viajan como cadenas `YYYY-MM-DD` y nunca pasan por un `Date` local: así el día guardado en el PMS es
 * el que eligió el huésped, sea cual sea la zona horaria del navegador.
 */
import type { Locale } from '../../clients/types.ts';

export const QUOTE_LIMITS = {
  adults: { min: 1, max: 10 },
  children: { min: 0, max: 10 },
  childAge: { min: 0, max: 17 },
  rooms: { min: 1, max: 10 },
  name: { min: 2, max: 100 },
  email: { max: 254 },
  phoneDigits: { min: 7, max: 20 },
  address: { max: 150 },
  notes: { max: 1000 },
} as const;

/** Valores crudos del formulario (tal como salen de los controles). */
export interface QuoteInput {
  checkin: string;
  checkout: string;
  adults: string;
  /** Una edad por niño (cadena vacía si aún no se eligió). */
  childAges: string[];
  rooms: string;
  roomsTogether: boolean;
  /** Slug del tipo de habitación o `''` (sin preferencia). */
  roomType: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  privacy: boolean;
}

/** Cuerpo de `POST /receiveCotization`. */
export interface QuotePayload {
  checkin: string;
  checkout: string;
  adults: number;
  children: number[];
  rooms: number;
  roomsTogether: boolean;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export type QuoteErrorCode =
  'required' | 'invalid' | 'past' | 'beforeCheckin' | 'range' | 'length' | 'childAge';

/** `field` es el `id` del control en la página; `n` es el número de niño (para el mensaje). */
export interface QuoteError {
  field: string;
  code: QuoteErrorCode;
  n?: number;
}

/** Clave del mensaje de un error en `quoteMessages()` (`error.checkin.past`, `error.childAge`…). */
export function errorMessageKey(error: QuoteError): string {
  return error.code === 'childAge' ? 'error.childAge' : `error.${error.field}.${error.code}`;
}

export const childAgeFieldId = (index: number): string => `child-age-${index + 1}`;

// ---------------------------------------------------------------------------------------------------------------
// Fechas como cadenas `YYYY-MM-DD`

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milisegundos UTC de un día, o `null` si la cadena no es un día real (`2026-02-30` no lo es). */
function utcDay(ymd: string): number | null {
  const match = ISO_DATE.exec(ymd);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // `Date.UTC(2, …)` sería 1902: `setUTCFullYear` respeta los años de 0 a 99 (Chromium los emite al teclear).
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const time = date.getTime();
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? time : null;
}

const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  return utcDay(value) !== null;
}

/** `2026-11-20` → `2026-11-20T00:00:00.000Z`, sin pasar por la zona del navegador. */
export function toApiDate(ymd: string): string {
  if (utcDay(ymd) === null) throw new Error(`Fecha no válida: "${ymd}"`);
  return `${ymd}T00:00:00.000Z`;
}

export function addDays(ymd: string, days: number): string {
  const time = utcDay(ymd);
  if (time === null) throw new Error(`Fecha no válida: "${ymd}"`);
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkin: string, checkout: string): number {
  const start = utcDay(checkin);
  const end = utcDay(checkout);
  if (start === null || end === null) return 0;
  return Math.round((end - start) / DAY_MS);
}

/** Día actual (`YYYY-MM-DD`) en la zona horaria del hotel. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const DATE_LOCALES: Record<Locale, string> = { es: 'es-MX', en: 'en-US' };

/** «20 de noviembre de 2026» / «November 20, 2026». Se formatea en UTC para no mover el día. */
export function formatDate(ymd: string, locale: Locale): string {
  const time = utcDay(ymd);
  if (time === null) return ymd;
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(time));
}

// ---------------------------------------------------------------------------------------------------------------
// Validación

function intInRange(value: string, range: { min: number; max: number }): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const n = Number(value);
  return n >= range.min && n <= range.max;
}

// Algo@algo.tld (tld de 2+ letras), sin espacios. No pretende cubrir el RFC: atrapa los errores de dedo.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
const PHONE_CHARS = /^[\d\s+\-()]+$/;

export function validateQuote(input: QuoteInput, ctx: { today: string }): QuoteError[] {
  const errors: QuoteError[] = [];
  const add = (field: string, code: QuoteErrorCode) => errors.push({ field, code });

  const checkinOk = isIsoDate(input.checkin);
  if (input.checkin === '') add('checkin', 'required');
  else if (!checkinOk) add('checkin', 'invalid');
  else if (input.checkin < ctx.today) add('checkin', 'past');

  if (input.checkout === '') add('checkout', 'required');
  else if (!isIsoDate(input.checkout)) add('checkout', 'invalid');
  else if (checkinOk && input.checkout <= input.checkin) add('checkout', 'beforeCheckin');

  if (!intInRange(input.adults, QUOTE_LIMITS.adults)) add('adults', 'range');

  const { childAges } = input;
  if (childAges.length > QUOTE_LIMITS.children.max) {
    add('children', 'range');
  } else {
    childAges.forEach((age, index) => {
      if (!intInRange(age, QUOTE_LIMITS.childAge)) {
        errors.push({ field: childAgeFieldId(index), code: 'childAge', n: index + 1 });
      }
    });
  }

  if (!intInRange(input.rooms, QUOTE_LIMITS.rooms)) add('rooms', 'range');

  const name = input.name.trim();
  if (name === '') add('name', 'required');
  else if (name.length < QUOTE_LIMITS.name.min || name.length > QUOTE_LIMITS.name.max) {
    add('name', 'length');
  }

  const email = input.email.trim();
  if (email === '') add('email', 'required');
  else if (email.length > QUOTE_LIMITS.email.max || !EMAIL.test(email)) add('email', 'invalid');

  const phone = input.phone.trim();
  if (phone !== '') {
    const digits = phone.replace(/\D/g, '').length;
    const { min, max } = QUOTE_LIMITS.phoneDigits;
    if (!PHONE_CHARS.test(phone) || digits < min || digits > max) add('phone', 'invalid');
  }

  if (input.address.trim().length > QUOTE_LIMITS.address.max) add('address', 'length');
  if (input.notes.trim().length > QUOTE_LIMITS.notes.max) add('notes', 'length');
  if (!input.privacy) add('privacy', 'required');

  return errors;
}

// ---------------------------------------------------------------------------------------------------------------
// Payload

/**
 * Construye el cuerpo del `POST`. Supone una entrada ya validada (`validateQuote` sin errores).
 * Los comentarios llevan delante el tipo de habitación y, si la página está en inglés, el idioma del huésped; estas
 * notas van en español porque las lee el personal del hotel en el PMS.
 */
export function buildQuotePayload(
  input: QuoteInput,
  ctx: { locale: Locale; roomName?: string | undefined },
): QuotePayload {
  const rooms = Number(input.rooms);
  const prefix = [
    ctx.roomName ? `Habitación de interés: ${ctx.roomName}` : '',
    ctx.locale === 'en' ? 'Idioma del huésped: inglés' : '',
  ].filter(Boolean);
  const notes = input.notes.trim();
  return {
    checkin: toApiDate(input.checkin),
    checkout: toApiDate(input.checkout),
    adults: Number(input.adults),
    children: input.childAges.map(Number),
    rooms,
    roomsTogether: rooms > 1 && input.roomsTogether,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    notes: [prefix.join('\n'), notes].filter(Boolean).join('\n\n'),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Precarga desde la URL

export interface QuotePrefill {
  roomType?: string;
  checkin?: string;
  checkout?: string;
}

/** `?room=<slug>&checkin=&checkout=`: solo se usa lo que es válido (slug conocido, fechas reales y coherentes). */
export function parsePrefill(
  params: URLSearchParams,
  ctx: { today: string; roomSlugs: readonly string[] },
): QuotePrefill {
  const prefill: QuotePrefill = {};
  const room = params.get('room') ?? '';
  if (ctx.roomSlugs.includes(room)) prefill.roomType = room;

  const checkin = params.get('checkin') ?? '';
  const checkinOk = isIsoDate(checkin) && checkin >= ctx.today;
  if (checkinOk) prefill.checkin = checkin;

  const checkout = params.get('checkout') ?? '';
  const after = checkinOk ? checkin : ctx.today;
  if (isIsoDate(checkout) && checkout > after) prefill.checkout = checkout;
  return prefill;
}

// ---------------------------------------------------------------------------------------------------------------
// Respuesta

export type QuoteOutcome = 'success' | 'forbidden' | 'failure';

/** Éxito = HTTP 200 **y** `status === "Success"`. 403 = el `Origin` del sitio no está registrado en el PMS. */
export function classifyResponse(status: number, body: unknown): QuoteOutcome {
  if (status === 403) return 'forbidden';
  const ok =
    status === 200 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { status?: unknown }).status === 'Success';
  return ok ? 'success' : 'failure';
}

// ---------------------------------------------------------------------------------------------------------------
// Resumen (pantalla de éxito y mensajes de WhatsApp/correo)

export type Messages = Record<string, string>;

export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function msg(messages: Messages, key: string, params?: Record<string, string | number>): string {
  return format(messages[key] ?? key, params);
}

function plural(messages: Messages, base: string, n: number) {
  return msg(messages, `${base}.${n === 1 ? 'one' : 'other'}`, { n });
}

export interface SummaryContext {
  locale: Locale;
  messages: Messages;
  roomName?: string | undefined;
}

export function quoteSummaryRows(
  input: QuoteInput,
  ctx: SummaryContext,
): { label: string; value: string }[] {
  const { messages: m, locale } = ctx;
  const rows: { label: string; value: string }[] = [];
  const row = (key: string, value: string) => {
    if (value.trim() !== '') rows.push({ label: msg(m, `summary.${key}`), value: value.trim() });
  };

  const nights = nightsBetween(input.checkin, input.checkout);
  row('checkin', formatDate(input.checkin, locale));
  row(
    'checkout',
    `${formatDate(input.checkout, locale)}${nights > 0 ? ` (${plural(m, 'summary.nights', nights)})` : ''}`,
  );

  const guests = [plural(m, 'summary.adults', Number(input.adults))];
  if (input.childAges.length > 0) {
    const ages = msg(m, 'summary.ages', { list: input.childAges.join(', ') });
    guests.push(`${plural(m, 'summary.children', input.childAges.length)} (${ages})`);
  }
  row('guests', guests.join(' · '));

  const rooms = Number(input.rooms);
  row(
    'rooms',
    rooms > 1 && input.roomsTogether ? `${rooms}, ${msg(m, 'summary.together')}` : String(rooms),
  );
  row('roomType', ctx.roomName ?? '');
  row('name', input.name);
  row('email', input.email);
  row('phone', input.phone);
  row('address', input.address);
  row('notes', input.notes);
  return rows;
}

/** Texto plano para precargar WhatsApp o un correo si la API falla. */
export function quoteSummaryText(
  input: QuoteInput,
  ctx: SummaryContext & { hotelName: string },
): string {
  const title = msg(ctx.messages, 'summary.title', { hotel: ctx.hotelName });
  const lines = quoteSummaryRows(input, ctx).map(({ label, value }) => `${label}: ${value}`);
  return [title, ...lines].join('\n');
}
