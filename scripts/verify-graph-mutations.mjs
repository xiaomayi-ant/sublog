// verify-graph-mutations — 给 graph-contract 的契约做变异验证：
// 往构建产物里注入故意的回归（文章页拖回完整页脚、/graph 路由丢失），
// 契约必须全部抓住；有漏网的就说明断言本身不够硬。
// 变异只挑不依赖 data/graph.db 的契约，保证有没有库都能跑。
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceDist = path.join(projectRoot, 'dist');
const contractTest = path.join(projectRoot, 'tests/graph-contract.test.mjs');

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
        await writeFile(page, html.replace('data-footer="minimal"', 'data-footer="about-more-contact"'));
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
          html.replace('data-footer="about-more-contact"', 'data-footer="minimal"'),
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
    throw new Error(`Unexplained surviving graph contract mutations: ${survivors.join(', ')}`);
  }

  console.log('graph mutation_changed: 4 killed / 0 unexplained');
} finally {
  await rm(mutationRoot, { recursive: true });
}
