import type { APIContext } from 'astro';
import { getAllProjects, getAllResearch, getAllTags, articleUrl, projectUrl } from '../lib/content';

export async function GET(context: APIContext) {
  const site = context.site ?? new URL('https://water.localhost');
  const [research, projects, tags] = await Promise.all([
    getAllResearch(),
    getAllProjects(),
    getAllTags(),
  ]);

  const paths = [
    '/',
    '/research',
    '/projects',
    '/about',
    ...research.map(articleUrl),
    ...projects.map(projectUrl),
    ...tags.map((tag) => `/research/tags/${encodeURIComponent(tag)}`),
  ];

  const urls = [...new Set(paths)]
    .map((pathname) => `  <url><loc>${new URL(pathname, site).href}</loc></url>`)
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  );
}
