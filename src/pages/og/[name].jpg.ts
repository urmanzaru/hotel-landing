/** `/og/<nombre>.jpg`: imágenes para compartir, generadas en el build (ver `src/lib/og.ts`). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getSnapshot } from '../../data/load.ts';
import type { ImageAsset } from '../../data/types.ts';
import { ogSources } from '../../lib/og.ts';
import { renderOgImage } from '../../lib/og-render.ts';

export const getStaticPaths = (() =>
  ogSources(getSnapshot()).map(({ name, asset }) => ({
    params: { name },
    props: { asset },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const image = await renderOgImage((props as { asset?: ImageAsset }).asset);
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/jpeg' } });
};
