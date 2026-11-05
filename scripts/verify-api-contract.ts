/**
 * `npm run api:verify` — Paso 1 del playbook 02: comprueba contra la API REAL que lo que el sitio asume es cierto.
 * Solo hace GET y un OPTIONS (preflight). NUNCA hace POST: no crea registros en el PMS.
 *
 *   npm run api:verify                 # verifica y muestra un resumen
 *   npm run api:verify -- --record     # además guarda fixtures sanitizadas en tests/fixtures/recorded/
 *
 * Usa SITE_ORIGIN, PUBLIC_API_URL y HOTEL_ID (de `.env` o del entorno; por defecto, los de dev).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSiteConfig } from '../site.config.ts';
import { describeError } from '../src/data/client.ts';
import { buildSnapshotCore } from '../src/data/mappers.ts';

const config = loadSiteConfig(process.env);
const record = process.argv.includes('--record');
const base = config.apiBaseUrl;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Si es false, un fallo no hace fallar el script (informativo). */
  required: boolean;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string, required = true) =>
  checks.push({ name, ok, detail, required });

async function get(pathname: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${pathname}`, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, text, json };
}

function messageOf(json: unknown): unknown {
  return (json as { message?: unknown } | undefined)?.message;
}

console.log(`API: ${base}\nOrigin: ${config.origin}\nHotel: ${config.hotelId}\n`);

// 1. /hotel responde sin Origin y trae los hoteles
let hotels: unknown[] = [];
try {
  const res = await get('/hotel');
  hotels = Array.isArray(messageOf(res.json)) ? (messageOf(res.json) as unknown[]) : [];
  add(
    'GET /hotel sin Origin → 200 con hoteles',
    res.status === 200 && hotels.length > 0,
    `HTTP ${res.status}, ${hotels.length} hotel(es)`,
  );
  const ids = hotels.map((hotel) => (hotel as { id?: string }).id);
  add(
    `El hotel ${config.hotelId} existe en /hotel`,
    ids.includes(config.hotelId),
    `ids: ${ids.join(', ')}`,
  );
} catch (error) {
  add('GET /hotel', false, `error de red: ${describeError(error)}`);
}

// 2. /roomType con el Origin correcto (Node DEBE poder fijar Origin)
let roomTypes: unknown[] = [];
try {
  const res = await get('/roomType', { Origin: config.origin });
  roomTypes = Array.isArray(messageOf(res.json)) ? (messageOf(res.json) as unknown[]) : [];
  add(
    'GET /roomType con Origin correcto → 200 (Node envía Origin)',
    res.status === 200,
    `HTTP ${res.status}, ${roomTypes.length} tipo(s)${res.status === 403 ? ' — ¿el Origin no está registrado en el PMS, o Node no lo envía?' : ''}`,
  );
  const hotelIds = new Set(
    roomTypes.map((room) => (room as { hotelSelected?: string }).hotelSelected),
  );
  add(
    'Los tipos de habitación son del hotel esperado',
    roomTypes.length > 0 && hotelIds.size === 1 && hotelIds.has(config.hotelId),
    `hotelSelected: ${[...hotelIds].join(', ') || '(ninguno)'}`,
  );
  add(
    'CORS: Access-Control-Allow-Origin presente',
    res.headers.get('access-control-allow-origin') !== null,
    `access-control-allow-origin: ${res.headers.get('access-control-allow-origin') ?? '(ausente)'}`,
    false,
  );
} catch (error) {
  add('GET /roomType con Origin', false, `error de red: ${describeError(error)}`);
}

// 3. Origin no registrado → 403 (confirma el modelo multi-tenant)
try {
  const res = await get('/roomType', { Origin: 'https://origen-no-registrado.invalid' });
  add('GET /roomType con Origin NO registrado → 403', res.status === 403, `HTTP ${res.status}`);
} catch (error) {
  add('GET /roomType con Origin falso', false, `error de red: ${describeError(error)}`);
}

// 4. Preflight CORS del POST de cotización (el navegador lo hace antes del POST JSON)
try {
  const res = await fetch(`${base}/receiveCotization`, {
    method: 'OPTIONS',
    headers: {
      Origin: config.origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
    signal: AbortSignal.timeout(20_000),
  });
  const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  const allowOrigin = res.headers.get('access-control-allow-origin');
  add(
    'Preflight OPTIONS /receiveCotization permite Content-Type',
    res.status < 300 && allowHeaders.includes('content-type') && allowOrigin !== null,
    `HTTP ${res.status}, allow-origin: ${allowOrigin ?? '(ausente)'}, allow-headers: ${allowHeaders || '(ausente)'}`,
  );
} catch (error) {
  add('Preflight OPTIONS /receiveCotization', false, `error de red: ${describeError(error)}`);
}

// 5. Imágenes: cuántas dan 404 (sin Origin, como un <img>)
try {
  const sources = buildSnapshotCore(hotels, roomTypes, config).imageSources;
  let broken = 0;
  const queue = [...sources];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length > 0) {
        const source = queue.shift();
        if (!source) break;
        try {
          const res = await fetch(source.sourceUrl, { signal: AbortSignal.timeout(30_000) });
          await res.body?.cancel();
          if (!res.ok) broken += 1;
        } catch {
          broken += 1;
        }
      }
    }),
  );
  add(
    'Imágenes del hotel y sus habitaciones',
    sources.length > 0,
    `${sources.length} referenciadas, ${broken} no cargan (el levantamiento anterior contó 16 de 133 en todo el sitio)`,
    false,
  );
} catch (error) {
  add('Imágenes', false, `no se pudo revisar: ${describeError(error)}`, false);
}

// Resultado
let failed = false;
for (const check of checks) {
  const icon = check.ok ? '✔' : check.required ? '✖' : '⚠';
  if (!check.ok && check.required) failed = true;
  console.log(`${icon} ${check.name}\n    ${check.detail}`);
}

if (record) {
  // Sanitiza: solo el hotel elegido y sin datos fiscales.
  const FORBIDDEN = [
    'rfc',
    'businessName',
    'regimenCFDI',
    'productOrServiceDefault',
    'productOrServiceDefaultSelected',
    'contact',
  ];
  const mine = hotels.find((hotel) => (hotel as { id?: string }).id === config.hotelId) as
    Record<string, unknown> | undefined;
  if (mine) {
    for (const key of FORBIDDEN) delete mine[key];
    const dir = path.join(process.cwd(), 'tests', 'fixtures', 'recorded');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'hotel.json'), `${JSON.stringify([mine], null, 2)}\n`);
    await writeFile(path.join(dir, 'roomType.json'), `${JSON.stringify(roomTypes, null, 2)}\n`);
    console.log(`\nFixtures sanitizadas guardadas en ${dir}`);
  } else {
    console.log('\nNo se grabaron fixtures: el hotel no está en la respuesta.');
  }
}

console.log(
  failed ? '\n✖ El contrato NO se cumple: revisa los puntos marcados.' : '\n✔ Contrato verificado.',
);
process.exit(failed ? 1 : 0);
