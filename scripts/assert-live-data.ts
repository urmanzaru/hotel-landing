/**
 * `npm run data:assert-live`: falla si el snapshot es de MUESTRA. Debe ejecutarse en el despliegue, entre
 * `data:fetch` y la subida por FTP, para que datos de ejemplo nunca lleguen a producción.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { snapshotSchema } from '../src/data/types.ts';

const file = process.env['SNAPSHOT_PATH']
  ? path.resolve(process.env['SNAPSHOT_PATH'])
  : path.join(process.cwd(), 'src', 'data', 'snapshot.json');

try {
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (snapshot.dataSource !== 'api') {
    console.error(
      `✖ ${file} es un snapshot de MUESTRA (dataSource="${snapshot.dataSource}"). No se publica.`,
    );
    process.exit(1);
  }
  console.log(`✔ Snapshot real del PMS (${snapshot.generatedAt}).`);
} catch (error) {
  console.error(
    `✖ No se pudo leer el snapshot: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
