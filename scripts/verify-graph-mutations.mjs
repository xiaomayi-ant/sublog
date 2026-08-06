// verify-graph-mutations — 给 graph-contract 的契约做变异验证：
// 往构建产物里注入故意的回归（文章页拖回完整页脚、/graph 路由丢失），
// 契约必须全部抓住；有漏网的就说明断言本身不够硬。
//
// 前四个变异不依赖图谱数据，任何状态下都跑；后面几个针对「有数据」那一支，
// 只在 data/graph.json 存在时注入 —— 没产物的克隆上那些契约本来就不该断言什么。
import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      // 索引页被降级成精简页脚 = 站点签名丢了
      name: 'index-page-loses-signature',
      apply: async (distDir) => {
        const page = path.join(distDir, 'blog/index.html');
        const html = await readFile(page, 'utf8');
        await writeFile(
          page,
          html.replace('data-footer="signature"', 'data-footer="minimal"'),
        );
      },
    },
    {
      // /graph 路由消失 = 空态降级被打破了（它应该在任何数据状态下都能构建）
      name: 'missing-graph-route',
      apply: async (distDir) => {
        await rm(path.join(distDir, 'graph/index.html'));
      },
    },
    {
      // 导航里没有 Graph = /graph 退回成只能靠回链摸到的暗页
      name: 'graph-missing-from-nav',
      apply: async (distDir) => {
        const page = path.join(distDir, 'blog/index.html');
        const html = await readFile(page, 'utf8');
        // <li> 上带着 Astro 的 scoped CID 属性，别把标签写死成 <li>
        const mutated = html.replace(/<li[^>]*><a href="\/graph"[\s\S]*?<\/li>/, '');
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
