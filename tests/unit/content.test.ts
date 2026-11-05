import { describe, expect, it } from 'vitest';
import {
  addressLine,
  langFor,
  mapLinks,
  paragraphs,
  pick,
  roomMeta,
  telHref,
  toPlainText,
  truncate,
  whatsappHref,
} from '../../src/lib/content.ts';
import type { PublicRoomType } from '../../src/data/types.ts';

const room = (over: Partial<PublicRoomType> = {}): PublicRoomType => ({
  id: 'r',
  slug: 'r',
  name: { es: 'R', en: 'R' },
  description: { es: '', en: '' },
  adults: 2,
  children: 0,
  chargeType: 'night',
  photoMainId: null,
  imageIds: [],
  ...over,
});

describe('langFor', () => {
  it('marca lang="es" solo cuando la página no está en español y el texto cayó al español', () => {
    expect(langFor({ es: 'Hola', en: '' }, 'en')).toBe('es');
    expect(langFor({ es: 'Hola', en: 'Hello' }, 'en')).toBeUndefined();
    expect(langFor({ es: 'Hola', en: '' }, 'es')).toBeUndefined();
    expect(langFor({ es: '', en: '' }, 'en')).toBeUndefined();
  });
});

describe('pick', () => {
  it('usa el idioma pedido y cae al español si está vacío', () => {
    expect(pick({ es: 'Hola', en: 'Hello' }, 'en')).toBe('Hello');
    expect(pick({ es: 'Hola', en: '' }, 'en')).toBe('Hola');
  });
});

describe('roomMeta', () => {
  it('formatea capacidad con plurales correctos en español', () => {
    expect(roomMeta('es', room({ adults: 1, children: 1 }))).toBe('1 adulto · 1 niño · por noche');
    expect(roomMeta('es', room({ adults: 4, children: 2 }))).toBe(
      '4 adultos · 2 niños · por noche',
    );
  });

  it('omite los niños cuando son 0 y distingue noche de hora', () => {
    expect(roomMeta('es', room({ adults: 2, children: 0 }))).toBe('2 adultos · por noche');
    expect(roomMeta('es', room({ chargeType: 'hour' }))).toBe('2 adultos · por hora');
  });

  it('formatea en inglés', () => {
    expect(roomMeta('en', room({ adults: 1, children: 1 }))).toBe('1 adult · 1 child · per night');
    expect(roomMeta('en', room({ adults: 3, children: 2, chargeType: 'hour' }))).toBe(
      '3 adults · 2 children · per hour',
    );
  });
});

describe('addressLine', () => {
  const base = { reference: '', colony: '', city: '', state: '', postalCode: '', country: '' };
  it('une solo las partes con contenido y quita repetidas', () => {
    expect(addressLine({ ...base, city: 'Puerto Ángel', state: 'Oaxaca', country: 'México' })).toBe(
      'Puerto Ángel, Oaxaca, México',
    );
    expect(addressLine({ ...base, city: 'Oaxaca', state: 'Oaxaca' })).toBe('Oaxaca');
    expect(addressLine(base)).toBe('');
  });
});

describe('truncate', () => {
  it('no toca los textos cortos', () => {
    expect(truncate('Hola mundo', 50)).toBe('Hola mundo');
  });
  it('corta en una palabra completa, sin sobrepasar el máximo, y añade …', () => {
    const out = truncate('Hotel familiar frente al mar con habitaciones cómodas y limpias', 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('Hotel familiar frente al mar…');
  });
  it('colapsa espacios y saltos de línea', () => {
    expect(truncate('a   b\n\nc', 50)).toBe('a b c');
  });
});

describe('toPlainText / paragraphs (el PMS puede mandar HTML)', () => {
  it('elimina etiquetas y conserva los saltos de bloque', () => {
    expect(toPlainText('<p>Uno</p><p>Dos<br>tres</p>')).toBe('Uno\n\nDos\ntres');
  });

  it('elimina scripts y estilos completos, no solo sus etiquetas', () => {
    const out = toPlainText('Hola<script>alert("x")</script><style>body{}</style> mundo');
    expect(out).toBe('Hola mundo');
    expect(out).not.toMatch(/alert|body/);
  });

  it('neutraliza etiquetas con atributos peligrosos', () => {
    const out = toPlainText(
      '<img src=x onerror="alert(1)">Texto<a href="javascript:alert(1)">enlace</a>',
    );
    expect(out).toBe('Textoenlace');
  });

  it('decodifica entidades del español (nombradas y numéricas)', () => {
    expect(
      toPlainText('Caf&eacute; ni&ntilde;o &iquest;qu&eacute;? &#225; &#xE9;&nbsp;&lt;3'),
    ).toBe('Café niño ¿qué? á é <3');
    expect(toPlainText('Tom &amp; Jerry &mdash; 10&deg;')).toBe('Tom & Jerry — 10°');
  });

  it('decodifica en una sola pasada y deja intactas las entidades desconocidas o inválidas', () => {
    expect(toPlainText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(toPlainText('&desconocida; &#99999999; &')).toBe('&desconocida; &#99999999; &');
  });

  it('separa párrafos por líneas en blanco y descarta el vacío', () => {
    expect(paragraphs('Uno\n\n\n\nDos\nmisma línea')).toEqual(['Uno', 'Dos\nmisma línea']);
    expect(paragraphs('   ')).toEqual([]);
    expect(paragraphs('<p></p>')).toEqual([]);
  });
});

describe('enlaces', () => {
  it('telHref deja solo dígitos y +', () => {
    expect(telHref('(951) 584-0000')).toBe('tel:9515840000');
    expect(telHref('+52 951 584 0000')).toBe('tel:+529515840000');
  });

  it('whatsappHref exige dígitos suficientes', () => {
    expect(whatsappHref('+52 951 584 0000')).toBe('https://wa.me/529515840000');
    expect(whatsappHref('123')).toBeNull();
    expect(whatsappHref(undefined)).toBeNull();
  });

  it('mapLinks usa las coordenadas dadas', () => {
    const links = mapLinks({ lat: 15.6694, lng: -96.4906 });
    expect(links.google).toBe('https://www.google.com/maps/search/?api=1&query=15.6694,-96.4906');
    expect(links.osm).toContain('mlat=15.6694&mlon=-96.4906');
  });
});
