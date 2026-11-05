/** `npm run data:fixture`: snapshot de MUESTRA para desarrollar sin la API. No es publicable. */
import { loadSiteConfig } from '../site.config.ts';
import { generateFixtureSnapshot } from '../src/data/fixture.ts';

const result = await generateFixtureSnapshot(process.cwd(), loadSiteConfig(process.env), {
  log: (message) => console.warn(message),
});
console.log(
  `⚠ Snapshot de MUESTRA (${result.snapshot.hotel.name.es}): ${result.snapshot.roomTypes.length} habitaciones, ` +
    `${Object.keys(result.snapshot.images).length} imágenes. No publicar: usa \`npm run data:fetch\` con la API real.`,
);
