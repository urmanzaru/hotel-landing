import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../../clients/index.ts';
import { DEFAULT_CLIENT, clients, loadSiteConfig } from '../../site.config.ts';

const dir = path.join(process.cwd(), 'clients');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.config.ts'))
  .map((name) => name.replace(/\.config\.ts$/, ''))
  .sort();

describe('registro de clientes (playbook 09)', () => {
  it('cada clients/<slug>.config.ts está registrado en clients/index.ts, y nada más', () => {
    expect(CLIENTS.map((client) => client.slug).sort()).toEqual(files);
  });

  it('los slugs son únicos, en minúsculas y existe el cliente por defecto', () => {
    const slugs = CLIENTS.map((client) => client.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(clients[DEFAULT_CLIENT]).toBeDefined();
  });

  for (const slug of files) {
    it(`${slug}: configuración válida (URLs, idiomas, zona horaria, coordenadas)`, () => {
      const config = loadSiteConfig({ CLIENT: slug });
      expect(config.slug).toBe(slug);
      expect(config.hotelId).toMatch(/^[a-f0-9]{24}$/);
      expect(config.locales).toContain(config.defaultLocale);
      expect(() => new Intl.DateTimeFormat('es', { timeZone: config.timeZone })).not.toThrow();
      expect(config.checkInTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(config.checkOutTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(Math.abs(config.coordinates.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(config.coordinates.lng)).toBeLessThanOrEqual(180);
      expect(config.coordinates).not.toEqual({ lat: 0, lng: 0 });
    });
  }
});
