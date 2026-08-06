// graph-contract — 文章页沉浸化 + 知识图谱的构建契约。
// 页脚与路由断言不依赖 DB；图谱数据的断言按 data/graph.db 是否存在分两支，
// 两种状态下都必须能构建、且表现一致（有 DB 出图谱区，没 DB 干净降级）。
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

const ARTICLE_ROUTES = [
  '/blog/harness/agent-action-boundaries',
  '/blog/harness/local-first-tool-design',
  '/blog/eval/evaluation-is-not-scoring',
  '/blog/eval/aigc-image-triage',
  '/blog/llm/llm-state-and-memory',
];

const INDEX_ROUTES = ['/', '/blog', '/about', '/projects', '/404'];

async function readRoute(route) {
  const relativePath =
    route === '/'
      ? 'index.html'
      : route === '/404'
        ? '404.html'
        : path.join(route.slice(1), 'index.html');
  return readFile(path.join(distRoot, relativePath), 'utf8');
}

async function pathExists(relative) {
  try {
    await access(path.join(distRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function graphDbExists() {
  try {
    await access(path.join(projectRoot, 'data', 'graph.db'));
    return true;
  } catch {
    return false;
  }
}

// 文章页是沉浸的：完整的三栏落款只属于索引页，文章页只留一条工具行
test('article pages end with the minimal footer, index pages keep the full signature', async () => {
  for (const route of ARTICLE_ROUTES) {
    const html = await readRoute(route);
    assert.doesNotMatch(
      html,
      /data-footer="about-more-contact"/,
      `${route} must not carry the full footer`,
    );
    assert.match(html, /data-footer="minimal"/, `${route} should end with the minimal footer`);
    assert.match(html, /href="\/rss\.xml"[^>]*>RSS</, `${route} minimal footer keeps the RSS link`);
  }

  for (const route of INDEX_ROUTES) {
    const html = await readRoute(route);
    assert.match(html, /data-footer="about-more-contact"/, `${route} must keep the full footer`);
    assert.doesNotMatch(html, /data-footer="minimal"/, `${route} must not degrade to minimal`);
  }
});

// /graph 永远存在：没有图谱数据时它也是一页（空态），不是一个 404
test('the /graph route always builds, with or without graph data', async () => {
  const html = await readRoute('/graph');
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>图谱 · Water<\/title>/);
  assert.match(html, /<main id="content"/);
});

test('graph data renders when the db exists, degrades cleanly when it does not', async () => {
  const hasDb = await graphDbExists();
  const article = await readRoute('/blog/llm/llm-state-and-memory');

  if (hasDb) {
    // 有库：文章页带图谱收尾区，概念聚合路由至少有一个
    assert.match(article, /data-article-relations/, 'article page should carry the relations block');
    assert.ok(
      await pathExists('blog/concepts'),
      'expected at least one /blog/concepts/* route',
    );
    const concepts = await readdir(path.join(distRoot, 'blog/concepts'));
    assert.ok(concepts.length > 0, 'expected at least one concept route');

    // 图谱页内联了图数据，概念链接指向真实存在的路由
    const graph = await readRoute('/graph');
    assert.match(graph, /data-concept-graph/);
    assert.match(graph, /data-graph-page/);
  } else {
    // 无库：整块不渲染，概念路由不生成，图谱页是空态但不报错
    assert.doesNotMatch(article, /data-article-relations/);
    assert.equal(await pathExists('blog/concepts'), false);
    const graph = await readRoute('/graph');
    assert.doesNotMatch(graph, /data-graph-page/);
    assert.match(graph, /graph:extract/, 'empty state should point at the extract command');
  }
});
