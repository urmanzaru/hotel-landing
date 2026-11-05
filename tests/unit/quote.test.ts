import { afterEach, describe, expect, it } from 'vitest';
import { quoteMessages } from '../../src/i18n/ui.ts';
import {
  addDays,
  buildQuotePayload,
  classifyResponse,
  formatDate,
  isIsoDate,
  nightsBetween,
  parsePrefill,
  quoteSummaryRows,
  quoteSummaryText,
  toApiDate,
  todayIn,
  validateQuote,
  type QuoteInput,
} from '../../src/lib/quote.ts';

const TODAY = '2026-11-05';

function input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    checkin: '2026-11-20',
    checkout: '2026-11-23',
    adults: '2',
    childAges: [],
    rooms: '1',
    roomsTogether: false,
    roomType: '',
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '',
    address: '',
    notes: '',
    privacy: true,
    ...overrides,
  };
}

const codes = (value: QuoteInput, today = TODAY) =>
  validateQuote(value, { today }).map((error) => `${error.field}:${error.code}`);

describe('fechas ISO sin desplazamiento de zona', () => {
  it('toApiDate construye medianoche UTC desde la cadena', () => {
    expect(toApiDate('2026-11-20')).toBe('2026-11-20T00:00:00.000Z');
    expect(toApiDate('2026-01-01')).toBe('2026-01-01T00:00:00.000Z');
    expect(toApiDate('2028-02-29')).toBe('2028-02-29T00:00:00.000Z');
  });

  it('toApiDate rechaza fechas inexistentes o mal formadas', () => {
    expect(() => toApiDate('2026-02-30')).toThrow();
    expect(() => toApiDate('20/11/2026')).toThrow();
    expect(() => toApiDate('')).toThrow();
  });

  it('isIsoDate solo acepta días reales en formato YYYY-MM-DD', () => {
    expect(isIsoDate('2026-11-20')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-11-20T00:00')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('addDays y nightsBetween cruzan meses, años y bisiestos', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(nightsBetween('2026-11-20', '2026-11-23')).toBe(3);
    expect(nightsBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('años de menos de 4 cifras significativas (al teclear el año) no se confunden con 19xx', () => {
    // Chromium emite `0002-11-20` mientras se teclea «2026» en un <input type="date">.
    expect(isIsoDate('0002-11-20')).toBe(true);
    expect(addDays('0002-11-20', 1)).toBe('0002-11-21');
    expect(addDays('0099-12-31', 1)).toBe('0100-01-01');
  });

  it('todayIn da el día de la zona del hotel, no el del navegador', () => {
    // 2026-11-06 03:00 UTC = 2026-11-05 21:00 en Ciudad de México
    const now = new Date('2026-11-06T03:00:00Z');
    expect(todayIn('America/Mexico_City', now)).toBe('2026-11-05');
    expect(todayIn('Pacific/Kiritimati', now)).toBe('2026-11-06');
    expect(todayIn('UTC', now)).toBe('2026-11-06');
  });

  it('formatDate muestra el día elegido en el idioma, sin moverlo', () => {
    expect(formatDate('2026-11-20', 'es')).toBe('20 de noviembre de 2026');
    expect(formatDate('2026-11-20', 'en')).toBe('November 20, 2026');
  });
});

/**
 * Prueba imprescindible 1 del playbook 08: las fechas no se desplazan sea cual sea la zona del proceso. Node aplica
 * un cambio de `process.env.TZ` en caliente, así que cada caso corre de verdad en esa zona (el primer `expect` lo
 * comprueba). Kiritimati (UTC+14) y Pago Pago (UTC−11) son los extremos: un `new Date(y, m, d)` o un
 * `toISOString()` sobre la hora local cambia de día en uno u otro.
 */
describe('fechas en cualquier zona horaria del proceso', () => {
  const ZONES = [
    { zone: 'UTC', offset: 0 },
    { zone: 'America/Mexico_City', offset: 360 },
    { zone: 'Pacific/Kiritimati', offset: -840 },
    { zone: 'Pacific/Pago_Pago', offset: 660 },
  ];
  const original = process.env['TZ'];
  afterEach(() => {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  });

  for (const { zone, offset } of ZONES) {
    it(`TZ=${zone}: el payload y los cálculos de fechas no cambian de día`, () => {
      process.env['TZ'] = zone;
      expect(new Date('2026-11-20T12:00:00Z').getTimezoneOffset(), 'la zona se aplicó').toBe(
        offset,
      );

      const payload = buildQuotePayload(input({ checkin: '2026-12-31', checkout: '2027-01-02' }), {
        locale: 'es',
      });
      expect(payload.checkin).toBe('2026-12-31T00:00:00.000Z');
      expect(payload.checkout).toBe('2027-01-02T00:00:00.000Z');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // cambio de horario en EE. UU.
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
      expect(nightsBetween('2026-12-31', '2027-01-02')).toBe(2);
      expect(nightsBetween('2026-03-07', '2026-03-09')).toBe(2);
      expect(formatDate('2026-12-31', 'es')).toBe('31 de diciembre de 2026');
      expect(todayIn('America/Mexico_City', new Date('2026-11-06T03:00:00Z'))).toBe('2026-11-05');
      expect(codes(input({ checkin: TODAY, checkout: addDays(TODAY, 1) }))).toEqual([]);
    });
  }
});

describe('validateQuote', () => {
  it('un formulario correcto no tiene errores', () => {
    expect(codes(input())).toEqual([]);
  });

  it('fechas obligatorias, válidas, desde hoy y salida posterior a la llegada', () => {
    expect(codes(input({ checkin: '', checkout: '' }))).toEqual([
      'checkin:required',
      'checkout:required',
    ]);
    expect(codes(input({ checkin: '2026-02-30' }))).toContain('checkin:invalid');
    expect(codes(input({ checkin: '2026-11-04', checkout: '2026-11-06' }))).toEqual([
      'checkin:past',
    ]);
    expect(codes(input({ checkin: TODAY, checkout: '2026-11-06' }))).toEqual([]);
    expect(codes(input({ checkout: '2026-11-20' }))).toEqual(['checkout:beforeCheckin']);
    expect(codes(input({ checkout: '2026-11-19' }))).toEqual(['checkout:beforeCheckin']);
  });

  it('«hoy» depende de la zona del hotel que se le pasa', () => {
    expect(codes(input({ checkin: '2026-11-05', checkout: '2026-11-06' }), '2026-11-06')).toEqual([
      'checkin:past',
    ]);
  });

  it('adultos 1–10, habitaciones 1–10, niños 0–10 y enteros', () => {
    expect(codes(input({ adults: '0' }))).toEqual(['adults:range']);
    expect(codes(input({ adults: '11' }))).toEqual(['adults:range']);
    expect(codes(input({ adults: '2.5' }))).toEqual(['adults:range']);
    expect(codes(input({ adults: '' }))).toEqual(['adults:range']);
    expect(codes(input({ adults: '10', rooms: '10' }))).toEqual([]);
    expect(codes(input({ rooms: '0' }))).toEqual(['rooms:range']);
    expect(codes(input({ rooms: '11' }))).toEqual(['rooms:range']);
    expect(codes(input({ childAges: Array.from({ length: 10 }, () => '5') }))).toEqual([]);
    expect(codes(input({ childAges: Array.from({ length: 11 }, () => '5') }))).toEqual([
      'children:range',
    ]);
  });

  it('cada niño necesita una edad entre 0 y 17, con su propio campo', () => {
    expect(codes(input({ childAges: ['0', '17'] }))).toEqual([]);
    const errors = validateQuote(input({ childAges: ['4', '', '18'] }), { today: TODAY });
    expect(errors).toEqual([
      { field: 'child-age-2', code: 'childAge', n: 2 },
      { field: 'child-age-3', code: 'childAge', n: 3 },
    ]);
  });

  it('nombre 2–100 caracteres (sin contar espacios de los extremos)', () => {
    expect(codes(input({ name: '   ' }))).toEqual(['name:required']);
    expect(codes(input({ name: ' A ' }))).toEqual(['name:length']);
    expect(codes(input({ name: 'Al' }))).toEqual([]);
    expect(codes(input({ name: 'x'.repeat(100) }))).toEqual([]);
    expect(codes(input({ name: 'x'.repeat(101) }))).toEqual(['name:length']);
  });

  it('correo obligatorio y con formato válido', () => {
    expect(codes(input({ email: '' }))).toEqual(['email:required']);
    for (const bad of ['ana', 'ana@', '@example.com', 'ana@example', 'ana @example.com', 'a@b.c']) {
      expect(codes(input({ email: bad })), bad).toEqual(['email:invalid']);
    }
    expect(codes(input({ email: ' Ana.Perez+viaje@correo.com.mx ' }))).toEqual([]);
    expect(codes(input({ email: `${'a'.repeat(250)}@x.com` }))).toEqual(['email:invalid']);
  });

  it('teléfono opcional: 7–20 dígitos y solo + - ( ) espacios', () => {
    expect(codes(input({ phone: '' }))).toEqual([]);
    expect(codes(input({ phone: '+52 (958) 584-3105' }))).toEqual([]);
    expect(codes(input({ phone: '123456' }))).toEqual(['phone:invalid']);
    expect(codes(input({ phone: '1'.repeat(21) }))).toEqual(['phone:invalid']);
    expect(codes(input({ phone: '958 584 31 05 ext 2' }))).toEqual(['phone:invalid']);
  });

  it('dirección ≤ 150 y comentarios ≤ 1000 caracteres', () => {
    expect(codes(input({ address: 'x'.repeat(150), notes: 'x'.repeat(1000) }))).toEqual([]);
    expect(codes(input({ address: 'x'.repeat(151) }))).toEqual(['address:length']);
    expect(codes(input({ notes: 'x'.repeat(1001) }))).toEqual(['notes:length']);
  });

  it('hay que aceptar el aviso de privacidad', () => {
    expect(codes(input({ privacy: false }))).toEqual(['privacy:required']);
  });

  it('los errores salen en el orden del formulario', () => {
    expect(codes(input({ checkin: '', name: '', email: '', privacy: false }))).toEqual([
      'checkin:required',
      'name:required',
      'email:required',
      'privacy:required',
    ]);
  });
});

describe('buildQuotePayload', () => {
  it('convierte tipos, recorta textos y manda las fechas como medianoche UTC del día elegido', () => {
    const payload = buildQuotePayload(
      input({
        adults: '3',
        childAges: ['4', '12'],
        rooms: '2',
        roomsTogether: true,
        name: '  Ana Pérez ',
        email: ' ana@example.com ',
        phone: ' +52 958 000 0000 ',
        address: ' Oaxaca, México ',
        notes: ' Llegamos tarde ',
      }),
      { locale: 'es' },
    );
    expect(payload).toEqual({
      checkin: '2026-11-20T00:00:00.000Z',
      checkout: '2026-11-23T00:00:00.000Z',
      adults: 3,
      children: [4, 12],
      rooms: 2,
      roomsTogether: true,
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '+52 958 000 0000',
      address: 'Oaxaca, México',
      notes: 'Llegamos tarde',
    });
  });

  it('con una sola habitación «juntas» siempre es false', () => {
    expect(buildQuotePayload(input({ roomsTogether: true }), { locale: 'es' }).roomsTogether).toBe(
      false,
    );
  });

  it('antepone el tipo de habitación y el idioma del huésped a los comentarios', () => {
    expect(
      buildQuotePayload(input({ notes: 'Con vista' }), { locale: 'es', roomName: 'Doble' }).notes,
    ).toBe('Habitación de interés: Doble\n\nCon vista');
    expect(buildQuotePayload(input(), { locale: 'en', roomName: 'Doble' }).notes).toBe(
      'Habitación de interés: Doble\nIdioma del huésped: inglés',
    );
    expect(buildQuotePayload(input(), { locale: 'es' }).notes).toBe('');
  });

  it('no muta la entrada', () => {
    const original = input({ childAges: ['3'] });
    const copy = structuredClone(original);
    buildQuotePayload(original, { locale: 'es' });
    expect(original).toEqual(copy);
  });
});

describe('parsePrefill', () => {
  const ctx = { today: TODAY, roomSlugs: ['doble', 'familiar'] };
  const parse = (query: string) => parsePrefill(new URLSearchParams(query), ctx);

  it('acepta habitación conocida y fechas válidas', () => {
    expect(parse('room=familiar&checkin=2026-11-20&checkout=2026-11-22')).toEqual({
      roomType: 'familiar',
      checkin: '2026-11-20',
      checkout: '2026-11-22',
    });
  });

  it('ignora habitaciones desconocidas y fechas inválidas, pasadas o incoherentes', () => {
    expect(parse('room=<script>')).toEqual({});
    expect(parse('checkin=2026-11-01&checkout=2026-11-03')).toEqual({});
    expect(parse('checkin=2026-02-30')).toEqual({});
    expect(parse('checkin=2026-11-20&checkout=2026-11-20')).toEqual({ checkin: '2026-11-20' });
    expect(parse('checkout=2026-11-20')).toEqual({ checkout: '2026-11-20' });
    expect(parse('checkout=2026-11-05')).toEqual({});
  });
});

describe('classifyResponse', () => {
  it('éxito solo con HTTP 200 y status "Success"', () => {
    expect(classifyResponse(200, { status: 'Success', message: { id: 'x' } })).toBe('success');
    expect(classifyResponse(200, { status: 'Error' })).toBe('failure');
    expect(classifyResponse(200, null)).toBe('failure');
    expect(classifyResponse(201, { status: 'Success' })).toBe('failure');
  });

  it('403 se distingue (Origin no registrado); el resto es fallo recuperable', () => {
    expect(classifyResponse(403, null)).toBe('forbidden');
    expect(classifyResponse(404, null)).toBe('failure');
    expect(classifyResponse(500, { status: 'Success' })).toBe('failure');
  });
});

describe('resumen de la solicitud', () => {
  it('lista en orden lo que el huésped pidió, con plurales e idioma', () => {
    const rows = quoteSummaryRows(
      input({ childAges: ['4'], rooms: '2', roomsTogether: true, phone: '958 000 0000' }),
      { locale: 'es', messages: quoteMessages('es'), roomName: 'Doble' },
    );
    expect(rows).toEqual([
      { label: 'Llegada', value: '20 de noviembre de 2026' },
      { label: 'Salida', value: '23 de noviembre de 2026 (3 noches)' },
      { label: 'Huéspedes', value: '2 adultos · 1 niño (edades: 4)' },
      { label: 'Habitaciones', value: '2, juntas' },
      { label: 'Habitación de interés', value: 'Doble' },
      { label: 'Nombre', value: 'Ana Pérez' },
      { label: 'Correo electrónico', value: 'ana@example.com' },
      { label: 'Teléfono', value: '958 000 0000' },
    ]);
  });

  it('en inglés y como texto para WhatsApp o correo', () => {
    const text = quoteSummaryText(input({ adults: '1', notes: 'Late arrival' }), {
      locale: 'en',
      messages: quoteMessages('en'),
      hotelName: 'La Cabaña',
    });
    expect(text).toBe(
      [
        'Quote request — La Cabaña',
        'Check-in: November 20, 2026',
        'Check-out: November 23, 2026 (3 nights)',
        'Guests: 1 adult',
        'Rooms: 1',
        'Name: Ana Pérez',
        'Email: ana@example.com',
        'Comments: Late arrival',
      ].join('\n'),
    );
  });
});
