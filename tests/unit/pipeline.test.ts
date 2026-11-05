import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSiteConfig } from '../../site.config.ts';
import { checkDistImages } from '../../src/data/check-images.ts';
import type { ApiClient } from '../../src/data/client.ts';
import { pickWidths, type ImageFetcher } from '../../src/data/images.ts';
import { assertSnapshotSane, runPipeline } from '../../src/data/pipeline.ts';
import { snapshotSchema, type Snapshot } from '../../src/data/types.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/api/${name}.json`, import.meta.url), 'utf8'));
const config = loadSiteConfig({});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'hotel-pipeline-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const okClient: ApiClient = {
  async getMessage(pathname) {
    if (pathname === '/hotel') return read('hotel');
    if (pathname === '/roomType') return read('roomType');
    throw new Error(`endpoint inesperado en v1: ${pathname}`);
  },
};
const failingClient: ApiClient = {
  async getMessage() {
    throw new Error('HTTP 403 Forbidden');
  },
};

const jpeg = () =>
  sharp({ create: { width: 1000, height: 600, channels: 3, background: '#6b3220' } })
    .jpeg()
    .toBuffer();
const pngWithAlpha = () =>
  sharp({
    create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer();

/** Todas las imágenes responden 200 salvo las que se indiquen (404). El logo es PNG con transparencia. */
function fakeFetcher(notFound: string[] = []): ImageFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    if (notFound.some((id) => url.endsWith(id))) return { ok: false, status: 404 };
    const bytes = url.endsWith('5fe1ffca46f0600fec51463b') ? await pngWithAlpha() : await jpeg();
    return { ok: true, status: 200, bytes };
  }) as ImageFetcher & { calls: string[] };
  fetcher.calls = calls;
  return fetcher;
}

const paths = () => ({
  cacheDir: path.join(dir, '.cache'),
  snapshotPath: path.join(dir, 'snapshot.json'),
  imagesOutDir: path.join(dir, 'public', 'img'),
});

describe('pickWidths', () => {
  it('no amplía: usa los anchos que caben y, si el original es menor, el original', () => {
    expect(pickWidths(1000, [480, 768, 1200, 1920])).toEqual([480, 768, 1000]);
    expect(pickWidths(300, [480, 768, 1200, 1920])).toEqual([300]);
    expect(pickWidths(2500, [480, 768, 1200, 1920])).toEqual([480, 768, 1200, 1920]);
  });
});

describe('runPipeline (con la API disponible)', () => {
  it('genera un snapshot válido, sin datos fiscales, y archivos de imagen optimizados', async () => {
    const result = await runPipeline({
      client: okClient,
      config,
      fetchImage: fakeFetcher(),
      ...paths(),
    });

    expect(result.source).toBe('api');
    const onDisk = JSON.parse(await readFile(paths().snapshotPath, 'utf8')) as unknown;
    const snapshot = snapshotSchema.parse(onDisk);
    expect(snapshot.hotel.name.es).toBe('Hotel La Cabaña de Puerto Ángel');
    expect(snapshot.roomTypes).toHaveLength(4);
    expect(snapshot.stats).toMatchObject({ imagesBroken: 0, roomTypesActive: 4 });

    const raw = JSON.stringify(onDisk);
    expect(raw).not.toMatch(/rfc|regimenCFDI|businessName|productOrServiceDefault/i);

    const logo = snapshot.images['5fe1ffca46f0600fec51463b'];
    expect(logo?.fallbackFormat).toBe('png'); // el logo tiene transparencia
    const photo = snapshot.images['6018facbe13600442e6aaa87'];
    expect(photo).toMatchObject({ width: 1000, height: 600, fallbackFormat: 'jpeg' });
    expect(photo?.variants.map((variant) => variant.width)).toEqual([480, 768, 1000]);
    for (const variant of photo?.variants ?? []) {
      expect(existsSync(path.join(dir, 'public', variant.webp))).toBe(true);
      expect(existsSync(path.join(dir, 'public', variant.fallback))).toBe(true);
    }
    const first = photo?.variants[0];
    expect((await sharp(path.join(dir, 'public', first?.webp ?? '')).metadata()).width).toBe(480);
  });

  it('una imagen 404 se reporta y se omite, sin romper el build', async () => {
    const result = await runPipeline({
      client: okClient,
      config,
      fetchImage: fakeFetcher(['6018facbe13600442e6aaa89']),
      ...paths(),
    });
    expect(result.broken).toEqual([
      expect.objectContaining({ id: '6018facbe13600442e6aaa89', reason: 'HTTP 404' }),
    ]);
    expect(result.snapshot.images['6018facbe13600442e6aaa89']).toBeUndefined();
    expect(result.snapshot.stats.imagesBroken).toBe(1);
    // El snapshot sigue refiriéndose al id: el sitio muestra un placeholder cuando no hay asset.
    expect(result.snapshot.hotel.imageIds).toContain('6018facbe13600442e6aaa89');
  });

  it('si NINGUNA imagen se puede decodificar, el snapshot no se acepta', async () => {
    const fetcher: ImageFetcher = async () => ({
      ok: true,
      status: 200,
      bytes: Buffer.from('<html>no soy imagen</html>'),
    });
    await expect(
      runPipeline({ client: okClient, config, fetchImage: fetcher, ...paths() }),
    ).rejects.toThrow(/ninguna imagen disponible/);
  });

  it('no vuelve a descargar originales que ya están en caché', async () => {
    const first = fakeFetcher();
    await runPipeline({ client: okClient, config, fetchImage: first, ...paths() });
    expect(first.calls.length).toBeGreaterThan(0);

    const second = fakeFetcher();
    await runPipeline({ client: okClient, config, fetchImage: second, ...paths() });
    expect(second.calls).toHaveLength(0);
  });

  it('el hash de contenido no cambia entre builds con los mismos datos', async () => {
    const a = await runPipeline({
      client: okClient,
      config,
      fetchImage: fakeFetcher(),
      ...paths(),
      now: () => new Date('2026-01-01'),
    });
    const b = await runPipeline({
      client: okClient,
      config,
      fetchImage: fakeFetcher(),
      ...paths(),
      now: () => new Date('2026-02-02'),
    });
    expect(a.snapshot.contentHash).toBe(b.snapshot.contentHash);
    expect(a.snapshot.generatedAt).not.toBe(b.snapshot.generatedAt);
  });
});

describe('runPipeline (alias de slugs)', () => {
  it('si el PMS renombra una habitación, el slug anterior queda como alias de su id', async () => {
    await runPipeline({ client: okClient, config, fetchImage: fakeFetcher(), ...paths() });
    const first = snapshotSchema.parse(JSON.parse(await readFile(paths().snapshotPath, 'utf8')));
    const room = first.roomTypes[0];
    if (!room) throw new Error('la fixture no tiene habitaciones');

    const renamed = (read('roomType') as { id: string; esName: string }[]).map((raw) =>
      raw.id === room.id ? { ...raw, esName: `${raw.esName} Renovada` } : raw,
    );
    const renamingClient: ApiClient = {
      async getMessage(pathname) {
        return pathname === '/roomType' ? renamed : okClient.getMessage(pathname);
      },
    };
    await runPipeline({ client: renamingClient, config, fetchImage: fakeFetcher(), ...paths() });
    const second = snapshotSchema.parse(JSON.parse(await readFile(paths().snapshotPath, 'utf8')));
    expect(second.roomTypes.find((item) => item.id === room.id)?.slug).toBe(
      `${room.slug}-renovada`,
    );
    expect(second.roomSlugAliases).toEqual({ [room.slug]: room.id });
  });
});

describe('runPipeline (política de fallo)', () => {
  it('sin API y sin caché: falla y NO escribe snapshot', async () => {
    await expect(
      runPipeline({ client: failingClient, config, fetchImage: fakeFetcher(), ...paths() }),
    ).rejects.toThrow(/no hay uno anterior en caché.*403/s);
    expect(existsSync(paths().snapshotPath)).toBe(false);
  });

  it('con la API caída usa el último snapshot bueno y reconstruye las imágenes desde la caché', async () => {
    await runPipeline({ client: okClient, config, fetchImage: fakeFetcher(), ...paths() });
    await rm(path.join(dir, 'public'), { recursive: true });
    await rm(paths().snapshotPath);

    const logs: string[] = [];
    const result = await runPipeline({
      client: failingClient,
      config,
      fetchImage: fakeFetcher(), // no debe usarse: las imágenes salen de la caché
      ...paths(),
      log: (message) => logs.push(message),
    });
    expect(result.source).toBe('cache');
    expect(result.fallbackReason).toMatch(/403/);
    expect(logs.join('\n')).toMatch(/último snapshot bueno/);
    expect(existsSync(paths().snapshotPath)).toBe(true);
    const photo = result.snapshot.images['6018facbe13600442e6aaa87'];
    expect(existsSync(path.join(dir, 'public', photo?.variants[0]?.webp ?? 'x'))).toBe(true);
  });

  it('si la API devuelve datos inservibles (0 habitaciones activas), conserva el snapshot bueno', async () => {
    await runPipeline({ client: okClient, config, fetchImage: fakeFetcher(), ...paths() });
    const emptyRooms: ApiClient = {
      async getMessage(pathname) {
        return pathname === '/hotel' ? read('hotel') : [];
      },
    };
    const result = await runPipeline({
      client: emptyRooms,
      config,
      fetchImage: fakeFetcher(),
      ...paths(),
    });
    expect(result.source).toBe('cache');
    expect(result.fallbackReason).toMatch(/tipo de habitación activo/);
    expect(result.snapshot.roomTypes).toHaveLength(4);
  });

  it('un archivo de caché corrupto se ignora (equivale a no tener caché)', async () => {
    await runPipeline({ client: okClient, config, fetchImage: fakeFetcher(), ...paths() });
    await writeFile(path.join(paths().cacheDir, 'last-good-snapshot.json'), '{ no es json');
    await expect(
      runPipeline({ client: failingClient, config, fetchImage: fakeFetcher(), ...paths() }),
    ).rejects.toThrow(/no hay uno anterior/);
  });
});

describe('assertSnapshotSane', () => {
  const base = (): Snapshot => ({
    schemaVersion: 1,
    dataSource: 'api',
    generatedAt: '2026-01-01T00:00:00.000Z',
    contentHash: 'x',
    hotel: {
      id: 'h',
      name: { es: 'Hotel', en: 'Hotel' },
      category: { es: '', en: '' },
      description: { es: '', en: '' },
      logoId: null,
      phones: [],
      email: '',
      address: { reference: '', colony: '', city: '', state: '', postalCode: '', country: '' },
      checkInTime: '15:00',
      checkOutTime: '12:00',
      imageIds: [],
      politics: [],
    },
    roomSlugAliases: {},
    roomTypes: [
      {
        id: 'r',
        slug: 'r',
        name: { es: 'R', en: 'R' },
        description: { es: '', en: '' },
        adults: 2,
        children: 0,
        chargeType: 'night',
        photoMainId: null,
        imageIds: [],
      },
    ],
    images: {
      i: {
        id: 'i',
        sourceUrl: 'u',
        name: '',
        description: '',
        author: '',
        linkCopyright: '',
        width: 10,
        height: 10,
        fallbackFormat: 'jpeg',
        variants: [{ width: 10, webp: 'a.webp', fallback: 'a.jpg' }],
      },
    },
    stats: {
      roomTypesTotal: 1,
      roomTypesActive: 1,
      imagesReferenced: 1,
      imagesAvailable: 1,
      imagesBroken: 0,
      englishFallbacks: 0,
    },
  });

  it('acepta un snapshot completo', () => {
    expect(() => assertSnapshotSane(base())).not.toThrow();
  });

  it('enumera todos los problemas', () => {
    const bad = base();
    bad.hotel.name.es = '';
    bad.roomTypes = [];
    bad.images = {};
    const message = (() => {
      try {
        assertSnapshotSane(bad);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toContain('el hotel no tiene nombre');
    expect(message).toContain('ningún tipo de habitación activo');
    expect(message).toContain('ninguna imagen disponible');
  });
});

describe('checkDistImages', () => {
  it('detecta referencias a imágenes que no existen en dist/', async () => {
    const dist = path.join(dir, 'dist');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(dist, 'img', 'abc'), { recursive: true });
    await writeFile(path.join(dist, 'img', 'abc', '480.webp'), 'x');
    await writeFile(
      path.join(dist, 'index.html'),
      `<picture><source srcset="/img/abc/480.webp 480w, /nuevo/img/abc/768.webp 768w"><img src="/img/abc/480.jpg"></picture>
       <div style="background:url('/img/abc/480.webp')"></div>`,
    );
    const result = await checkDistImages(dist);
    expect(result.checked).toBe(3);
    expect(result.missing).toEqual([
      { page: 'index.html', asset: 'img/abc/768.webp' },
      { page: 'index.html', asset: 'img/abc/480.jpg' },
    ]);
  });
});
