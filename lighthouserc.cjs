/**
 * Lighthouse CI (playbook 06): presupuestos en móvil (perfil por defecto de Lighthouse: Moto G, 4G lenta).
 * `npm run lhci` construye antes con `npm run build`; aquí se sirve `dist/` estático.
 *
 * `is-crawlable` se omite (`skipAudits`, así no cuenta en la categoría SEO): en CI se construye con datos de MUESTRA, que llevan `noindex` a propósito. Que el sitio
 * real NO lleve `noindex` lo comprueban `tests/unit/build-variants.test.ts` y `tests/e2e/pages.spec.ts`.
 */
const { readFileSync } = require('node:fs');

/** Primera habitación del snapshot (el build lo genera antes de que corra Lighthouse). */
const room = (() => {
  try {
    return JSON.parse(readFileSync('./src/data/snapshot.json', 'utf8')).roomTypes[0]?.slug;
  } catch {
    return undefined;
  }
})();

module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: [
        'http://localhost/',
        'http://localhost/en/',
        'http://localhost/habitaciones/',
        ...(room ? [`http://localhost/habitaciones/${room}/`] : []),
        'http://localhost/galeria/',
        'http://localhost/cotizar/',
      ],
      numberOfRuns: 3,
      settings: {
        // En contenedores (CI, nube) Chrome necesita estas banderas.
        chromeFlags: '--headless=new --no-sandbox --disable-dev-shm-usage',
        skipAudits: ['is-crawlable'],
      },
      ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
    },
    assert: {
      // Se compara la mediana de las 3 corridas (Lighthouse varía entre ejecuciones).
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        // INP no se mide en laboratorio; el bloqueo total del hilo principal es su mejor indicador.
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'resource-summary:script:size': ['error', { maxNumericValue: 20 * 1024 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};
