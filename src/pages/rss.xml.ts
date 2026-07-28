// /rss.xml — 聚合三个 collection 的非草稿文章，按 pubDate 倒序
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllResearch, articleUrl } from '../lib/content';

export async function GET(context: APIContext) {
  const entries = await getAllResearch();
  return rss({
    title: 'Water — 研究',
    description: '关于智能系统、工具和时间的长期记录。',
    site: context.site ?? 'https://water.localhost',
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      link: articleUrl(entry),
    })),
  });
}
