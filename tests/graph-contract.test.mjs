// graph-contract — 文章页沉浸化 + 知识图谱的构建契约。
// 页脚与路由断言不依赖图谱数据；数据相关的断言按 data/graph.json 是否存在分两支，
// 两种状态下都必须能构建、且表现一致（有产物出图谱区，没产物干净降级）。
//
// graph.json 是入库的，所以 CI 上跑的是「有数据」那一支 —— 降级那一支留给
// 还没跑过抽取的新克隆，以及万一产物被清掉的情况。
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

async function graphDataExists() {
  try {
    await access(path.join(projectRoot, 'data', 'graph.json'));
    return true;
  } catch {
    return false;
  }
}

// 文章页是沉浸的：署名落款只属于索引页，文章页只留最底那条工具行
test('article pages end with the minimal footer, index pages keep the full signature', async () => {
  for (const route of ARTICLE_ROUTES) {
    const html = await readRoute(route);
    assert.doesNotMatch(
      html,
      /data-footer="signature"/,
      `${route} must not carry the full footer`,
    );
    assert.match(html, /data-footer="minimal"/, `${route} should end with the minimal footer`);
    assert.match(html, /href="\/rss\.xml"[^>]*>RSS</, `${route} minimal footer keeps the RSS link`);
  }

  for (const route of INDEX_ROUTES) {
    const html = await readRoute(route);
    assert.match(html, /data-footer="signature"/, `${route} must keep the full footer`);
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

// /graph 是导航上的一项，不是只能靠概念页回链摸到的暗页
test('the primary nav offers Graph alongside the other English entries', async () => {
  for (const route of ['/', '/blog', '/graph']) {
    const html = await readRoute(route);
    const nav = html.match(/<nav aria-label="主导航"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${route} should render the primary nav`);
    assert.match(nav, />Graph</, `${route} nav should offer Graph`);
    assert.match(nav, /href="\/graph"/, `${route} nav should link to /graph`);
  }

  const graph = await readRoute('/graph');
  const nav = graph.match(/<nav aria-label="主导航"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.match(
    nav,
    /<a href="\/graph"[^>]*aria-current="page"/,
    '/graph should mark its own nav item current',
  );
});

// 图谱是浮在暖白底上的，不是装在盒子里的：力导向图形状不规则，
// 方框只会把周围的留白切成四条死角。
test('the concept graph carries no frame and speaks the warm palette', async () => {
  const source = await readFile(
    new URL('../src/components/ConceptGraph.astro', import.meta.url),
    'utf8',
  );
  const block = source.match(/\.concept-graph\s*{[^}]*}/)?.[0];
  assert.ok(block, 'the component should style .concept-graph');
  assert.doesNotMatch(block, /border/, 'the graph container must not draw a frame');

  // 颜色从 tokens 现取，不在组件里另抄十六进制；且这张图说的是暖色
  for (const token of ['--color-ember', '--color-glint', '--color-ink']) {
    assert.match(source, new RegExp(token), `the graph should read ${token} from tokens`);
  }
  assert.doesNotMatch(source, /--color-river/, 'the graph no longer uses the river blue');
  assert.doesNotMatch(source, /#1651be/i, 'no hard-coded river hex may survive');

  // 画布可聚焦 —— 三种交互全靠指针，键盘用户得有一条别的路进去
  const graph = await readRoute('/graph');
  assert.match(graph, /<canvas[^>]*tabindex="0"/, 'the canvas must be keyboard reachable');
  assert.match(graph, /<canvas[^>]*aria-label="[^"]+"/, 'the canvas needs an accessible name');
});

test('graph data renders when the artifact exists, degrades cleanly when it does not', async () => {
  const hasData = await graphDataExists();
  const article = await readRoute('/blog/llm/llm-state-and-memory');

  if (!hasData) {
    // 无产物：整块不渲染，概念路由不生成，图谱页是空态但不报错
    assert.doesNotMatch(article, /data-article-relations/);
    assert.equal(await pathExists('blog/concepts'), false);
    const graph = await readRoute('/graph');
    assert.doesNotMatch(graph, /data-graph-page/);
    assert.match(graph, /graph:extract/, 'empty state should point at the extract command');
    return;
  }

  // 有产物：文章页带图谱收尾区，概念聚合路由至少有一个
  assert.match(article, /data-article-relations/, 'article page should carry the relations block');
  assert.ok(await pathExists('blog/concepts'), 'expected at least one /blog/concepts/* route');
  const concepts = await readdir(path.join(distRoot, 'blog/concepts'));
  assert.ok(concepts.length > 0, 'expected at least one concept route');

  // 图谱页内联了图数据
  const graph = await readRoute('/graph');
  assert.match(graph, /data-concept-graph/);
  assert.match(graph, /data-graph-page/);
  assert.doesNotMatch(graph, /graph:extract/, 'a populated graph must not show the empty state');

  // 概念名来自 LLM，什么字符都可能混进来：每条概念链接都必须落到真实存在的产物上
  const hrefs = new Set(
    [...article.matchAll(/href="(\/blog\/concepts\/[^"]+)"/g)].map((match) => match[1]),
  );
  assert.ok(hrefs.size > 0, 'the relations block should link to concept pages');
  for (const href of hrefs) {
    const relative = path.join(decodeURIComponent(href).slice(1), 'index.html');
    assert.ok(await pathExists(relative), `concept link ${href} points at a missing route`);
  }
});
