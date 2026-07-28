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

test('build emits the home, blog, about, and projects entry routes', async () => {
  const routes = ['/', '/blog', '/projects', '/about'];

  await Promise.all(
    routes.map(async (route) => {
      const html = await readRoute(route);
      assert.match(html, /<html lang="zh-CN">/);
      assert.match(html, /<title>.+ · Water<\/title>/);
    }),
  );
});

test('build emits every published article route and excludes drafts', async () => {
  const publishedRoutes = [
    '/blog/harness/agent-action-boundaries',
    '/blog/harness/local-first-tool-design',
    '/blog/eval/evaluation-is-not-scoring',
    '/blog/eval/aigc-image-triage',
    '/blog/llm/llm-state-and-memory',
  ];

  await Promise.all(publishedRoutes.map((route) => access(path.join(distRoot, route.slice(1), 'index.html'))));

  await assert.rejects(
    access(path.join(distRoot, 'blog/notes/session-continuity-draft/index.html')),
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
    assert.match(html, /返回 Github/);

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
    '/blog',
    '/projects',
    '/about',
    '/404',
    '/projects/openworker',
    '/blog/harness/agent-action-boundaries',
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
  assert.match(notFound, /href="\/blog"/);
  assert.match(notFound, /href="\/projects"/);
});

test('sitemap and robots expose public routes and exclude drafts', async () => {
  const sitemap = await readFile(path.join(distRoot, 'sitemap.xml'), 'utf8');
  const robots = await readFile(path.join(distRoot, 'robots.txt'), 'utf8');

  for (const route of [
    '/',
    '/blog',
    '/projects/openworker',
    '/blog/harness/agent-action-boundaries',
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

test('the home hero preserves a portrait watercolor artwork beside the copy', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  assert.match(
    home,
    /<img class="shore-artwork" src="\/images\/hero-watercolor-shore-v1\.webp" alt="" width="1122" height="1402"[^>]*>/,
  );
  assert.match(home, /data-preserves-aspect="1122:1402"/);
  assert.match(home, /data-edge-treatment="organic-feathered"/);
  assert.match(home, /data-surface="unified-page-bg"/);
  assert.match(home, /data-color-focus="sunlight-diagonal"/);
  assert.match(home, /data-motion-rhythm="6s-breathe-3s-highlight"/);
  assert.match(css, /--color-bg:#fcfaf6/);
  assert.match(css, /animation:6s[^;}]*watercolor-breathe/);
  assert.match(css, /animation:3s[^;}]*highlight-pulse/);
  await access(path.join(distRoot, 'images/hero-watercolor-shore-v1.webp'));
  assert.match(home, /Be water,/);
  assert.doesNotMatch(home, /时间如水/);
  assert.doesNotMatch(home, /Water study · 001|Light \/ tide \/ time/i);
  assert.doesNotMatch(home, /data-art-form="watercolor-shore"|data-flow-direction="left-to-right"/);
});

test('the home hero uses a measured editorial typography hierarchy', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  assert.match(home, /data-type-system="editorial-serif-sans"/);
  assert.doesNotMatch(home, /SUMOER — RESEARCH & BUILD \/ 2026|class="hero-kicker"/);
  assert.match(home, /data-stream="typewriter"/);
  assert.match(home, /class="type type--zh"[^>]*>人类和AI的区别是什么？<\/span>/);
  assert.match(
    home,
    /class="type type--en"[^>]*>What is the difference between a human and an AI\?<\/span>/,
  );
  assert.match(home, /class="type type--zh"[^>]*>AI目前的边界是什么？<\/span>/);
  assert.match(home, /class="type type--en"[^>]*>Where are the boundaries of AI today\?<\/span>/);
  assert.doesNotMatch(home, /class="hero-description"/);
  assert.match(css, /\.type--en[^}]*font-style:italic/);
  assert.match(css, /@keyframes type-in/);
  assert.match(home, /data-intro-motion="per-load-word-reveal"/);
  assert.match(home, /aria-label="Be water, my friend\."/);
  assert.match(home, /class="intro-be"[^>]*>Be<\/span>/);
  assert.match(home, /class="intro-water"[^>]*><span class="intro-water-fill"[^>]*>water<\/span><\/span>/);
  assert.match(
    home,
    /class="intro-be"[^>]*>Be<\/span><span class="intro-space"[^>]*>&nbsp;<\/span><span class="intro-water"[^>]*><span class="intro-water-fill"[^>]*>water<\/span><\/span>/,
  );
  assert.match(home, /class="intro-line intro-line--friend"/);
  assert.match(home, /class="intro-be" style="--word-delay: 120ms"/);
  assert.match(home, /class="intro-water" style="--word-delay: 620ms"/);
  assert.match(home, /style="--letter-delay: 1180ms"[^>]*>m<\/span>/);
  assert.match(home, /style="--letter-delay: 1330ms"[^>]*>y<\/span>/);
  assert.match(home, /style="--letter-delay: 2380ms"[^>]*>\.<\/span>/);
  assert.doesNotMatch(
    home,
    /观察、研究，也构建。|阅读研究|查看项目|class="hero-links"|Water \/ Personal field notes|Observe · make · let flow/i,
  );
  assert.match(css, /font-size:clamp\(4\.25rem,6\.62vw,5\.5rem\)/);
  assert.match(css, /letter-spacing:-\.03em/);
  assert.match(home, /data-water-color="liquid-glass"/);
  assert.match(home, /data-friend-color="hermes-blue"/);
  assert.match(css, /\.intro-be[^}]*color:(?:#0a0a0a|var\(--color-black\))/);
  assert.match(css, /\.intro-water-fill[^}]*background-clip:text/);
  assert.match(css, /\.intro-water-fill[^}]*animation:[^;}]*water-surface/);
  assert.match(css, /\.intro-water-fill[^}]*:before[^}]*animation:[^;}]*water-flow/);
  assert.match(css, /\.intro-line--friend[^}]*color:#0000f2/);
  assert.match(css, /\.intro-line--friend[^}]*font-weight:700/);
  assert.match(css, /\.hero-questions[^}]*font-family:var\(--font-sans\)/);
  assert.match(css, /animation:[^;}]*intro-word-in/);
  assert.match(css, /animation:[^;}]*intro-letter-in/);
  assert.match(css, /@keyframes water-flow/);
  assert.doesNotMatch(css, /intro-word-out/);
  assert.doesNotMatch(home, /sessionStorage/);
});

test('the home reads as one continuous page without structural divider lines', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  assert.match(home, /data-page-flow="continuous-no-dividers"/);
  assert.match(css, /\.shore-hero[^}]*border:0/);
  assert.match(css, /\.entry[^}]*border:0/);
  assert.doesNotMatch(home, /Currently thinking about|Made by Sumoer|class="site-footer"/);
  assert.doesNotMatch(css, /\.entry[^}]*:after[^}]*scaleX/);
});

test('each home entry carries its own three-row list', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  for (const list of ['blog', 'github']) {
    const block = home.match(new RegExp(`<ul class="entry-list" data-entry-list="${list}"[\\s\\S]*?</ul>`))?.[0];
    assert.ok(block, `home should render the ${list} entry list`);
    assert.equal((block.match(/class="row(?: row--empty)?"/g) ?? []).length, 3);
    assert.match(block, /class="row-date meta"[^>]*>\d{4}\.\d{2}\.\d{2}<|class="row-date meta"[^>]*>—/);
  }

  // 列表字号必须小于入口标题，才读得出从属关系
  assert.match(css, /\.row-title[^}]*font-size:\.9375rem/);
  assert.match(css, /\.entry-num[^}]*color:#0000f2/);
  assert.doesNotMatch(home, /时间流 · STREAM/);
});

test('the primary nav is English-only, includes Home, and underlines the current section', async () => {
  const css = await readBuiltCss();
  const routes = ['/', '/blog', '/projects', '/about'];

  for (const route of routes) {
    const html = await readRoute(route);
    const nav = html.match(/<nav aria-label="主导航"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${route} should render the primary nav`);

    for (const label of ['Home', 'Blog', 'Github', 'About']) {
      assert.match(nav, new RegExp(`>${label}<`), `${route} nav should offer ${label}`);
    }

    assert.doesNotMatch(nav, /研究|项目|关于/, `${route} nav should carry no Chinese labels`);
    assert.match(nav, /href="\/"/, `${route} should link back to the home page`);

    const currentLinks = [...nav.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(currentLinks, [route], `${route} should mark exactly its own nav item current`);
  }

  // 老的 /research 路径必须彻底消失，避免半迁移状态
  const home = await readRoute('/');
  assert.doesNotMatch(home, /href="\/research/);

  // 选中态与 hover 共用同一条下划线
  assert.match(css, /nav\[[^\]]*\] a[^}]*:after[^}]*background:var\(--color-river\)/);
  assert.match(css, /aria-current=page\][^}]*:after[^}]*transform:scalex\(1\)/i);
  assert.match(css, /nav\[[^\]]*\] a[^}]*font-family:var\(--font-display\)/);
});
