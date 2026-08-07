import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

async function readAssets(extension) {
  const assetsRoot = path.join(distRoot, '_astro');
  const files = (await readdir(assetsRoot)).filter((file) => file.endsWith(extension));
  return (await Promise.all(files.map((file) => readFile(path.join(assetsRoot, file), 'utf8')))).join('\n');
}

// 河流自己那一份产物。断言动画时不能拿全部 JS 拼起来找 ——
// 站上现在不止一个脚本用 requestAnimationFrame（图谱也用），
// 拼起来的话河流的动画被整个删掉，断言依然能在别人的代码里找到那个词。
async function readRiverAsset() {
  const assetsRoot = path.join(distRoot, '_astro');
  const files = (await readdir(assetsRoot)).filter((file) => file.endsWith('.js'));
  const hits = [];
  for (const file of files) {
    const source = await readFile(path.join(assetsRoot, file), 'utf8');
    if (source.includes('createRiverRenderer')) hits.push(source);
  }
  assert.equal(hits.length, 1, 'expected exactly one built asset to own the river renderer');
  return hits[0];
}

test('the river lab publishes a self-contained parametric river scene', async () => {
  const html = await readFile(path.join(distRoot, 'lab/river/index.html'), 'utf8');

  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /data-river-model="parametric-ribbon"/);
  assert.match(html, /data-river-join="swept-union"/);
  assert.match(html, /data-river-offset="curvature-limited"/);
  assert.match(html, /data-river-palette="clear-water"/);
  assert.match(html, /data-scroll-stage="sticky-360svh"/);
  assert.match(html, /data-river-motion="scroll-plus-time"/);
  assert.match(html, /<canvas id="river-canvas"[^>]*role="img"/);
  assert.match(html, /aria-label="数学河流动态实验"/);
  assert.match(html, /C\(s,p\)/);
  assert.doesNotMatch(html, /https?:\/\/[^"]+\.(?:js|mjs)(?=["'])/);
});

test('the lab exposes the art-direction controls and three meaningful presets', async () => {
  const html = await readFile(path.join(distRoot, 'lab/river/index.html'), 'utf8');

  for (const name of ['bend', 'width', 'turbulence', 'layers', 'flow', 'cobalt']) {
    assert.match(html, new RegExp(`<input[^>]*name="${name}"`));
  }

  const preferredDefaults = {
    bend: '1.3',
    width: '1.26',
    turbulence: '0.48',
    layers: '8',
    flow: '1',
    cobalt: '0.30',
  };
  for (const [name, value] of Object.entries(preferredDefaults)) {
    assert.match(html, new RegExp(`<input[^>]*name="${name}"[^>]*value="${value}"`));
  }

  for (const preset of ['watercolor', 'silk', 'fibers']) {
    assert.match(html, new RegExp(`data-river-preset="${preset}"`));
  }

  assert.match(html, /data-river-reset/);
  assert.match(html, /aria-live="polite"/);
});

test('the scene is one white, sticky, multi-viewport composition', async () => {
  const css = await readAssets('.css');

  assert.match(css, /\.river-lab[^}]*background:#fff/);
  assert.match(css, /\.river-stage[^}]*height:360svh/);
  assert.match(css, /\.river-viewport[^}]*position:sticky/);
  assert.match(css, /\.river-viewport[^}]*top:0/);
  assert.match(css, /\.river-canvas[^}]*width:100%/);
  assert.match(css, /\.river-canvas[^}]*height:100%/);
});

test('the built lab animates with browser frames and respects reduced motion', async () => {
  // 帧循环、动效降级、DPR 都是渲染器自己的职责，断言必须落在它那一份产物上。
  // 拿全部 JS 拼起来找是不够的：站上不止一个脚本用这些 API（图谱也用），
  // 河流的动画整个删掉，断言依然能在别人的代码里命中。
  const river = await readRiverAsset();
  assert.match(river, /requestAnimationFrame/);
  assert.match(river, /prefers-reduced-motion/);
  assert.match(river, /devicePixelRatio/);

  // 进度接线属于 lab 页面而不是渲染器，这条仍看全站产物
  const javascript = await readAssets('.js');
  assert.match(javascript, /river-progress/);
});
