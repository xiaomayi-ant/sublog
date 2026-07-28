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

test('the river lab publishes a self-contained parametric river scene', async () => {
  const html = await readFile(path.join(distRoot, 'lab/river/index.html'), 'utf8');

  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /data-river-model="parametric-ribbon"/);
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
  const javascript = await readAssets('.js');

  assert.match(javascript, /requestAnimationFrame/);
  assert.match(javascript, /prefers-reduced-motion/);
  assert.match(javascript, /devicePixelRatio/);
  assert.match(javascript, /river-progress/);
});
