/** `/robots.txt`: apunta al sitemap. Con datos de MUESTRA bloquea todo (ese sitio nunca debe indexarse). */
import type { APIRoute } from 'astro';
import { getSnapshot } from '../data/load.ts';
import { absoluteUrl, robotsTxt } from '../lib/seo.ts';
import { siteConfig } from '../lib/site.ts';
import { url } from '../lib/url.ts';

export const GET: APIRoute = () => {
  const body =
    getSnapshot().dataSource === 'fixture'
      ? 'User-agent: *\nDisallow: /\n'
      : robotsTxt(absoluteUrl(siteConfig.origin, url('sitemap.xml')));
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
