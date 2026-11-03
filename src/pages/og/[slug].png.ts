import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { getSiteContent } from '../../lib/posts';
import { ogSvg } from '../../lib/og';
export async function getStaticPaths() {
  const { posts } = await getSiteContent();
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { title: post.data.title, ctf: post.data.ctf, category: post.data.category },
  }));
}
export const GET: APIRoute = async ({ props }) => {
  const png = await sharp(Buffer.from(ogSvg(props.title, props.ctf, props.category)))
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
