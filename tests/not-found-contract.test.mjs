// 404 页的契约。
//
// 这一页的特殊之处：它是用户走错路时看到的那一页，所以「装饰失败时仍然完好」
// 比「装饰好看」重要得多。下面的断言大部分在守降级，而不是守效果。
//
// 已实测的两条降级路径：
//   1. 拿不到 WebGL 上下文 → createFluidGlyph 返回 null → 静态数字照常显示。
//      headless Chrome 加 --disable-gpu 可复现：此时 data-fluid-glyph 保持为空，
//      去掉该参数才变成 "on"。视觉基线 notfound-1440x900 锁的正是这个形态。
//   2. 着色器编译失败 → 同上。开发中真撞到过：本机 ANGLE Metal 后端不支持
//      OES_standard_derivatives，早期版本用 dFdx/dFdy 求梯度，整段编译不过，
//      页面完好地退回了静态数字。
//
// 断言锚点的选择：产物是压缩过的，函数名不可依赖（createFluidGlyph 在产物里
// 已被改名）。所以一律锚在存活下来的字符串常量上 —— 着色器 uniform 名、
// 设计 token 名、Web API 名、日志前缀。

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

async function notFoundHtml() {
  return readFile(path.join(distRoot, '404.html'), 'utf8');
}

/**
 * 流体字形自己那一份产物。用着色器里的 uniform 名认领 —— 站上还有别的脚本
 * 用 IntersectionObserver / requestAnimationFrame，按那些找会命中错的产物。
 */
async function glyphAsset() {
  const assetsRoot = path.join(distRoot, '_astro');
  const files = (await readdir(assetsRoot)).filter((file) => file.endsWith('.js'));
  const hits = [];
  for (const file of files) {
    const source = await readFile(path.join(assetsRoot, file), 'utf8');
    if (source.includes('u_shallow')) hits.push(source);
  }
  assert.equal(hits.length, 1, 'expected exactly one built asset to own the fluid glyph shader');
  return hits[0];
}

test('the 404 page keeps its static number as the ground truth', async () => {
  const html = await notFoundHtml();

  // 数字必须在 DOM 里、且默认可见 —— 它既是底稿也是降级形态。
  // 只把它画进 canvas 的话，任何一条失败路径都会在页面上留下一个空洞。
  assert.match(html, /<p class="number"[^>]*>404<\/p>/);
  assert.match(html, /<canvas class="number-fluid"/);
  assert.match(html, /data-fluid-glyph/);

  // 接管标记只能由脚本在运行时置上，不能烤进 HTML ——
  // 烤进去等于还没接管就先把静态数字藏了。
  assert.doesNotMatch(html, /data-fluid-glyph=["']on["']/);

  // 文案、出口与 noindex 都不受装饰影响
  assert.match(html, /这条水路没有抵达这里。/);
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/blog"/);
});

test('the 404 page hides the static number only after the fluid takes over', async () => {
  const html = await notFoundHtml();

  // 这条 CSS 是降级契约的另一半：隐藏必须以 [data-fluid-glyph=on] 为条件。
  // 少了这个条件选择器，没有 WebGL 的访客会看到一个空白。
  assert.match(html, /\[data-fluid-glyph=on\][^{]*\.number[^{]*\{visibility:hidden\}/);
});

test('the fluid glyph degrades instead of throwing', async () => {
  const source = await glyphAsset();

  // 编译/链接失败要被捕获并降级，而不是抛到页面上
  assert.match(source, /\[fluidGlyph\]/, '失败时应带前缀告警，便于定位');
  assert.match(source, /catch/);
  // 动效降级、离屏停渲、尺寸跟随
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /ResizeObserver/);
  // 销毁时归还 GPU 上下文
  assert.match(source, /WEBGL_lose_context/);
});

test('the fluid glyph asks for no WebGL extension', async () => {
  const source = await glyphAsset();

  // OES_standard_derivatives 并非处处可用 —— 本机 ANGLE Metal 后端就不支持。
  // 高光改为取密度的过渡带，不再需要任何扩展。这条测试守的是别再退回去。
  assert.doesNotMatch(source, /standard_derivatives/);
  assert.doesNotMatch(source, /dFdx|dFdy/);
});

test('the fluid glyph takes its colours from the river, not a copy of them', async () => {
  // 字形吃的是 riverRenderer 导出的 WASH_LADDER 本身，不是另抄一份色值。
  // 河改色，这边跟着走 —— 不会再出现"两条色阶各漂各的"那种事
  // （河与 tokens.css 就因为靠注释同步而漂过，见 docs/river-math.md 第 5.4 节）。
  //
  // 验收方式：404 的脚本必须 import 河渲染器那个 chunk，而色阶的字面值
  // 只能出现在那个 chunk 里、不能被复制进 404 自己的产物。
  const assetsRoot = path.join(distRoot, '_astro');
  const files = await readdir(assetsRoot);

  const ladderSource = await readFile(path.join(projectRoot, 'src/lib/riverRenderer.mjs'), 'utf8');
  const ladder = [...ladderSource.matchAll(/rgb:\s*Object\.freeze\(\[(\d+),\s*(\d+),\s*(\d+)\]\)/g)]
    .slice(0, 3)
    .map(([, r, g, b]) => `${r},${g},${b}`);
  assert.equal(ladder.length, 3, '没能从 riverRenderer 解析出色阶前三档');

  const owners = [];
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const source = await readFile(path.join(assetsRoot, file), 'utf8');
    if (ladder.every((triplet) => source.includes(triplet))) owners.push(file);
  }
  assert.equal(owners.length, 1, `色阶字面值应当只存在一份，实际出现在 ${owners.length} 个产物里`);
  assert.match(owners[0], /riverRenderer/, '色阶应当归河渲染器那个 chunk 所有');

  const glyphFile = files.find((name) => name.startsWith('404.astro'));
  assert.ok(glyphFile, '找不到 404 的脚本产物');
  const glyphSource = await readFile(path.join(assetsRoot, glyphFile), 'utf8');
  assert.match(glyphSource, /riverRenderer/, '404 的脚本应当引用河渲染器那个 chunk');
});

test('the glyph mask clips the fluid to the letterforms', async () => {
  const source = await glyphAsset();

  // 遮罩用 2D 画布的 destination-in 做，而不是 SVG mask ——
  // 后者依赖 SVG 内的字体解析与 CSS 一致，跨浏览器不保证。
  assert.match(source, /destination-in/);
});
