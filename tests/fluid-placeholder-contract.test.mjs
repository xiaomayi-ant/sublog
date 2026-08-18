// 流体占位的契约 —— 图还没到的时候，那个位置是流动的水。
//
// 这个组件的风险和 404 那一页同构：装饰跑在**内容之前**，所以「装饰失败时
// 内容仍然完好」比「装饰好看」重要得多。区别在于失败的后果更重 —— 404 挂了
// 只是少一个数字，占位挂了是**照片永远不出现**。所以下面的断言多数在守降级。
//
// 另有两条不是守降级、而是守「这个效果还有意义」的：
//
//   1. 纹理不许被压平。第一版的参数把流体压成了一块纯色（实测亮度跨度只剩
//      6 级、可辨色 5 种），效果等于没做。docs/fluid-glyph.md 第 3 节记过
//      同一个失败模式。
//   2. 不许和很快到达的图抢那半秒。中间那档 OSS 耗时约 390ms，比淡入过渡
//      还短，不设门槛就只是闪一下。
//
// 断言锚点沿用 not-found-contract 的原则：产物是压缩过的，函数名和常量名都
// 不可依赖（MAX_LIVE 已被压成 n=4），所以锚在存活的字符串常量、Web API 名
// 和数值字面量上。调出来的数值改为对源文件断言 —— 那才是它们被讨论的地方。
//
// ⚠️ 想实测降级的话，别再用 --disable-gpu。
//
// docs/fluid-glyph.md 第 7 节记着「headless Chrome 加 --disable-gpu 可复现
// 拿不到 WebGL」。在 Chrome 151.0.7922.138 上实测**已经不成立** ——
// --disable-gpu、再加 --disable-software-rasterizer、甚至再加 --disable-webgl，
// 三种组合都仍然拿得到 webgl 上下文（SwiftShader 兜底）。
//
// 真正有效的做法是在页面里打补丁，让 getContext('webgl') 返回 null：
//
//   const real = HTMLCanvasElement.prototype.getContext;
//   HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
//     if (String(kind).includes('webgl')) return null;
//     return real.call(this, kind, ...rest);
//   };
//
// 用它跑过一次对照实验：WebGL 可用时 404 的 data-fluid-glyph 是 "on"，
// 打了补丁则是 ""（静态数字仍在），相册页是 "settled"（照片带 src/alt 完好）。
// 这条同时意味着视觉基线 notfound-1440x900 现在锁的多半不是它自称的降级形态。

import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

const placeholderSource = () =>
  readFile(path.join(projectRoot, 'src/lib/fluidPlaceholder.mjs'), 'utf8');

async function pathExists(relative) {
  try {
    await access(path.join(distRoot, relative));
    return true;
  } catch {
    return false;
  }
}

/** 占位那一份产物。锚在它独有的标记上，不按 IntersectionObserver 这类通用 API 找。 */
async function placeholderAsset() {
  const assetsRoot = path.join(distRoot, '_astro');
  const files = (await readdir(assetsRoot)).filter((file) => file.endsWith('.js'));
  const hits = [];
  for (const file of files) {
    const source = await readFile(path.join(assetsRoot, file), 'utf8');
    if (source.includes('data-fluid-placeholder')) hits.push({ file, source });
  }
  assert.equal(hits.length, 1, '应当恰好有一份产物拥有占位逻辑');
  return hits[0];
}

test('图是默认可见的那一个，水只是盖在上面', async () => {
  if (!(await pathExists('albums/harness'))) return; // 还没出期就没有用到占位的页面
  const html = await readFile(path.join(distRoot, 'albums/harness/index.html'), 'utf8');

  // 图必须带着完整的 src/alt/尺寸留在 DOM 里 —— 它就是降级形态本身。
  // 换成由脚本注入的话，任何一条失败路径都会让照片彻底消失。
  assert.match(html, /<img class="fluid-image-photo[^>]*src="https:\/\/[^"]+"/);
  assert.match(html, /<img class="fluid-image-photo[^>]*alt="[^"]+"/);
  assert.match(html, /<img class="fluid-image-photo[^>]*loading="lazy"/);
  assert.match(html, /<canvas class="fluid-image-water"[^>]*aria-hidden="true"/);

  // 接管标记只能由脚本在运行时置上。烤进 HTML 等于还没接管就先把图藏了 ——
  // 没有 WebGL 的访客会对着一块空白。
  assert.doesNotMatch(html, /data-fluid-placeholder=["'](on|settled)["']/);
});

test('藏图必须以「水真的接管了」为条件', async () => {
  if (!(await pathExists('albums/harness'))) return;
  const html = await readFile(path.join(distRoot, 'albums/harness/index.html'), 'utf8');

  // 这条 CSS 是降级契约的另一半。opacity:0 一旦脱离 [data-fluid-placeholder=on]
  // 这个条件（比如误写成 .fluid-image-photo 的默认值），脚本没跑起来时
  // 照片就永远不可见了。
  assert.match(html, /\[data-fluid-placeholder=on\][^{]*\.fluid-image-photo[^{]*\{opacity:0\}/);
  assert.match(html, /\[data-fluid-placeholder=settled\][^{]*\.fluid-image-photo[^{]*\{opacity:1\}/);

  // 水反过来：只有接管了才浮起来，让位后落回去
  assert.match(html, /\[data-fluid-placeholder=on\][^{]*\.fluid-image-water[^{]*\{opacity:1\}/);
  assert.match(html, /\[data-fluid-placeholder=settled\][^{]*\.fluid-image-water[^{]*\{opacity:0\}/);

  // ── 上面四条都只说明"条件规则在"，还得钉住**默认值本身** ──
  //
  // 变异验证时这里漏过网：把默认 opacity 改成 0，四条条件规则原样健在，
  // 测试照样全绿，而没有 WebGL 的访客看到的是一片空白。这个组件最重的
  // 失败就是它，所以默认值必须单独断言。
  //
  // 默认那一块靠它独有的属性认领 —— 只有它带 object-fit / pointer-events。
  const defaultBlock = (selector, marker) => {
    const found = [...html.matchAll(new RegExp(`\\.${selector}\\[data-astro-cid-[a-z0-9]+\\]\\{[^}]*\\}`, 'g'))]
      .map((m) => m[0])
      .find((block) => block.includes(marker));
    assert.ok(found, `没能定位到 .${selector} 的默认样式块`);
    return found;
  };

  assert.match(
    defaultBlock('fluid-image-photo', 'object-fit'),
    /opacity:1/,
    '照片的默认状态必须是可见 —— 它是降级形态，不能等脚本来点亮',
  );
  assert.match(
    defaultBlock('fluid-image-water', 'pointer-events'),
    /opacity:0/,
    '水的默认状态必须是不可见 —— 只有真的接管了才浮起来',
  );
});

test('占位的色阶取自河，不是另抄一份', async () => {
  // 与 404 的字形同一条约束：河改色，占位跟着走。三处同源，不是三处同步。
  const { source } = await placeholderAsset();
  assert.match(source, /riverRenderer/, '占位的产物应当引用河渲染器那个 chunk');

  const ladderSource = await readFile(path.join(projectRoot, 'src/lib/riverRenderer.mjs'), 'utf8');
  const ladder = [...ladderSource.matchAll(/rgb:\s*Object\.freeze\(\[(\d+),\s*(\d+),\s*(\d+)\]\)/g)]
    .slice(0, 3)
    .map(([, r, g, b]) => `${r},${g},${b}`);
  assert.equal(ladder.length, 3, '没能从 riverRenderer 解析出色阶前三档');

  // 色值一个都不许被复制进占位自己的产物里
  for (const triplet of ladder) {
    assert.ok(
      !source.includes(triplet),
      `色阶 ${triplet} 被复制进了占位的产物 —— 应当 import WASH_LADDER 而不是抄一份`,
    );
  }
});

test('占位守着 WebGL 上下文预算，用完就归还', async () => {
  const { source } = await placeholderAsset();

  // 浏览器通常只给十几个上下文，相册一屏可能有四五张图。三件事都得在：
  // 有上限、图一到就归还、离开时清干净。
  const src = await placeholderSource();
  const limit = Number(src.match(/const MAX_LIVE = (\d+)/)?.[1]);
  assert.ok(limit >= 1 && limit <= 6, `上下文上限应当是个保守的小数字，实际 ${limit}`);
  // 光有常量不算数 —— 变异验证时"删掉那句比较、常量留着"漏过一次网。
  // 上限必须真的挡在开上下文之前。
  assert.match(src, /live\s*>=\s*MAX_LIVE/, '上限必须真的用来拦，不能只是个摆着的常量');

  assert.match(source, /destroy\(\)/, '应当能主动销毁');
  assert.match(source, /cancelAnimationFrame/, '停渲要撤掉帧回调');
  // 归还上下文这一步在 fluidField 那侧（WEBGL_lose_context），占位负责调它
  assert.match(src, /field\.destroy\(\)/, '图到了要真的把上下文还回去，不是留着');

  // 屏外的图根本不会加载，不该为它开上下文
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /rootMargin/);
  // 图已经在缓存里就别启动 —— 水还没画出来图就盖上了
  assert.match(source, /\.complete/);
  // 加载失败也要让位，否则水一直转，读作"还在加载"
  assert.match(source, /`error`|"error"|'error'/);
});

test('图很快就到了的话，占位不抢那半秒', async () => {
  const src = await placeholderSource();
  const grace = Number(src.match(/const SETTLE_GRACE_MS = (\d+)/)?.[1]);

  // 门槛必须不短于淡入过渡（--duration-slow，480ms）。比它短的话，
  // 水升到一半图就到了，读作一次青色闪烁 —— 比原来的灰底更烦人。
  assert.ok(grace >= 480, `启动门槛应当不短于淡入过渡 480ms，实际 ${grace}ms`);
  // 也不能长到把真正该出水的场景（实测 7 秒的冷启动）也挡掉
  assert.ok(grace <= 1500, `启动门槛过长会连慢加载也盖不住，实际 ${grace}ms`);

  const { source } = await placeholderAsset();
  // 进视口后走的必须是定时器，不是直接开水
  assert.match(source, /setTimeout\([a-zA-Z_$]+,\s*[a-zA-Z_$]+\)/);
  // 图先到时要撤掉待发的定时器，否则水会在图之后才冒出来
  assert.match(source, /clearTimeout/);
});

test('占位的流体必须真的有纹理 —— 不许再被压成一块纯色', async () => {
  const src = await placeholderSource();
  const block = src.match(/createFluidField\(\{[\s\S]*?\n\s{4}\}\)/)?.[0];
  assert.ok(block, '没能定位到占位创建流体场的那段参数');

  const value = (name) => Number(block.match(new RegExp(`${name}:\\s*([\\d.]+)`))?.[1]);

  // flatten 是把密度往中间拉的那个旋钮，正是它先把对比吃掉。
  // 第一版取 0.35，量出来亮度跨度只剩 6 级、可辨色 5 种 —— 一块纯色。
  assert.equal(value('flatten'), 0, 'flatten 一旦非零就会把纹理压平，这条守的是别再退回去');

  // alpha 的跨度要够，否则密度再有起伏也合成不出对比
  assert.ok(value('span') >= 0.5, `span 太小会让纹理读不出来，实际 ${value('span')}`);

  // 但它仍然是背景不是主角：高光收着，不许开到字形那一档
  assert.ok(value('sheen') <= 0.6, `占位的高光不该抢主体，实际 ${value('sheen')}`);
});
