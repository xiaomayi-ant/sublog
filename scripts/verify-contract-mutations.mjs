import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      name: 'missing-watercolor-artwork',
      apply: async (distDir) => {
        await rm(path.join(distDir, 'images/hero-watercolor-shore-v1.webp'));
      },
    },
    {
      name: 'hard-edge-watercolor-artwork',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-edge-treatment="organic-feathered"', 'data-edge-treatment="hard"'),
        );
      },
    },
    {
      name: 'missing-sunlight-focus',
      apply: async (distDir) => {
        const home = path.join(distDir, 'index.html');
        const html = await readFile(home, 'utf8');
        await writeFile(
          home,
          html.replace('data-color-focus="sunlight-diagonal"', 'data-color-focus="none"'),
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

  console.log('mutation_changed: 9 killed / 0 unexplained');
} finally {
  await rm(mutationRoot, { recursive: true });
}
