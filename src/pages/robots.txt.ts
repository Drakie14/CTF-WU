import type { APIRoute } from 'astro';

/** `/robots.txt` — chặn /admin (Sveltia CMS), trỏ tới sitemap theo SITE_URL. */
export const GET: APIRoute = ({ site, url }) => {
  const sitemap = new URL('/sitemap-index.xml', site ?? url.origin).href;
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /admin', '', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
