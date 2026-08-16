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

test('the fluid glyph reuses the site water palette instead of inventing colours', async () => {
  const source = await glyphAsset();

  // 颜色从设计 token 读，不在着色器里写死 —— 否则又多一处会自己漂的色板，
  // 河那边已经因为这个吃过一次亏（见 docs/river-math.md 第 5.4 节）。
  for (const token of ['--water-100', '--water-300', '--water-500']) {
    assert.match(source, new RegExp(token), `期望字形从 ${token} 取色`);
  }
});

test('the glyph mask clips the fluid to the letterforms', async () => {
  const source = await glyphAsset();

  // 遮罩用 2D 画布的 destination-in 做，而不是 SVG mask ——
  // 后者依赖 SVG 内的字体解析与 CSS 一致，跨浏览器不保证。
  assert.match(source, /destination-in/);
});
