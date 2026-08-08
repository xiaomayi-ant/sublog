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

async function readBuiltJavascript() {
  const assetsRoot = path.join(distRoot, '_astro');
  const files = await readdir(assetsRoot);
  const scripts = files.filter((file) => file.endsWith('.js'));
  return (await Promise.all(scripts.map((file) => readFile(path.join(assetsRoot, file), 'utf8')))).join(
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

// About 锁的是职责，不是措辞。文案会一直改 —— 把某一句话钉进契约，
// 结果是每改一次文案就红一次，然后大家开始改契约去迁就页面，契约就废了。
// 这一页真正要守住的是四件事：标题不是"About"这个归档标签、
// 有一条自动更新的近况、有通往两种读法的入口、有一个站外出口。
test('About and 404 are complete user-facing pages', async () => {
  const about = await readRoute('/about');
  assert.doesNotMatch(about, /Phase 5|待建|placeholder/i);

  // 标题必须是内容，不能退回归档标签 —— 那样这一页开口就在自报文件名
  const h1 = about.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
  assert.ok(h1 && h1.length > 4, 'About 应当有一句真正的标题');
  assert.notEqual(h1, 'About', 'H1 不能是「About」这个归档标签');

  // 近况自动取自最新文章：它回答"这个站还活着吗"，而这件事只有这一页会被问到。
  // 断言它链到真实文章，而不是断言标题内容 —— 后者每发一篇就会变。
  assert.match(about, /href="\/blog\/[a-z]+\/[a-z0-9-]+"/, 'About 应当链到真实文章');
  assert.match(about, /href="\/blog"/, 'About 应当有回到 Blog 的出口');

  // 两种读法的入口 —— About 承担导航，这是它存在的主要理由之一
  assert.match(about, /href="\/graph"/, 'About 应当能去图谱');
  assert.match(about, /href="\/albums"/, 'About 应当能去相册');

  // 站上唯一的站外去处落在这里；外链要带 rel
  assert.match(about, /href="https:\/\/github\.com\/xiaomayi-ant"[\s\S]{0,80}rel="noreferrer"/);

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

test('the home uses one persistent mathematical river instead of a framed artwork', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();
  const javascript = await readBuiltJavascript();

  assert.match(home, /data-home-river="locked-preset"/);
  assert.match(home, /data-river-entry="present-from-first-frame"/);
  assert.match(home, /data-river-scope="hero-only"/);
  assert.match(
    home,
    /<canvas id="home-river-canvas" class="home-river-canvas" aria-hidden="true"/,
  );
  assert.match(home, /data-bend="1\.3"/);
  assert.match(home, /data-width="1\.26"/);
  assert.match(home, /data-flow="1"/);
  assert.match(home, /data-layers="8"/);
  assert.match(home, /data-surface="unified-page-bg"/);
  // 首屏不再铺暖光，左上角那层黄色蒙版已移除，底色就是全站底色
  assert.match(home, /data-color-focus="clear-water"/);
  assert.doesNotMatch(home, /home-river-sun/);
  // 守的是"河流图层里没有暖色蒙版"，不是"整份 CSS 里不许出现这个色值" ——
  // 后者会把别处合法的金色浮光一起误伤
  for (const [rule] of css.matchAll(/\.home-river-[a-z-]+\[[^{]*\{[^}]*\}/g)) {
    assert.doesNotMatch(rule, /245,\s*200,\s*91|#f5c85b|207,\s*96/, `warm wash back in: ${rule.slice(0, 60)}`);
  }
  assert.match(home, /data-motion-rhythm="material-flow-scroll-bend"/);
  assert.match(css, /--color-bg:#fff/);
  assert.match(css, /\.home-river-field[^}]*position:absolute/);
  // 河不再被钉在视口顶部：它待在首屏的盒子里，随首屏一起滚走
  assert.doesNotMatch(css, /\.home-river-viewport[^}]*position:sticky/);
  // 河仍然满幅出血：首屏不能裁它，否则会被剪到内容宽
  assert.match(css, /\.home-river-field[^}]*calc\(50% - 50vw\)/);
  assert.doesNotMatch(css, /\.shore-hero[^}]*overflow:hidden/);
  assert.match(css, /\.home-river-canvas[^}]*width:100%/);
  assert.match(css, /\.home-river-canvas[^}]*height:100%/);
  assert.match(javascript, /createRiverRenderer/);
  assert.match(home, /Be water,/);
  assert.doesNotMatch(home, /时间如水/);
  assert.doesNotMatch(home, /Water study · 001|Light \/ tide \/ time/i);
  assert.doesNotMatch(
    home,
    /shore-artwork|hero-watercolor-shore-v1|river-controls|data-river-preset|data-river-entry="animated"/,
  );
  assert.doesNotMatch(css, /\.home-river-canvas[^}]*animation:/);
});

test('the home hero uses a measured editorial typography hierarchy', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  assert.match(home, /data-type-system="editorial-serif-sans"/);
  assert.doesNotMatch(home, /SUMOER — RESEARCH & BUILD \/ 2026|class="hero-kicker"/);
  assert.match(home, /data-stream="typewriter"/);
  assert.match(home, /class="type type--zh"[^>]*>在智力方面，人类和AI的区别是什么？<\/span>/);
  assert.match(
    home,
    /class="type type--en"[^>]*>In terms of intelligence, what separates a human from an AI\?<\/span>/,
  );
  assert.match(home, /class="type type--zh"[^>]*>AI目前的边界是什么？<\/span>/);
  assert.match(home, /class="type type--en"[^>]*>Where are the boundaries of AI today\?<\/span>/);
  assert.doesNotMatch(home, /class="hero-description"/);
  assert.match(home, /data-intro-motion="per-load-word-reveal"/);
  assert.match(home, /aria-label="Be water, my friend\."/);
  assert.match(home, /class="intro-be"[^>]*>Be<\/span>/);
  assert.match(
    home,
    /class="intro-be"[^>]*>Be<\/span><span class="intro-space"[^>]*>&nbsp;<\/span><span class="intro-water"[^>]*><span class="intro-water-fill"[^>]*>water<\/span><\/span>/,
  );
  assert.match(home, /class="intro-line intro-line--friend"/);
  assert.match(home, /class="intro-be" style="--word-delay: 120ms"/);
  assert.match(home, /class="intro-water" style="--word-delay: 620ms"/);
  assert.match(home, /style="--letter-delay: 1180ms"[^>]*>m<\/span>/);
  assert.match(home, /style="--letter-delay: 2380ms"[^>]*>\.<\/span>/);
  assert.match(css, /@keyframes type-in/);

  // 命令行读感只保留三样：等宽、方块光标、逐行输出；无提示符、无背景板
  assert.match(home, /data-stream-form="plain-lines"/);
  assert.doesNotMatch(home, /class="prompt"|❯|class="terminal"/);
  // 问句退出命令行方言：中文无衬线、英文编辑体斜体，光标是细线不是方块
  assert.match(css, /\.type--zh[^}]*font-family:var\(--font-sans\)/);
  assert.match(css, /\.type--en[^}]*font-family:var\(--font-display\)/);
  assert.match(css, /\.type--en[^}]*font-style:italic/);
  assert.doesNotMatch(css, /\.hero-questions[^}]*font-family:var\(--font-mono\)/);
  assert.match(css, /\.type[^}]*border-right:2px/);
  // 左边缘与标题对齐；压缩器会把 align-self + justify-self 合成 place-self
  assert.match(css, /\.hero-questions[^}]*(?:justify-self:start|place-self:start(?:[;}]| start))/);
  assert.match(css, /font-size:clamp\(4\.25rem,6\.62vw,5\.5rem\)/);
  assert.match(css, /letter-spacing:-\.03em/);
  assert.match(home, /data-water-color="liquid-glass"/);
  assert.match(home, /data-friend-color="ink"/);
  // 标题只保留两个色彩声部：墨 + 玻璃。纯黑是全站唯一无色相、且比墨更深的颜色，
  // 深蓝虽在轴上但更饱和 —— 两者都不该再出现在标题里。
  assert.match(css, /\.intro-be[^}]*color:var\(--color-ink\)/);
  assert.doesNotMatch(css, /#0a0a0a|--color-black/);
  assert.match(css, /\.intro-water-fill[^}]*background-clip:text/);
  assert.match(css, /\.intro-water-fill[^}]*animation:[^;}]*water-surface/);
  assert.match(css, /\.intro-water-fill[^}]*:before[^}]*animation:[^;}]*water-flow/);
  assert.match(css, /\.intro-line--friend[^}]*color:(?:#4c3630db|rgba\(76,54,48,\.86\))/);
  // 减重：不再是整页最重的元素
  assert.doesNotMatch(css, /\.intro-line--friend[^}]*font-weight:700/);
  assert.match(css, /\.intro-line--friend[^}]*font-weight:500/);
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
  assert.doesNotMatch(home, /Currently thinking about|Made by Sumoer|class="site-footer"/);
});

// 主页的结构：气质（引言 + 问句）→ 人（一句身份）→ 作品（裸列表）→ 收尾。
// 大号入口卡片已移除 —— 顶部导航已经有同样的四个目的地，卡片是伪装成内容的导航。
test('the home is an identity statement followed by a bare writing list', async () => {
  const home = await readRoute('/');
  const css = await readBuiltCss();

  // 裸列表：只有日期和标题，没有小标题／编号／分类
  const list = home.match(/<section class="recent"[\s\S]*?<\/section>/)?.[0];
  assert.ok(list, 'home should render the recent-writing list');
  assert.match(list, /data-home-index="recent-writing"/);
  assert.equal((list.match(/class="row"/g) ?? []).length, 3);
  assert.match(list, /class="row-date meta"[^>]*>\d{4}\.\d{2}\.\d{2}</);
  assert.doesNotMatch(list, /<h2|entry-num|全部 \d+ 篇/);

  // 入口卡片不该再出现
  assert.doesNotMatch(home, /class="entry"|class="entry-list"|entry-title/);
  assert.doesNotMatch(home, />Github<\/span>|>Blog<\/span>/);

  // 身份句已从首屏移到页脚，首屏只剩气质与问题
  assert.doesNotMatch(home, /hero-identity/);

  // 收尾：一行落款 + 最底的工具行。About / More / Contact 三栏已撤 ——
  // 六格里四格没有去处，一格与主导航重复，只有外部 GitHub 是独有的，已挪进 /about。
  const foot = home.match(/<footer class="site-foot[\s\S]*?<\/footer>/)?.[0];
  assert.ok(foot, 'home should render the footer');
  assert.match(foot, /data-footer="signature"/);
  assert.match(foot, /class="foot-name"[^>]*>sumoer</);
  assert.match(foot, /class="foot-tagline"[^>]*>Vision: world peace</);
  assert.match(foot, /href="\/rss\.xml"[^>]*>RSS</);

  // 三栏不许回来，占位条目更不许 —— 空占位摆久了读起来不是"还没好"，是"没人管"
  assert.doesNotMatch(foot, /foot-nav|foot-col|foot-head|foot-pending/, 'the column block must stay gone');
  for (const label of ['About this site', 'About this project', 'Analytics', 'Monitor', 'Send email']) {
    assert.doesNotMatch(foot, new RegExp(label), `footer must not carry "${label}" again`);
  }

  // 页脚只说一种话：不借 .meta 的等宽体 —— 衬线名字 + 等宽小字 + 无衬线条目
  // 是三款字体挤在同一块收尾区域里，那正是它曾经看起来乱的原因
  assert.doesNotMatch(foot, /class="[^"]*\bmeta\b/, 'the footer must not fall back to the mono meta voice');

  // 落款与工具行之间只有一条发丝线，没有别的结构
  const footCss = await readFile(new URL('../src/components/SiteFooter.astro', import.meta.url), 'utf8');
  assert.match(footCss, /\.foot-utility\s*{[^}]*border-top:\s*1px solid var\(--color-line\)/);
  assert.doesNotMatch(footCss, /\.foot-nav|\.foot-col|\.foot-pending/);

  // 首页钉成标准两屏 —— 曾经只是"在 831px 视口下恰好等于 2.00 页"的巧合：
  // 视口一变（700px → 2.4 屏，1000px → 1.6 屏）就散了。三条一起才钉得住。
  const homeCss = await readBuiltCss();
  assert.match(homeCss, /body:has\(\.home-flow\)\{[^}]*min-height:200svh/);
  // 首屏不能再被固定 rem 封顶，否则屏幕一高，第二屏就从下边缘探头进来。
  // 只管基础规则；窄屏的 media query 里仍然允许封顶 —— 手机上一屏装不下首屏是应该的。
  assert.match(homeCss, /\.shore-hero[^{]*\{[^}]*min-height:calc\(100svh - 5\.25rem\)/);
  const heroSrc = await readFile(new URL('../src/components/ArtRiverHero.astro', import.meta.url), 'utf8');
  const heroBaseRule = heroSrc.match(/\n {2}\.shore-hero \{([\s\S]*?)\n {2}\}/)?.[1];
  assert.ok(heroBaseRule, 'ArtRiverHero should keep a base .shore-hero rule');
  assert.doesNotMatch(heroBaseRule, /min-height:\s*min\(/, 'the hero must not be capped below one screen');
  // 第二屏靠 flex 吃余量，因此不需要知道页脚有多高
  assert.match(homeCss, /\.home-tail[^{]*\{[^}]*flex:1 0 auto/);

  // 履历轴：年份等距，右端不收口，一个线稿小人停在今天
  const life = home.match(/<section class="life"[\s\S]*?<\/section>/)?.[0];
  assert.ok(life, 'home should render the life timeline');
  assert.match(life, /data-timeline="year-axis-walk"/);
  assert.match(life, /class="life-walker"/);
  assert.match(life, /<svg viewBox="0 0 26 30"/);
  // 串珠成链：每一年一颗珠子落在线上
  assert.equal((life.match(/class="year-bead"/g) ?? []).length, 10);
  // now 的位置由 todayPosition() 算出，随真实时间自己往右挪
  assert.match(life, /class="life-now"/);
  assert.match(life, /class="now-label meta"[^>]*>now</);
  assert.match(life, /--now: \d+\.\d+%/);
  // 刻度跟着脚步长出来：每个刻度带自己的显现时刻，且沿轴递增
  const reveals = [...life.matchAll(/--reveal: (\d+)ms/g)].map((match) => Number(match[1]));
  assert.equal(reveals.length, 10);
  assert.equal(reveals[0], 0);
  for (let index = 1; index < reveals.length; index += 1) {
    assert.ok(reveals[index] > reveals[index - 1], `reveal delays must rise: ${reveals.join(', ')}`);
  }
  assert.ok(reveals.at(-1) < 9600, 'the last year must appear before he stops');
  assert.match(css, /data-walk=armed\][^}]*opacity:0/);
  assert.match(css, /animation:[^;}]*tick-in/);

  // 履历：七条里程碑并进年份刻度，有事的那一年珠子变实心，标签排在轴下方
  const CV = ['Office', 'MySQL', 'BI', 'Random Forest', 'CNN', 'GPT-3\\.5', 'ChatBot', 'LangGraph', 'Multi-Agent', 'Harness'];
  for (const line of CV) {
    assert.match(life, new RegExp(`class="mark-line"[^>]*>${line}<`), `timeline should carry "${line}"`);
  }
  assert.equal((life.match(/class="mark-label"/g) ?? []).length, CV.length);
  // 冷=时间与水，暖=走在其中的人：履历的标记归暖赭，河流与悬停的光保持冷
  assert.match(css, /--color-ember:#a8632c/);
  // 珠子是空心的：环，不是实心点
  // 珠子与浮光同色：同一种光。金太浅，环要加粗才立得住
  assert.match(css, /--color-glint:#e8a63c/);
  assert.match(css, /\.has-mark[^}]*\.year-bead[^}]*inset 0 0 0 2\.2px var\(--color-glint\)/);
  assert.match(css, /\.has-mark[^}]*\.year-bead[^}]*background:var\(--color-bg\)/);
  assert.match(css, /\.now-bead[^}]*var\(--color-ember\)/);
  assert.doesNotMatch(css, /\.now-bead[^}]*var\(--color-river\)/);

  // 斜杠即换行：每段各占一行，长标签才排得下同一行基线。
  // 当前八条都是单词，机制仍然在位 —— 标签里不该留下裸的斜杠。
  assert.match(css, /\.mark-line[^}]*display:block/);
  // 履历标签用人文主义无衬线，和标题的衬线、日期的等宽都区分开
  // 真斜体而不是合成斜体，字重 400 —— 有笔意但不抢戏
  assert.match(css, /--font-label:"Gill Sans"/);
  assert.match(css, /\.mark-label[^}]*font-style:italic/);
  assert.doesNotMatch(css, /\.mark-label[^}]*font-weight:800/);
  assert.match(css, /\.mark-label[^}]*font-family:var\(--font-label\)/);
  assert.doesNotMatch(life, /class="mark-line"[^>]*>[^<]*\//);
  // 轴线两端都出头：左边越过 2017，右边越过今天
  assert.match(css, /\.life-line[^}]*left:-1\.75rem/);
  assert.match(css, /\.life-line[^}]*transparent 0/);
  assert.match(css, /\.year-bead[^}]*border-radius:50%/);
  // 首尾刻度不被裁：轴留出左右内边距，位置对着内层 track 解析
  assert.match(css, /\.life-axis[^}]*padding-inline:1\.75rem/);
  assert.match(css, /\.life-track[^}]*position:relative/);
  for (const year of [2017, 2020, 2026]) {
    assert.match(life, new RegExp(`>${year}<`), `axis should label ${year}`);
  }
  assert.match(css, /\.life-line[^}]*transparent 100%\)/);
  // 走一次就停，不循环
  assert.match(css, /animation:[^;}]*walk-across/);
  // 迈步次数必须和走完全程的时长对齐，否则腿会先于人停下
  // 行进一次就停在 now，但迈步 infinite —— 人停下、腿不停，表示还在往前走
  // 时长由 lib/timeline.ts 注入到行内样式，CSS 里不再各写一份
  assert.match(life, /--walk-span: 9600ms/);
  assert.match(life, /--walk-step: 480ms/);
  assert.match(css, /step-a var\(--walk-step\) steps\(1\) infinite/);
  assert.match(css, /walk-across var\(--walk-span\)[^;}]*both/);
  // 逗号也要排除：animation 简写里多条动画用逗号分隔，不然会跨条误匹配到 walk-bob 的 infinite
  assert.doesNotMatch(css, /walk-across[^;},]*infinite/);

  // 补上字号阶梯里 39px 与 17px 之间那一档
  assert.match(css, /\.row-title[^}]*font-size:1\.0625rem/);

  // 悬停时亮起来的是光不是墨：两端消隐的渐变 + 溢出边界的辉光，
  // 不允许退回实色的 --color-river 直线
  // 一小段金色浮光：短、细、两端消隐、带柔和的散射。
  // 不能用河流的青 —— 那是这一页的底色，下划线用它就成了背景的一部分。
  // 浮光要比最长的标题还长，否则起不到反馈作用
  assert.match(css, /\.row-title[^}]*:after[^}]*width:max\(20rem,100%\)/);
  assert.match(css, /\.row-title[^}]*:after[^}]*height:1px/);
  assert.match(css, /\.row-title[^}]*:after[^}]*box-shadow:0 0 6px #e8a63c/);
  assert.match(css, /\.row-title[^}]*:after[^}]*linear-gradient\(90deg,(?:#0000|transparent) 0%/);
  assert.doesNotMatch(css, /\.row-title[^}]*:after[^}]*4ab8ca/);
});

// 配色原则：河水独占颜色，文字退出色相竞争，只与它形成冷暖搭配。
// 墨曾经等于 --water-900（距河水仅 7°），那不是搭配，是融进去。
test('the river owns the colour and type only pairs with it', async () => {
  const css = await readBuiltCss();

  for (const token of [
    '--water-100:#c8f1ee',
    '--water-300:#84dcd9',
    '--water-500:#4ab8ca',
    '--water-700:#26788f',
    '--water-900:#13303a',
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${token}`);
  }

  assert.match(css, /--color-river:#1651be/);

  // 墨是暖中性，色相在河水对面；它不再派生自水的色阶
  assert.match(css, /--color-ink:#4c3630/);
  assert.doesNotMatch(css, /--color-ink:var\(--water-900\)/);

  // 纯原色蓝、纯黑、旧藏青、自造灰蓝都不该再出现在产物里
  assert.doesNotMatch(css, /#0000f2|#0000ff/i);
  assert.doesNotMatch(css, /#0a0a0a|--color-black/);
  assert.doesNotMatch(css, /#10233f|#173e46/i);
  assert.doesNotMatch(css, /#7fa8e0|#6e99d4/i);
  assert.doesNotMatch(css, /rgba\(23,62,70/);
});

// 落款只属于首页。它是站点身份的一次性出现 —— 每一页都重复一遍反而稀释它。
// 其余页面一律只留最底那条工具行（RSS + ©），页面结尾仍然是收住的，不是硬断的。
test('the signature belongs to the home page alone', async () => {
  const home = await readRoute('/');
  assert.match(home, /<footer class="site-foot/, 'home should end with the signature');
  assert.match(home, /class="foot-name"[^>]*>sumoer</, 'home should carry the name');
  assert.match(home, /class="foot-tagline"[^>]*>Vision: world peace</);

  for (const route of ['/blog', '/about', '/projects', '/404', '/graph', '/albums']) {
    const html = await readRoute(route);
    assert.doesNotMatch(html, /class="foot-name"/, `${route} must not repeat the signature`);
    assert.doesNotMatch(html, /Vision: world peace/, `${route} must not repeat the tagline`);
    // 但结尾仍要收住 —— 只是收在工具行上
    assert.match(html, /data-footer="minimal"/, `${route} should still end with the utility row`);
    assert.match(html, /href="\/rss\.xml"[^>]*>RSS</, `${route} keeps the RSS link`);
  }
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
