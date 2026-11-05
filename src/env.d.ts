/// <reference path="../.astro/types.d.ts" />

import type { SiteConfig } from '../site.config.ts';

declare global {
  /** Inyectado en el build por `astro.config.ts` (ver `loadSiteConfig`). Solo se usa en código de build. */
  const __SITE_CONFIG__: SiteConfig;
}
