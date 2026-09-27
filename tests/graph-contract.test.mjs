// graph-contract — 文章页沉浸化 + 概念关联（relations 区块）的构建契约。
// 独立的 /graph 全站图谱页已下线；概念抽取管线和 ConceptGraph 组件没有跟着走 ——
// 它们现在唯一的调用处是文章页底部的 relations 区块，这份契约测的是那一半。
// 数据相关的断言按 data/graph.json 是否存在分两支，两种状态下都必须能构建、
// 且表现一致（有产物出关联区，没产物干净降级）。
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

// 落款只在首页；其余页面（含文章页）一律只留最底那条工具行。
const NON_HOME_ROUTES = ['/blog', '/about', '/projects', '/404'];

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

// 署名落款只属于首页；其余每一页都收在最底那条工具行上
test('only the home page carries the signature footer', async () => {
  const home = await readRoute('/');
  assert.match(home, /data-footer="signature"/, 'home should carry the signature footer');
  assert.doesNotMatch(home, /data-footer="minimal"/, 'home must not degrade to minimal');

  for (const route of [...ARTICLE_ROUTES, ...NON_HOME_ROUTES]) {
    const html = await readRoute(route);
    assert.doesNotMatch(html, /data-footer="signature"/, `${route} must not carry the signature`);
    assert.match(html, /data-footer="minimal"/, `${route} should end with the minimal footer`);
    assert.match(html, /href="\/rss\.xml"[^>]*>RSS</, `${route} minimal footer keeps the RSS link`);
  }
});

// 概念图不再有独立路由，也不该再出现在导航里 —— 老路径必须彻底消失，
// 避免半迁移状态（同一原则见 site-contract.test.mjs 里 albums 的那条）。
test('the standalone /graph route and nav entry are fully retired', async () => {
  await assert.rejects(access(path.join(distRoot, 'graph', 'index.html')), { code: 'ENOENT' });

  for (const route of ['/', '/blog']) {
    const html = await readRoute(route);
    const nav = html.match(/<nav aria-label="主导航"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${route} should render the primary nav`);
    assert.doesNotMatch(nav, />Graph</, `${route} nav should no longer offer Graph`);
    assert.doesNotMatch(nav, /href="\/graph"/, `${route} nav should no longer link to /graph`);
  }
});

// 图谱是浮在暖白底上的，不是装在盒子里的：力导向图形状不规则，
// 方框只会把周围的留白切成四条死角。锚点从独立的 /graph 页改到文章页的
// relations 区块 —— 那是这个组件现在唯一的渲染位置。
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

  // 画布可聚焦 —— 三种交互全靠指针，键盘用户得有一条别的路进去。
  // 只在有图数据时才断言：没有数据时 relations 区块整个不渲染。
  if (await graphDataExists()) {
    const article = await readRoute('/blog/llm/llm-state-and-memory');
    assert.match(article, /<canvas[^>]*tabindex="0"/, 'the canvas must be keyboard reachable');
    assert.match(article, /<canvas[^>]*aria-label="[^"]+"/, 'the canvas needs an accessible name');
  }
});

test('graph data renders when the artifact exists, degrades cleanly when it does not', async () => {
  const hasData = await graphDataExists();
  const article = await readRoute('/blog/llm/llm-state-and-memory');

  if (!hasData) {
    // 无产物：整块不渲染，概念路由不生成
    assert.doesNotMatch(article, /data-article-relations/);
    assert.equal(await pathExists('blog/concepts'), false);
    return;
  }

  // 有产物：文章页带关联收尾区，概念聚合路由至少有一个
  assert.match(article, /data-article-relations/, 'article page should carry the relations block');
  assert.ok(await pathExists('blog/concepts'), 'expected at least one /blog/concepts/* route');
  const concepts = await readdir(path.join(distRoot, 'blog/concepts'));
  assert.ok(concepts.length > 0, 'expected at least one concept route');

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
