import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';
import { loadSiteConfig } from './site.config.ts';

// Variables de `.env` y del entorno (CLIENT, SITE_ORIGIN, PUBLIC_API_URL, HOTEL_ID).
const env = { ...loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), ''), ...process.env };
const siteConfig = loadSiteConfig(env);

// El PMS identifica al hotel por el Origin: en desarrollo el sitio DEBE correr en el puerto registrado.
const port = Number(new URL(siteConfig.origin).port) || 4202;

export default defineConfig({
  site: siteConfig.origin,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  server: { port, host: true },
  i18n: {
    defaultLocale: siteConfig.defaultLocale,
    locales: [...siteConfig.locales],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [sitemap()],
  vite: {
    server: { strictPort: true },
    define: { __SITE_CONFIG__: JSON.stringify(siteConfig) },
  },
});
