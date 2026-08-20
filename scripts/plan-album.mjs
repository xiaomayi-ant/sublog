// plan-album — 出期前先看清楚这一期会收录什么，不联网、不花钱、不生成任何东西。
//
// 月刊最容易做歪的地方是出空期：某个方向当月一篇没有，仍然生成一张封面挂在那里。
// 所以这个脚本的主要职责不是"列出内容"，是"告诉你哪几本该跳过这个月"。
//
// 用法：node scripts/plan-album.mjs [YYYY-MM]     不给月份就用当月
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const COLLECTIONS = ['harness', 'llm', 'eval', 'notes'];
// 与 src/lib/content.ts 的 TYPE_LABELS 重复了一份 —— 这个脚本不走 Astro 运行时，
// 拿不到 astro:content。harness 没有中文释义，直接用原词。
const LABELS = { harness: 'Harness', llm: '模型', eval: '评估', notes: '笔记' };

// 一期至少要有这么多篇才值得出。少于它就跳过这个月 ——
// 一篇不构成"精选"，而空期挂在那里读起来不是"还没好"，是"没人管"。
const MIN_ENTRIES = 2;

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = match[1];
  const pick = (key) => fm.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'))?.[1];
  return {
    title: pick('title')?.replace(/^["']|["']$/g, ''),
    pubDate: pick('pubDate'),
    draft: /^draft:\s*true\s*$/m.test(fm),
  };
}

async function collect(month) {
  const contentRoot = path.join(projectRoot, 'src/content');
  const byAlbum = {};
  for (const collection of COLLECTIONS) {
    const dir = path.join(contentRoot, collection);
    let files = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
    } catch {
      // 目录不存在就当这一本没内容
    }
    const entries = [];
    for (const file of files) {
      const raw = await readFile(path.join(dir, file), 'utf8');
      const { title, pubDate, draft } = parseFrontmatter(raw);
      if (draft || !pubDate) continue;
      if (!pubDate.startsWith(month)) continue;
      entries.push({ id: `${collection}/${file.replace(/\.md$/, '')}`, title, pubDate });
    }
    entries.sort((a, b) => a.pubDate.localeCompare(b.pubDate));
    byAlbum[collection] = entries;
  }
  return byAlbum;
}

const month = process.argv[2] ?? new Date().toISOString().slice(0, 7);
if (!/^\d{4}-\d{2}$/.test(month)) {
  console.error(`月份格式应为 YYYY-MM，收到：${month}`);
  process.exitCode = 1;
} else {
  const byAlbum = await collect(month);
  console.log(`\n${month} 期\n`);

  const publish = [];
  const skip = [];
  for (const collection of COLLECTIONS) {
    const entries = byAlbum[collection];
    const head = `${collection.padEnd(8)} ${LABELS[collection]}`;
    if (entries.length < MIN_ENTRIES) {
      skip.push(collection);
      console.log(`  ✗ ${head}  ${entries.length} 篇 —— 少于 ${MIN_ENTRIES}，跳过`);
    } else {
      publish.push(collection);
      console.log(`  ✓ ${head}  ${entries.length} 篇`);
    }
    for (const entry of entries) {
      console.log(`      ${entry.pubDate}  ${entry.title}`);
    }
  }

  console.log(
    `\n结论：出 ${publish.length} 本${publish.length ? `（${publish.join('、')}）` : ''}，` +
      `跳过 ${skip.length} 本${skip.length ? `（${skip.join('、')}）` : ''}\n`,
  );
  if (publish.length === 0) {
    console.log('这个月没有任何一本够出。不要为了有东西发而出空期。\n');
  }
}
