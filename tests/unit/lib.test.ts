import { describe, expect, it } from 'vitest';
import { t, ui } from '../../src/i18n/ui.ts';
import { themeCss } from '../../src/lib/theme.ts';
import { joinBase, localePath, stripLocale } from '../../src/lib/url.ts';

describe('joinBase', () => {
  it('une la base con la ruta sin duplicar barras', () => {
    expect(joinBase('/', '/habitaciones/')).toBe('/habitaciones/');
    expect(joinBase('/', 'habitaciones/')).toBe('/habitaciones/');
    expect(joinBase('/nuevo/', '/habitaciones/')).toBe('/nuevo/habitaciones/');
    expect(joinBase('/nuevo', 'img/a.webp')).toBe('/nuevo/img/a.webp');
    expect(joinBase('/nuevo/', '//x')).toBe('/nuevo/x');
  });
});

describe('localePath', () => {
  it('el español no lleva prefijo y el inglés sí', () => {
    expect(localePath('es', '/habitaciones/')).toBe('/habitaciones/');
    expect(localePath('en', '/rooms/')).toBe('/en/rooms/');
    expect(localePath('en', 'rooms/')).toBe('/en/rooms/');
    expect(localePath('en', '/')).toBe('/en/');
  });
});

describe('stripLocale', () => {
  it('quita el prefijo de idioma y deja intactas las rutas sin él', () => {
    expect(stripLocale('/en/rooms/', ['es', 'en'])).toBe('/rooms/');
    expect(stripLocale('/en/', ['es', 'en'])).toBe('/');
    expect(stripLocale('/en', ['es', 'en'])).toBe('/');
    expect(stripLocale('/habitaciones/', ['es', 'en'])).toBe('/habitaciones/');
    expect(stripLocale('/english/', ['es', 'en'])).toBe('/english/');
  });
});

describe('themeCss', () => {
  it('sin tokens no genera nada', () => {
    expect(themeCss({})).toBe('');
  });

  it('genera un bloque :root con las sobrescrituras', () => {
    expect(themeCss({ '--color-brand': '#112233', '--radius-md': '1rem' })).toBe(
      ':root {\n  --color-brand: #112233;\n  --radius-md: 1rem;\n}',
    );
  });

  it('rechaza nombres que no son tokens', () => {
    expect(() => themeCss({ color: 'red' })).toThrow(/Nombre de token/);
    expect(() => themeCss({ '--a;b': 'red' })).toThrow(/Nombre de token/);
  });

  it.each([
    'red; } body { display:none',
    'url(https://evil.test/x.png)',
    'expression(alert(1))',
    '</style><script>alert(1)</script>',
    '@import "x"',
    '',
  ])('rechaza el valor peligroso %j', (value) => {
    expect(() => themeCss({ '--color-brand': value })).toThrow(/Valor no válido/);
  });
});

describe('i18n de la interfaz', () => {
  it('es y en tienen exactamente las mismas claves, ninguna vacía', () => {
    expect(Object.keys(ui.en).sort()).toEqual(Object.keys(ui.es).sort());
    for (const locale of ['es', 'en'] as const) {
      for (const [key, value] of Object.entries(ui[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('interpola parámetros y conserva los que faltan', () => {
    expect(t('es', 'gallery.position', { current: 2, total: 6 })).toBe('Foto 2 de 6');
    expect(t('en', 'gallery.position', { current: 2, total: 6 })).toBe('Photo 2 of 6');
    expect(t('es', 'gallery.position', { current: 2 })).toBe('Foto 2 de {total}');
  });
});
