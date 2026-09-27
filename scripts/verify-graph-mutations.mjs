// verify-graph-mutations — 给 graph-contract 的契约做变异验证：
// 往构建产物里注入故意的回归（文章页拖回完整页脚、老 /graph 路由死灰复燃），
// 契约必须全部抓住；有漏网的就说明断言本身不够硬。
//
// 独立的 /graph 页已下线，概念图现在唯一的渲染位置是文章页底部的 relations
// 区块——涉及画布的变异因此都挪进了「有数据」那一支，只在 data/graph.json
// 存在时注入；前四个不依赖图谱数据，任何状态下都跑。
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceDist = path.join(projectRoot, 'dist');
const contractTest = path.join(projectRoot, 'tests/graph-contract.test.mjs');

async function hasGraphData() {
  try {
    await access(path.join(projectRoot, 'data', 'graph.json'));
    return true;
  } catch {
    return false;
  }
}

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

const mutationRoot = await mkdtemp(path.join(tmpdir(), 'water-graph-mutations-'));

try {
  const control = await makeCopy(mutationRoot, 'control');
  const controlCode = await runContract(control);
  if (controlCode !== 0) {
    throw new Error('Positive control failed: the unmodified production build does not pass its graph contract.');
  }

  const article = 'blog/llm/llm-state-and-memory/index.html';

  const mutations = [
    {
      // 文章页拖回完整落款 = 沉浸化失效
      name: 'article-page-full-footer-back',
      apply: async (distDir) => {
        const page = path.join(distDir, article);
        const html = await readFile(page, 'utf8');
        await writeFile(page, html.replace('data-footer="minimal"', 'data-footer="signature"'));
      },
    },
    {
      // 文章页连精简收尾都没了 = 页面结尾裸奔
      name: 'article-page-footer-gone',
      apply: async (distDir) => {
        const page = path.join(distDir, article);
        const html = await readFile(page, 'utf8');
        await writeFile(page, html.replace('data-footer="minimal"', 'data-footer="none"'));
      },
    },
    {
      // 首页丢了落款 = 站点签名唯一的出现点没了
      name: 'home-loses-signature',
      apply: async (distDir) => {
        const page = path.join(distDir, 'index.html');
        const html = await readFile(page, 'utf8');
        const mutated = html.replace('data-footer="signature"', 'data-footer="minimal"');
        if (mutated === html) throw new Error('signature mutation did not apply — 选择器过期了');
        await writeFile(page, mutated);
      },
    },
    {
      // 落款跑回了别的页面 = 一次性的身份被摊薄成每页重复
      name: 'signature-leaks-to-other-pages',
      apply: async (distDir) => {
        const page = path.join(distDir, 'blog/index.html');
        const html = await readFile(page, 'utf8');
        const mutated = html.replace('data-footer="minimal"', 'data-footer="signature"');
        if (mutated === html) throw new Error('leak mutation did not apply — 选择器过期了');
        await writeFile(page, mutated);
      },
    },
    {
      // 独立的 /graph 路由死灰复燃 = 半迁移状态，老暗页又能被摸到
      // 构建产物里已经没有 graph/ 目录了，先建出来才能放文件进去
      name: 'graph-route-resurrected',
      apply: async (distDir) => {
        const dir = path.join(distDir, 'graph');
        await mkdir(dir, { recursive: true });
        await writeFile(
          path.join(dir, 'index.html'),
          '<!doctype html><html lang="zh-CN"><body>stale graph page</body></html>',
        );
      },
    },
    {
      // 导航里又长出了 Graph = 一个已经彻底下线的入口重新暴露给访客
      name: 'graph-reappears-in-nav',
      apply: async (distDir) => {
        const page = path.join(distDir, 'blog/index.html');
        const html = await readFile(page, 'utf8');
        const mutated = html.replace(
          /<\/nav>/,
          '<a href="/graph">Graph</a></nav>',
        );
        if (mutated === html) throw new Error('nav mutation did not apply — 选择器过期了');
        await writeFile(page, mutated);
      },
    },
  ];

  // 有产物时才成立的契约：图谱区渲染、概念链接不悬空
  if (await hasGraphData()) {
    mutations.push(
      {
        // 图谱收尾区没渲染出来 = 有数据却没接上文章页
        name: 'relations-block-dropped',
        apply: async (distDir) => {
          const page = path.join(distDir, article);
          const html = await readFile(page, 'utf8');
          await writeFile(page, html.replace('data-article-relations', 'data-nothing-here'));
        },
      },
      {
        // 概念链接指向不存在的路由 = slug 与实际产物脱节（斜杠类字符最容易触发）
        name: 'dangling-concept-link',
        apply: async (distDir) => {
          const page = path.join(distDir, article);
          const html = await readFile(page, 'utf8');
          await writeFile(
            page,
            html.replace('href="/blog/concepts/', 'href="/blog/concepts/nope-'),
          );
        },
      },
      {
        // 画布丢了 tabindex = 三种交互全是指针驱动的，键盘用户没有任何入口。
        // 画布现在只出现在文章页的 relations 区块里，不再是独立 /graph 页。
        name: 'graph-canvas-not-focusable',
        apply: async (distDir) => {
          const page = path.join(distDir, article);
          const html = await readFile(page, 'utf8');
          const mutated = html.replace(/(<canvas[^>]*?)\stabindex="0"/, '$1');
          if (mutated === html) throw new Error('canvas mutation did not apply — 选择器过期了');
          await writeFile(page, mutated);
        },
      },
    );
  }

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
    throw new Error(`Unexplained surviving graph contract mutations: ${survivors.join(', ')}`);
  }

  console.log(`graph mutation_changed: ${mutations.length} killed / 0 unexplained`);
} finally {
  await rm(mutationRoot, { recursive: true });
}
