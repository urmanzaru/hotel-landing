import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../../site.config.ts';
import { buildSnapshotCore } from '../../src/data/mappers.ts';
import type { ImageAsset, Snapshot } from '../../src/data/types.ts';
import { roomUrl } from '../../src/lib/routes.ts';
import {
  heroImage,
  hotelGallery,
  photoCredits,
  roomCover,
  roomGallery,
} from '../../src/lib/photos.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/api/${name}.json`, import.meta.url), 'utf8'));
const core = buildSnapshotCore(read('hotel'), read('roomType'), loadSiteConfig({}));

const asset = (id: string, over: Partial<ImageAsset> = {}): ImageAsset => ({
  id,
  sourceUrl: `https://x.test/imagen/${id}`,
  name: `Foto ${id}`,
  description: '',
  author: '',
  linkCopyright: '',
  width: 1000,
  height: 600,
  fallbackFormat: 'jpeg',
  variants: [{ width: 1000, webp: `img/${id}/1000.webp`, fallback: `img/${id}/1000.jpg` }],
  ...over,
});

/** Snapshot con TODAS las imágenes disponibles salvo las indicadas (404 en el PMS). */
function snapshot(missing: string[] = []): Snapshot {
  const images = Object.fromEntries(
    core.imageSources.filter((s) => !missing.includes(s.id)).map((s) => [s.id, asset(s.id)]),
  );
  return {
    schemaVersion: 1,
    dataSource: 'api',
    generatedAt: '2026-01-01T00:00:00.000Z',
    contentHash: 'x',
    hotel: core.hotel,
    roomTypes: core.roomTypes,
    roomSlugAliases: {},
    images,
    stats: {
      roomTypesTotal: 0,
      roomTypesActive: 0,
      imagesReferenced: 0,
      imagesAvailable: 0,
      imagesBroken: 0,
      englishFallbacks: 0,
    },
  };
}

describe('hotelGallery', () => {
  it('junta las fotos del hotel y de las habitaciones, sin repetir', () => {
    const items = hotelGallery(snapshot(), 'es');
    const ids = items.map((item) => item.asset?.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual(['6018facbe13600442e6aaa87', '6018facbe13600442e6aaa89']);
    expect(ids).toContain('5fe8b15b46f06010a040962a'); // foto principal de una habitación
  });

  it('omite las imágenes que no están disponibles (404) sin romper nada', () => {
    const items = hotelGallery(snapshot(['6018facbe13600442e6aaa87']), 'es');
    expect(items.map((item) => item.asset?.id)).not.toContain('6018facbe13600442e6aaa87');
    expect(items.length).toBeGreaterThan(0);
  });

  it('sin ninguna imagen disponible devuelve una lista vacía', () => {
    expect(hotelGallery({ ...snapshot(), images: {} }, 'es')).toEqual([]);
  });
});

describe('roomGallery / roomCover', () => {
  const doble = core.roomTypes.find((room) => room.slug === 'doble-con-vista-al-mar');
  if (!doble) throw new Error('fixture sin la habitación esperada');

  it('pone la foto principal primero', () => {
    const items = roomGallery(snapshot(), doble, 'es');
    expect(items[0]?.asset?.id).toBe('5fe8b15b46f06010a040962a');
    expect(items).toHaveLength(3);
  });

  it('el texto alternativo incluye el nombre de la habitación', () => {
    expect(roomGallery(snapshot(), doble, 'es')[0]?.alt).toContain('Doble con vista al mar');
  });

  it('la portada cae a otra foto si la principal no existe, y es undefined si no hay ninguna', () => {
    expect(roomCover(snapshot(['5fe8b15b46f06010a040962a']), doble)?.id).toBe(
      '601ffe3de1360045aab69e2e',
    );
    expect(roomCover({ ...snapshot(), images: {} }, doble)).toBeUndefined();
  });
});

describe('heroImage', () => {
  it('usa la primera foto del hotel', () => {
    expect(heroImage(snapshot())?.id).toBe('6018facbe13600442e6aaa87');
  });

  it('si el hotel no tiene fotos disponibles, usa la de una habitación', () => {
    const hotelIds = core.hotel.imageIds;
    const out = heroImage(snapshot(hotelIds));
    expect(out).toBeDefined();
    expect(hotelIds).not.toContain(out?.id);
  });

  it('es undefined si no hay ninguna imagen', () => {
    expect(heroImage({ ...snapshot(), images: {} })).toBeUndefined();
  });
});

describe('photoCredits', () => {
  it('lista autores sin repetir y solo enlaza http(s)', () => {
    const items = [
      {
        alt: 'a',
        asset: asset('1', { author: 'Adam Jones', linkCopyright: 'https://example.com/foto' }),
      },
      {
        alt: 'b',
        asset: asset('2', { author: 'Adam Jones', linkCopyright: 'https://example.com/foto' }),
      },
      {
        alt: 'c',
        asset: asset('3', { author: 'Otra Persona', linkCopyright: 'javascript:alert(1)' }),
      },
      { alt: 'd', asset: asset('4') },
    ];
    expect(photoCredits(items)).toEqual([
      { author: 'Adam Jones', href: 'https://example.com/foto', work: 'Foto 1' },
      { author: 'Otra Persona', href: null, work: 'Foto 3' },
    ]);
  });
});

describe('roomUrl', () => {
  it('compone la URL del detalle en cada idioma', () => {
    expect(roomUrl('es', 'familiar')).toMatch(/\/habitaciones\/familiar\/$/);
    expect(roomUrl('en', 'familiar')).toMatch(/\/en\/rooms\/familiar\/$/);
  });
});
