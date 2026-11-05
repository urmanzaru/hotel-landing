import { defineConfig, globalIgnores } from 'eslint/config';
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/',
    '.astro/',
    'node_modules/',
    '.cache/',
    'test-results/',
    '.lighthouseci/',
    'playwright-report/',
    'reports/',
  ]),
  tseslint.configs.recommended,
  eslintPluginAstro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Configuración CommonJS de Lighthouse CI (lhci la carga con `require`).
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Convención de Astro: el archivo de entorno referencia sus tipos con triple barra.
    files: ['src/env.d.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },
]);
