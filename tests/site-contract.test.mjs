import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

async function readRoute(route) {
  const relativePath =
    route === '/'
      ? 'index.html'
      : route === '/404'
        ? '404.html'
        : path.join(route.slice(1), 'index.html');
  return readFile(path.join(distRoot, relativePath), 'utf8');
}

async function readBuiltCss() {
  const assetsRoot = path.join(distRoot, '_astro');
  const files = await readdir(assetsRoot);
  const stylesheets = files.filter((file) => file.endsWith('.css'));
  return (await Promise.all(stylesheets.map((file) => readFile(path.join(assetsRoot, file), 'utf8')))).join(
    '\n',
  );
}

test('build emits the home, research, about, and projects entry routes', async () => {
  const routes = ['/', '/research', '/projects', '/about'];

  await Promise.all(
    routes.map(async (route) => {
      const html = await readRoute(route);
      assert.match(html, /<html lang="zh-CN">/);
      assert.match(html, /<title>.+ · Water<\/title>/);
    }),
  );
});

test('build emits every published research route and excludes drafts', async () => {
  const publishedRoutes = [
    '/research/essays/agent-action-boundaries',
    '/research/essays/local-first-tool-design',
    '/research/notes/evaluation-is-not-scoring',
    '/research/notes/llm-state-and-memory',
    '/research/experiments/aigc-image-triage',
  ];

  await Promise.all(publishedRoutes.map((route) => access(path.join(distRoot, route.slice(1), 'index.html'))));

  await assert.rejects(
    access(path.join(distRoot, 'research/notes/session-continuity-draft/index.html')),
    { code: 'ENOENT' },
  );
});

test('RSS is generated from the configured site URL', async () => {
  const rss = await readFile(path.join(distRoot, 'rss.xml'), 'utf8');
  assert.match(rss, /<rss/);
  assert.match(rss, /<item>/);
});

test('every published project has a complete case-study route', async () => {
  const projects = [
    {
      route: '/projects/openworker',
      title: 'OpenWorker',
      sections: ['为什么存在', '解决什么问题', '如何工作', '关键设计决策', '当前局限'],
    },
    {
      route: '/projects/riverline',
      title: 'Riverline',
      sections: ['为什么存在', '解决什么问题', '如何工作', '关键设计决策', '当前局限'],
    },
  ];

  for (const project of projects) {
    const html = await readRoute(project.route);
    assert.match(html, new RegExp(`<h1[^>]*>${project.title}</h1>`));
    assert.match(html, /返回项目/);

    for (const section of project.sections) {
      assert.ok(html.includes(section), `${project.route} should include "${section}"`);
    }
  }

  await assert.rejects(
    access(path.join(distRoot, 'projects/secret-draft/index.html')),
    { code: 'ENOENT' },
  );
});

test('published output contains no example.com placeholders', async () => {
  const routes = ['/', '/projects', '/projects/openworker', '/projects/riverline', '/about'];
  const html = (await Promise.all(routes.map(readRoute))).join('\n');

  assert.doesNotMatch(html, /example\.com/);
});

test('every public HTML page exposes canonical and social metadata', async () => {
  const routes = [
    '/',
    '/research',
    '/projects',
    '/about',
    '/404',
    '/projects/openworker',
    '/research/essays/agent-action-boundaries',
  ];

  for (const route of routes) {
    const html = await readRoute(route);
    assert.match(html, /<link rel="canonical" href="https:\/\/water\.localhost\/[^"]*">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/water\.localhost\/[^"]*">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/water\.localhost\/og-default\.svg">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<link rel="alternate" type="application\/rss\+xml"/);
  }
});

test('About and 404 are complete user-facing pages', async () => {
  const about = await readRoute('/about');
  assert.match(about, /个人研究与构建空间/);
  assert.match(about, /Be water, my friend\./);
  assert.doesNotMatch(about, /Phase 5|待建|placeholder/i);

  const notFound = await readRoute('/404');
  assert.match(notFound, /没有抵达这里/);
  assert.match(notFound, /href="\/"/);
  assert.match(notFound, /href="\/research"/);
  assert.match(notFound, /href="\/projects"/);
});

test('sitemap and robots expose public routes and exclude drafts', async () => {
  const sitemap = await readFile(path.join(distRoot, 'sitemap.xml'), 'utf8');
  const robots = await readFile(path.join(distRoot, 'robots.txt'), 'utf8');

  for (const route of [
    '/',
    '/research',
    '/projects/openworker',
    '/research/essays/agent-action-boundaries',
  ]) {
    assert.ok(sitemap.includes(`https://water.localhost${route}`));
  }

  assert.doesNotMatch(sitemap, /secret-draft|session-continuity-draft|\/404/);
  assert.match(robots, /Sitemap: https:\/\/water\.localhost\/sitemap\.xml/);
});

test('the shared layout provides keyboard navigation affordances', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  assert.match(home, /class="skip-link" href="#content"/);
  assert.match(home, /<main id="content"/);
  assert.match(css, /:focus-visible/);
});

test('the home hero renders an accessible left-to-right art river without legacy effects', async () => {
  const home = await readRoute('/');

  assert.match(
    home,
    /<canvas id="art-river" aria-hidden="true" data-flow-direction="left-to-right"[^>]*><\/canvas>/,
  );
  assert.match(home, /时间如水/);
  assert.doesNotMatch(home, /id="river"|id="star-field"/);
});
