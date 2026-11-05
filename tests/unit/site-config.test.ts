import { describe, expect, it } from 'vitest';
import { loadSiteConfig, normalizeBase } from '../../site.config.ts';

describe('loadSiteConfig', () => {
  it('usa el cliente por defecto y sus valores de desarrollo', () => {
    const config = loadSiteConfig({});
    expect(config.slug).toBe('lacabana');
    expect(config.origin).toBe('http://localhost:4202');
    expect(config.apiBaseUrl).toBe('https://apihotel-dev.spinoff.website');
    expect(config.hotelId).toBe('5fe1ffca46f0600fec51463d');
  });

  it('aplica las sobrescrituras de entorno y normaliza las URLs', () => {
    const config = loadSiteConfig({
      SITE_ORIGIN: 'https://www.ejemplo.com/',
      PUBLIC_API_URL: 'https://api.ejemplo.com:443/',
      HOTEL_ID: 'abc123',
    });
    expect(config.origin).toBe('https://www.ejemplo.com');
    expect(config.apiBaseUrl).toBe('https://api.ejemplo.com');
    expect(config.hotelId).toBe('abc123');
  });

  it('NOINDEX activa el modo staging (sin indexar); por defecto está apagado', () => {
    expect(loadSiteConfig({}).noindex).toBe(false);
    expect(loadSiteConfig({ NOINDEX: '1' }).noindex).toBe(true);
    expect(loadSiteConfig({ NOINDEX: 'true' }).noindex).toBe(true);
    expect(loadSiteConfig({ NOINDEX: '0' }).noindex).toBe(false);
  });

  it('rechaza un cliente desconocido', () => {
    expect(() => loadSiteConfig({ CLIENT: 'no-existe' })).toThrow(/no existe/);
  });

  it('rechaza URLs inválidas o con otro protocolo', () => {
    expect(() => loadSiteConfig({ SITE_ORIGIN: 'no es una url' })).toThrow(/SITE_ORIGIN/);
    expect(() => loadSiteConfig({ PUBLIC_API_URL: 'ftp://api.ejemplo.com' })).toThrow(
      /PUBLIC_API_URL/,
    );
  });

  it('trata las variables vacías como ausentes', () => {
    expect(loadSiteConfig({ SITE_ORIGIN: '', HOTEL_ID: '  ' }).hotelId).toBe(
      '5fe1ffca46f0600fec51463d',
    );
  });
});

describe('normalizeBase', () => {
  it('siempre empieza y termina con barra', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('nuevo')).toBe('/nuevo/');
    expect(normalizeBase('/nuevo')).toBe('/nuevo/');
    expect(normalizeBase('/nuevo/')).toBe('/nuevo/');
    expect(normalizeBase(' //a/b// ')).toBe('/a/b/');
  });

  it('rechaza caracteres que no son de una ruta', () => {
    expect(() => normalizeBase('/nuevo?x=1')).toThrow(/BASE_PATH/);
    expect(() => normalizeBase('/a b/')).toThrow(/BASE_PATH/);
  });
});
