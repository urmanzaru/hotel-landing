/**
 * Piezas puras de `npm run client:new` (playbook 09, alta de un hotel): validar los datos, generar
 * `clients/<slug>.config.ts` y registrarlo en `clients/index.ts`.
 */
export interface NewClientInput {
  slug: string;
  hotelId: string;
  /** Puerto de desarrollo: el PMS de dev debe tener `http://localhost:<puerto>` como `url` del hotel. */
  devPort: number;
  apiBaseUrl: string;
  timeZone: string;
  lat: number;
  lng: number;
  locales: readonly ('es' | 'en')[];
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lista de problemas (vacía = todo bien). Mensajes pensados para quien ejecuta el comando. */
export function validateNewClient(input: NewClientInput, existing: readonly string[]): string[] {
  const problems: string[] = [];
  if (!SLUG.test(input.slug)) {
    problems.push(`slug «${input.slug}»: solo minúsculas, números y guiones (p. ej. «hotel-mar»)`);
  } else if (existing.includes(input.slug)) {
    problems.push(`ya existe un cliente «${input.slug}»`);
  }
  if (!/^[a-f0-9]{24}$/.test(input.hotelId)) {
    problems.push('--hotel-id: el id del hotel en el PMS (24 caracteres hexadecimales)');
  }
  if (!Number.isInteger(input.devPort) || input.devPort < 1024 || input.devPort > 65535) {
    problems.push('--dev-port: un puerto entre 1024 y 65535');
  }
  try {
    const url = new URL(input.apiBaseUrl);
    if (url.protocol !== 'https:') problems.push('--api: debe ser https://');
  } catch {
    problems.push(`--api: «${input.apiBaseUrl}» no es una URL`);
  }
  try {
    new Intl.DateTimeFormat('es', { timeZone: input.timeZone });
  } catch {
    problems.push(`--tz: «${input.timeZone}» no es una zona IANA (p. ej. America/Mexico_City)`);
  }
  if (!Number.isFinite(input.lat) || Math.abs(input.lat) > 90 || input.lat === 0) {
    problems.push('--lat: latitud del hotel (−90 a 90, tomada de Google Maps)');
  }
  if (!Number.isFinite(input.lng) || Math.abs(input.lng) > 180 || input.lng === 0) {
    problems.push('--lng: longitud del hotel (−180 a 180)');
  }
  if (input.locales.length === 0 || input.locales[0] !== 'es') {
    problems.push('--locales: el español va primero (es el idioma principal), p. ej. «es,en»');
  }
  return problems;
}

/** Identificador de JavaScript para el import (`hotel-mar` → `hotelMar`). */
export function clientIdentifier(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export function clientConfigSource(input: NewClientInput): string {
  const locales = input.locales.map((locale) => `'${locale}'`).join(', ');
  return `import { defineClient } from './types.ts';

/**
 * Alta generada con \`npm run client:new\`. Valores de DESARROLLO: el origen y la API de producción van en las
 * variables del Environment \`${input.slug}-production\` de GitHub (docs/runbooks/nuevo-cliente.md).
 */
export default defineClient({
  slug: '${input.slug}',
  hotelId: '${input.hotelId}',
  // El PMS de dev debe tener este origen como \`url\` del hotel (si no, la API responde 403).
  origin: 'http://localhost:${input.devPort}',
  apiBaseUrl: '${input.apiBaseUrl}',
  defaultLocale: 'es',
  locales: [${locales}],
  timeZone: '${input.timeZone}',
  // Se usan si el PMS no trae las horas: confirmarlas con el hotel.
  checkInTime: '15:00',
  checkOutTime: '12:00',
  // Ubicación del hotel (la del PMS no es fiable).
  coordinates: { lat: ${input.lat}, lng: ${input.lng} },
  contact: {},
  // Logo: docs/brand/${input.slug}-logo-source.png → \`CLIENT=${input.slug} npm run brand:assets\`, y descomentar:
  // logoFile: '${input.slug}-logo',
  // Colores de marca: sobrescrituras de tokens (docs/brand/design-system.md); el contraste lo vigilan las pruebas.
  theme: {},
});
`;
}

/** Añade el cliente a `clients/index.ts`: un import más y la lista regenerada en orden alfabético. */
export function registerClient(indexSource: string, slug: string): string {
  const importLine = (name: string) =>
    `import ${clientIdentifier(name)} from './${name}.config.ts';`;
  const imported = [
    ...indexSource.matchAll(/^import \w+ from '\.\/([a-z0-9-]+)\.config\.ts';$/gm),
  ].map((match) => match[1] as string);
  if (imported.includes(slug)) return indexSource;
  const all = [...imported, slug].sort();
  const firstImport = indexSource.search(/^import \w+ from '\.\/[a-z0-9-]+\.config\.ts';$/m);
  if (firstImport === -1)
    throw new Error('clients/index.ts no tiene el formato esperado (imports)');
  const withoutImports = indexSource.replace(
    /^import \w+ from '\.\/[a-z0-9-]+\.config\.ts';\n/gm,
    '',
  );
  const withImports =
    withoutImports.slice(0, firstImport) +
    all.map(importLine).join('\n') +
    '\n' +
    withoutImports.slice(firstImport);
  const list = /export const CLIENTS: readonly ClientConfig\[\] = \[[^\]]*\];/;
  if (!list.test(withImports)) {
    throw new Error('clients/index.ts no tiene el formato esperado (export const CLIENTS = [...])');
  }
  return withImports.replace(
    list,
    `export const CLIENTS: readonly ClientConfig[] = [${all.map(clientIdentifier).join(', ')}];`,
  );
}

/** Siguiente puerto de desarrollo libre (4202 es el de La Cabaña). */
export function nextDevPort(origins: readonly string[]): number {
  const ports = origins
    .map((origin) => new URL(origin))
    .filter((url) => url.hostname === 'localhost')
    .map((url) => Number(url.port) || 80);
  return Math.max(4201, ...ports) + 1;
}

/**
 * `parseArgs` de Node rechaza `--lng -86.85` (un valor que empieza con guion parece otra opción). Pega a su opción
 * los valores numéricos negativos: `--lng=-86.85`.
 */
export function negativeNumberArgs(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    const next = argv[i + 1];
    if (/^--[a-z-]+$/.test(arg) && next !== undefined && /^-\d/.test(next)) {
      out.push(`${arg}=${next}`);
      i += 1;
    } else {
      out.push(arg);
    }
  }
  return out;
}
