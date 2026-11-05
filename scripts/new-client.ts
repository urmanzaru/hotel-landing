/**
 * `npm run client:new -- <slug> --hotel-id <id> --lat <lat> --lng <lng> [--tz <zona>] [--dev-port <puerto>]
 *   [--api <url>] [--locales es,en]`
 * Alta de un hotel (playbook 09, docs/runbooks/nuevo-cliente.md): crea `clients/<slug>.config.ts`, lo registra en
 * `clients/index.ts` y muestra los pasos que siguen. No toca GitHub, el PMS ni el hosting.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { CLIENTS } from '../clients/index.ts';
import {
  clientConfigSource,
  negativeNumberArgs,
  nextDevPort,
  registerClient,
  validateNewClient,
  type NewClientInput,
} from '../src/lib/new-client.ts';

const { values, positionals } = parseArgs({
  args: negativeNumberArgs(process.argv.slice(2)),
  allowPositionals: true,
  options: {
    'hotel-id': { type: 'string', default: '' },
    lat: { type: 'string', default: '' },
    lng: { type: 'string', default: '' },
    tz: { type: 'string', default: 'America/Mexico_City' },
    'dev-port': { type: 'string' },
    api: { type: 'string', default: 'https://apihotel-dev.spinoff.website' },
    locales: { type: 'string', default: 'es,en' },
  },
});

const input: NewClientInput = {
  slug: positionals[0] ?? '',
  hotelId: values['hotel-id'],
  devPort: Number(values['dev-port'] ?? nextDevPort(CLIENTS.map((client) => client.origin))),
  apiBaseUrl: values.api,
  timeZone: values.tz,
  lat: values.lat === '' ? Number.NaN : Number(values.lat),
  lng: values.lng === '' ? Number.NaN : Number(values.lng),
  locales: values.locales.split(',').map((locale) => locale.trim()) as NewClientInput['locales'],
};

const root = process.cwd();
const configFile = path.join(root, 'clients', `${input.slug}.config.ts`);
const problems = validateNewClient(
  input,
  CLIENTS.map((client) => client.slug),
);
if (input.locales.some((locale) => locale !== 'es' && locale !== 'en')) {
  problems.push('--locales: por ahora solo «es» y «en»');
}
if (existsSync(configFile)) problems.push(`ya existe ${path.relative(root, configFile)}`);
if (problems.length > 0) {
  console.error('✖ No se creó el cliente:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nUso: npm run client:new -- <slug> --hotel-id <id> --lat <lat> --lng <lng> [--tz America/Cancun]',
  );
  process.exit(1);
}

async function pretty(file: string, source: string): Promise<string> {
  return format(source, { ...(await resolveConfig(file)), filepath: file });
}

const indexFile = path.join(root, 'clients', 'index.ts');
await writeFile(configFile, await pretty(configFile, clientConfigSource(input)));
const index = registerClient(await readFile(indexFile, 'utf8'), input.slug);
await writeFile(indexFile, await pretty(indexFile, index));

const slug = input.slug;
console.log(`✔ clients/${slug}.config.ts creado y registrado en clients/index.ts

Siguientes pasos (docs/runbooks/nuevo-cliente.md):
  1. PMS de dev: url del hotel = http://localhost:${input.devPort}. Probar: CLIENT=${slug} npm run api:verify
  2. Datos reales: CLIENT=${slug} npm run data:fetch   (sin ellos, dev/build usan datos de MUESTRA)
  3. Logo: docs/brand/${slug}-logo-source.png → CLIENT=${slug} npm run brand:assets y activar logoFile
  4. GitHub: Environments ${slug}-staging y ${slug}-production (secretos y variables) y AUTO_TARGETS
  5. npm run verify y commit`);
