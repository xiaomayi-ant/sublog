import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceDist = path.join(projectRoot, 'dist');
const contractTest = path.join(projectRoot, 'tests/site-contract.test.mjs');

function runContract(distDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', contractTest], {
      cwd: projectRoot,
      env: { ...process.env, SITE_DIST_DIR: distDir },
      stdio: 'ignore',
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function makeCopy(root, name) {
  const destination = path.join(root, name);
  await cp(sourceDist, destination, { recursive: true });
  return destination;
}

const mutationRoot = await mkdtemp(path.join(tmpdir(), 'water-contract-mutations-'));

try {
  const control = await makeCopy(mutationRoot, 'control');
  const controlCode = await runContract(control);
  if (controlCode !== 0) {
    throw new Error('Positive control failed: the unmodified production build does not pass its contract.');
  }

  const mutations = [
    {
      name: 'missing-project-route',
      apply: async (distDir) => {
        await rm(path.join(distDir, 'projects/openworker/index.html'));
      },
    },
    {
      name: 'broken-social-image-contract',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replaceAll('/og-default.svg', '/missing-social.svg'));
      },
    },
    {
      name: 'published-draft-route',
      apply: async (distDir) => {
        const draftDir = path.join(distDir, 'projects/secret-draft');
        await mkdir(draftDir, { recursive: true });
        await writeFile(path.join(draftDir, 'index.html'), '<h1>Draft leaked</h1>');
      },
    },
    {
      name: 'missing-home-river',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-home-river="locked-preset"', 'data-home-river="missing"'),
        );
      },
    },
    {
      name: 'animated-home-river-entry',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace(
            'data-river-entry="present-from-first-frame"',
            'data-river-entry="animated"',
          ),
        );
      },
    },
    {
      name: 'split-hero-background',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace('data-surface="unified-page-bg"', 'data-surface="pure-white"'));
      },
    },
    {
      name: 'solid-water-wordmark',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace('data-water-color="liquid-glass"', 'data-water-color="solid"'));
      },
    },
    {
      name: 'dropped-home-nav-item',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace(/<li[^>]*><a href="\/"[^>]*>Home<\/a><\/li>/, ''));
      },
    },
    {
      // 少一条 = 主页不再是完整的"最近写的"
      name: 'truncated-writing-list',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace(/<li[^>]*><a class="row"[\s\S]*?<\/li>/, ''));
      },
    },
    {
      name: 'static-question-stream',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace('data-stream="typewriter"', 'data-stream="none"'));
      },
    },
    {
      // 把墨拉回水的色相轴 = 文字重新和河水融成一体，冷暖搭配消失
      name: 'ink-collapsed-into-water',
      apply: async (distDir) => {
        const assetsRoot = path.join(distDir, '_astro');
        const files = await readdir(assetsRoot);
        const sheet = files.find((file) => file.endsWith('.css') && file.startsWith('Base'));
        const target = path.join(assetsRoot, sheet);
        const css = await readFile(target, 'utf8');
        await writeFile(target, css.replace('--color-ink:#4c3630', '--color-ink:var(--water-900)'));
      },
    },
    {
      // 把深水蓝换回纯原色蓝 = 配色重新脱离色相轴
      name: 'foreign-primary-blue',
      apply: async (distDir) => {
        const assetsRoot = path.join(distDir, '_astro');
        const files = await readdir(assetsRoot);
        const sheet = files.find((file) => file.endsWith('.css') && file.startsWith('Base'));
        const target = path.join(assetsRoot, sheet);
        const css = await readFile(target, 'utf8');
        await writeFile(target, css.replace('--color-river:#1651be', '--color-river:#0000f2'));
      },
    },
    {
      // 拆掉页脚的三块结构 = 页面重新失去收尾
      name: 'footer-loses-signature',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace('data-footer="signature"', 'data-footer="none"'));
      },
    },
    {
      name: 'plain-question-form',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace('data-stream-form="plain-lines"', 'data-stream-form="none"'));
      },
    },
    {
      // 履历标记退回深蓝 = 人和水又变成同一个色族，冷暖分工消失
      name: 'timeline-marks-back-to-cool',
      apply: async (distDir) => {
        const assetsRoot = path.join(distDir, '_astro');
        const files = await readdir(assetsRoot);
        const sheet = files.find((file) => file.endsWith('.css') && file.startsWith('index'));
        const target = path.join(assetsRoot, sheet);
        const css = await readFile(target, 'utf8');
        await writeFile(target, css.replaceAll('var(--color-ember)', 'var(--color-river)'));
      },
    },
    {
      // 抹掉辉光 = 下划线退回一条实色的线，"光"的读感消失
      name: 'flattened-hover-light',
      apply: async (distDir) => {
        const assetsRoot = path.join(distDir, '_astro');
        const files = await readdir(assetsRoot);
        const sheet = files.find((file) => file.endsWith('.css') && file.startsWith('index'));
        const target = path.join(assetsRoot, sheet);
        const css = await readFile(target, 'utf8');
        await writeFile(target, css.replace('box-shadow:0 0 6px #e8a63c57', 'box-shadow:none'));
      },
    },
    {
      // 掉一条履历 = 时间线不再是完整的那条路
      name: 'dropped-milestone',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace(/<span class="mark-label"[\s\S]*?<\/span><\/span>/, ''));
      },
    },
    {
      // 所有刻度同时显现 = 时间不再是被走出来的，退回布景
      name: 'ticks-appear-at-once',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(home, html.replace(/--reveal: \d+ms/g, '--reveal: 0ms'));
      },
    },
    {
      // 把河重新钉回视口顶部 = 它又会跟着滚动往下走
      name: 'sticky-river-again',
      apply: async (distDir) => {
        const assetsRoot = path.join(distDir, '_astro');
        const files = await readdir(assetsRoot);
        const sheet = files.find((file) => file.endsWith('.css') && file.startsWith('index'));
        const target = path.join(assetsRoot, sheet);
        const css = await readFile(target, 'utf8');
        await writeFile(target, css.replace('.home-river-viewport', '.home-river-viewport{position:sticky}.home-river-viewport'));
      },
    },
    {
      name: 'reintroduced-warm-wash',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-color-focus="clear-water"', 'data-color-focus="sunlight-diagonal"'),
        );
      },
    },
    {
      name: 'flattened-home-typography',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-type-system="editorial-serif-sans"', 'data-type-system="flat"'),
        );
      },
    },
    {
      name: 'missing-intro-motion',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-intro-motion="per-load-word-reveal"', 'data-intro-motion="none"'),
        );
      },
    },
    {
      name: 'reintroduced-home-dividers',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-page-flow="continuous-no-dividers"', 'data-page-flow="divided"'),
        );
      },
    },
    {
      name: 'unlocked-home-river-preset',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-home-river="locked-preset"', 'data-home-river="runtime-controls"'),
        );
      },
    },
  ];

  const survivors = [];

  for (const mutation of mutations) {
    const distDir = await makeCopy(mutationRoot, mutation.name);
    await mutation.apply(distDir);
    const code = await runContract(distDir);

    if (code === 0) {
      survivors.push(mutation.name);
    } else {
      console.log(`killed: ${mutation.name}`);
    }
  }

  if (survivors.length > 0) {
    throw new Error(`Unexplained surviving contract mutations: ${survivors.join(', ')}`);
  }

  console.log('mutation_changed: 24 killed / 0 unexplained');
} finally {
  await rm(mutationRoot, { recursive: true });
}
