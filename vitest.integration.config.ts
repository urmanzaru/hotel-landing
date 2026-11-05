import { defineConfig } from 'vitest/config';

/** Pruebas de integración lentas que necesitan programas del sistema (Apache). `npm run test:apache`. */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
