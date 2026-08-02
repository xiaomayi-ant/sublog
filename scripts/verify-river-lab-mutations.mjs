import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const contractTest = path.join(projectRoot, 'tests/river-lab-contract.test.mjs');
const mathTest = path.join(projectRoot, 'tests/river-math.test.mjs');
const riverMathSource = path.join(projectRoot, 'src/lib/riverMath.mjs');
const labHtml = path.join(distRoot, 'lab/river/index.html');
const assetsRoot = path.join(distRoot, '_astro');

function runContract() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', contractTest], {
      cwd: projectRoot,
      env: { ...process.env, SITE_DIST_DIR: distRoot },
      stdio: 'ignore',
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function findAsset(extension, marker) {
  const files = (await readdir(assetsRoot)).filter((file) => file.endsWith(extension));
  for (const file of files) {
    const target = path.join(assetsRoot, file);
    const source = await readFile(target, 'utf8');
    if (source.includes(marker)) return { target, source };
  }
  throw new Error(`Unable to find ${extension} asset containing ${marker}.`);
}

function runMathTest() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', mathTest], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'ignore',
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function mutateAndRestore(name, target, transform, runTest = runContract) {
  const original = await readFile(target, 'utf8');
  const mutated = transform(original);
  if (mutated === original) {
    throw new Error(`Mutation ${name} did not change the build output.`);
  }

  try {
    await writeFile(target, mutated);
    const code = await runTest();
    if (code === 0) return false;
    console.log(`killed: ${name}`);
    return true;
  } finally {
    await writeFile(target, original);
  }
}

const controlCode = await runContract();
if (controlCode !== 0) {
  throw new Error('Positive control failed: the river lab build does not pass its contract.');
}

const cssAsset = await findAsset('.css', '.river-stage');
const jsAsset = await findAsset('.js', 'requestAnimationFrame');
const mutations = [
  [
    'static-river-model',
    labHtml,
    (source) =>
      source.replace(
        'data-river-model="parametric-ribbon"',
        'data-river-model="static-image"',
      ),
  ],
  [
    'collapsed-scroll-stage',
    cssAsset.target,
    (source) => source.replace('height:360svh', 'height:100svh'),
  ],
  [
    'disabled-animation-loop',
    jsAsset.target,
    (source) => source.replaceAll('requestAnimationFrame', 'disabledAnimationFrame'),
  ],
  [
    'naive-ribbon-join',
    labHtml,
    (source) => source.replace('data-river-join="swept-union"', 'data-river-join="naive-polygon"'),
  ],
  [
    'murky-water-palette',
    labHtml,
    (source) => source.replace('data-river-palette="clear-water"', 'data-river-palette="gray-blue"'),
  ],
  [
    'disabled-curvature-limit',
    riverMathSource,
    (source) => source.replace('softCuspLimit(requestedHalfWidth, curvature)', 'requestedHalfWidth'),
    runMathTest,
  ],
  [
    // 切线丢掉 aspect = 回到在被压扁的单位方格里算法线，弯道内侧会重新折出尖点
    'unaspected-ribbon-tangent',
    riverMathSource,
    (source) =>
      source.replace('const deltaX = (after.x - before.x) * aspect;', 'const deltaX = after.x - before.x;'),
    runMathTest,
  ],
  [
    // 偏移不换算回归一化 x = 河宽随方向变化，屏幕上厚薄不均
    'anisotropic-bank-offset',
    riverMathSource,
    (source) =>
      source.replace('const offsetX = (normal.x * halfWidth) / aspect;', 'const offsetX = normal.x * halfWidth;'),
    runMathTest,
  ],
];

const survivors = [];
for (const [name, target, transform, runTest] of mutations) {
  const killed = await mutateAndRestore(name, target, transform, runTest);
  if (!killed) survivors.push(name);
}

if (survivors.length > 0) {
  throw new Error(`Unexplained surviving river mutations: ${survivors.join(', ')}`);
}

console.log('river_mutation_changed: 6 killed / 0 unexplained');
