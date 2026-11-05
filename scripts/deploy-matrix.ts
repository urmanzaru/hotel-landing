/**
 * `deploy.yml` (job «plan»): calcula qué hotel se publica y en qué Environment (`src/lib/deploy-matrix.ts`) y lo
 * deja en `$GITHUB_OUTPUT` como `matrix=[...]`. Lee el evento y las entradas de variables de entorno (nunca
 * interpoladas en el script del workflow): EVENT, INPUT_CLIENT, INPUT_TARGET, AUTO_TARGETS, PAYLOAD_CLIENT.
 */
import { appendFileSync } from 'node:fs';
import { clients } from '../site.config.ts';
import { deployMatrix } from '../src/lib/deploy-matrix.ts';

const env = process.env;
let matrix;
try {
  matrix = deployMatrix({
    event: env['EVENT'] ?? '',
    clients: Object.keys(clients),
    autoTargets: env['AUTO_TARGETS'],
    client: env['INPUT_CLIENT'],
    target: env['INPUT_TARGET'],
    payloadClient: env['PAYLOAD_CLIENT'],
  });
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const line = `matrix=${JSON.stringify(matrix)}`;
if (env['GITHUB_OUTPUT']) appendFileSync(env['GITHUB_OUTPUT'], `${line}\n`);
console.log(
  matrix.length > 0
    ? `Se publica: ${matrix.map((job) => job.environment).join(', ')}`
    : 'Nada que publicar (sin AUTO_TARGETS para este evento)',
);
console.log(line);
