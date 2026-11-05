/**
 * `/sitemap.xml` propio (en vez de `@astrojs/sitemap`): los slugs se traducen (`/habitaciones/` ↔ `/en/rooms/`), así
 * que las alternativas de idioma se toman del mapa de rutas. Con datos de MUESTRA sale vacío: no se indexan.
 */
import type { APIRoute } from 'astro';
import { getSnapshot } from '../data/load.ts';
import { indexablePages } from '../lib/pages.ts';
import { absoluteUrl, hreflangLinks, sitemapXml } from '../lib/seo.ts';
import { siteConfig } from '../lib/site.ts';

export const GET: APIRoute = () => {
  const snapshot = getSnapshot();
  const { origin, defaultLocale, locales } = siteConfig;
  const hidden = snapshot.dataSource === 'fixture' || siteConfig.noindex;
  const pages = hidden ? [] : indexablePages(snapshot);
  const entries = pages.flatMap((paths) =>
    locales.map((locale) => ({
      loc: absoluteUrl(origin, paths[locale]),
      alternates: hreflangLinks(origin, paths, defaultLocale),
    })),
  );
  return new Response(sitemapXml(entries), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
