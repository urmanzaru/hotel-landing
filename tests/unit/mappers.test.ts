import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../../site.config.ts';
import {
  buildSnapshotCore,
  imageId,
  mapChargeType,
  resolveImageUrl,
  selectHotel,
  slugify,
} from '../../src/data/mappers.ts';
import { pick } from '../../src/lib/content.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/api/${name}.json`, import.meta.url), 'utf8'));
const hotels = read('hotel');
const roomTypes = read('roomType');
const config = loadSiteConfig({});

describe('helpers', () => {
  it('imageId toma el último segmento y descarta la query', () => {
    expect(imageId('imagen/6018facbe13600442e6aaa87')).toBe('6018facbe13600442e6aaa87');
    expect(imageId('/imagen/abc?x=1')).toBe('abc');
    expect(imageId('')).toBeNull();
  });

  it('resolveImageUrl antepone la API a rutas relativas y respeta las absolutas', () => {
    expect(resolveImageUrl('imagen/abc', 'https://api.test/')).toBe('https://api.test/imagen/abc');
    expect(resolveImageUrl('/imagen/abc', 'https://api.test')).toBe('https://api.test/imagen/abc');
    expect(resolveImageUrl('https://cdn.test/a.jpg', 'https://api.test')).toBe(
      'https://cdn.test/a.jpg',
    );
  });

  it('slugify quita acentos y símbolos', () => {
    expect(slugify('Doble con vista al mar')).toBe('doble-con-vista-al-mar');
    expect(slugify('  Sencilla I  ')).toBe('sencilla-i');
    expect(slugify('Pasadía ñandú')).toBe('pasadia-nandu');
    expect(slugify('***')).toBe('');
  });

  it('mapChargeType acepta texto y el enum numérico del front', () => {
    expect(mapChargeType('NOCHE')).toBe('night');
    expect(mapChargeType('HORA')).toBe('hour');
    expect(mapChargeType('Horas')).toBe('hour');
    expect(mapChargeType(1)).toBe('night');
    expect(mapChargeType(2)).toBe('hour');
    expect(mapChargeType(undefined)).toBe('night');
  });
});

describe('selectHotel', () => {
  it('elige por id exacto, no por posición', () => {
    expect(selectHotel(hotels, '62d3549c7418894690fde2ef').id).toBe('62d3549c7418894690fde2ef');
  });

  it('falla con un mensaje útil si el id no existe', () => {
    expect(() => selectHotel(hotels, 'no-existe')).toThrow(/no existe el hotel "no-existe".*2/);
  });

  it('falla si la API devuelve null o algo que no es un arreglo', () => {
    expect(() => selectHotel(null, 'x')).toThrow(/no existe el hotel/);
    expect(() => selectHotel({ id: 'x' }, 'x')).toThrow(/arreglo/);
  });
});

describe('buildSnapshotCore', () => {
  const core = buildSnapshotCore(hotels, roomTypes, config);

  it('NO incluye datos fiscales, de contacto privado ni de otros hoteles', () => {
    const serialized = JSON.stringify(core);
    for (const forbidden of [
      'rfc',
      'XAXX010101000',
      'businessName',
      'RAZON SOCIAL',
      'regimenCFDI',
      'productOrServiceDefault',
      'Persona de contacto',
      'Luna Mar',
      'otro@example.com',
      'latitude',
      '-1811156.55',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('mapea el hotel: textos, teléfonos, horarios y dirección', () => {
    const { hotel } = core;
    expect(hotel.id).toBe('5fe1ffca46f0600fec51463d');
    expect(hotel.name).toEqual({ es: 'Hotel La Cabaña de Puerto Ángel', en: 'La Cabaña Hotel' });
    // Sin traducción al inglés → `en` queda vacío: `pick()` usa el español y la página lo marca con lang="es".
    expect(hotel.category.en).toBe('');
    expect(pick(hotel.category, 'en')).toBe('Higiénico, confortable y familiar');
    expect(hotel.phones).toEqual(['000 000 0001', '000 000 0002', '000 000 0003']);
    expect(hotel.checkOutTime).toBe('12:00');
    // `entryTime` vacío → valor de la configuración del cliente.
    expect(hotel.checkInTime).toBe(config.checkInTime);
    expect(hotel.address).toMatchObject({
      city: 'Puerto Ángel',
      state: 'Oaxaca',
      postalCode: '70900',
    });
  });

  it('usa el id de archivo de las imágenes y descarta las que no tienen urlImage', () => {
    expect(core.hotel.logoId).toBe('5fe1ffca46f0600fec51463b');
    expect(core.hotel.imageIds).toEqual(['6018facbe13600442e6aaa87', '6018facbe13600442e6aaa89']);
  });

  it('descarta políticas inactivas', () => {
    expect(core.hotel.politics.map((policy) => policy.id)).toEqual(['pol1']);
  });

  it('solo incluye tipos de habitación activos y válidos, ordenados por nombre', () => {
    expect(core.stats.roomTypesTotal).toBe(5); // el que no tiene esName ni se cuenta
    expect(core.stats.roomTypesActive).toBe(4);
    expect(core.roomTypes.map((room) => room.name.es)).toEqual([
      'Doble con vista al mar',
      'Familiar',
      'Familiar',
      'Pasadía',
    ]);
  });

  it('genera slugs únicos y estables cuando el nombre se repite', () => {
    const slugs = core.roomTypes.map((room) => room.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain('familiar');
    expect(slugs).toContain('familiar-9641');
  });

  it('los slugs no dependen del orden en que la API devuelve los tipos', () => {
    const reversed = buildSnapshotCore(hotels, [...(roomTypes as unknown[])].reverse(), config);
    const bySlug = (rooms: typeof core.roomTypes) =>
      Object.fromEntries(rooms.map((room) => [room.slug, room.id]));
    expect(bySlug(reversed.roomTypes)).toEqual(bySlug(core.roomTypes));
  });

  it('normaliza capacidad y tipo de cobro', () => {
    const doble = core.roomTypes.find((room) => room.slug === 'doble-con-vista-al-mar');
    expect(doble).toMatchObject({ adults: 4, children: 2, chargeType: 'night' });
    expect(core.roomTypes.find((room) => room.slug === 'pasadia')?.chargeType).toBe('hour');
  });

  it('referencia fotos de habitación y cuenta textos sin traducción', () => {
    const doble = core.roomTypes.find((room) => room.slug === 'doble-con-vista-al-mar');
    expect(doble?.photoMainId).toBe('5fe8b15b46f06010a040962a');
    expect(doble?.imageIds).toEqual(['601ffe3de1360045aab69e2e', '601ffe3de1360045aab69e30']);
    expect(core.stats.englishFallbacks).toBeGreaterThan(0);
  });

  it('reúne cada imagen una sola vez con su URL absoluta', () => {
    const ids = core.imageSources.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      core.imageSources.find((source) => source.id === '6018facbe13600442e6aaa89'),
    ).toMatchObject({
      sourceUrl: 'https://apihotel-dev.spinoff.website/imagen/6018facbe13600442e6aaa89',
      author: 'Adam Jones',
      linkCopyright: 'https://example.com/foto',
    });
  });

  it('acepta /roomType con message null (sin tipos)', () => {
    expect(buildSnapshotCore(hotels, null, config).roomTypes).toEqual([]);
  });
});
