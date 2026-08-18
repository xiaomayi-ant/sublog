/**
 * 图片加载占位：图还没到的时候，那个位置是流动的水；图一到，水让开。
 *
 * 为什么是这个用法：站上的图来自 OSS，浏览器不给跨源图片的像素（实测
 * texImage2D 抛 SecurityError、2D 画布 getImageData 也被污染），所以任何
 * "在图上做折射"的效果都做不了。而占位根本不碰图 —— 它出现在图不在的时候。
 *
 * 顺带解决一个真实问题：现在的占位是一块 --color-line 的灰，相册页要等
 * OSS 回来才有内容，中间那段就是几块灰方块。
 *
 * ── 三条硬约束 ────────────────────────────────────────────────
 *
 * 1. 上下文预算。每个占位要一个 WebGL 上下文，浏览器通常只给十几个；相册
 *    列表一次可能有四五张图。所以有全局上限，超了就不接管（页面回到灰底），
 *    并且**图一加载完就立刻归还上下文**，不是留着。
 * 2. 图已在缓存里就别启动。img.complete 为真时创建上下文纯属浪费 ——
 *    水还没画出来图就盖上了。
 * 3. 只在接近视口时才启动。图是 loading="lazy" 的，屏幕外的图根本不会加载，
 *    给它开个上下文画水没有意义。
 * 4. 图很快就到了就别启动。量过 OSS 的三档耗时（见下），中间那档约 390ms ——
 *    比淡入过渡（--duration-slow 480ms）还短，水升到一半就得往回退，读作
 *    一次青色闪烁，比原来的灰底更烦人。所以进视口后先等一段再开。
 */

import { createFluidField } from './fluidField.mjs';
import { WASH_LADDER } from './riverRenderer.mjs';

/** 同时存活的占位上下文上限。相册页最多四五张图，留一点余量给河与字形。 */
const MAX_LIVE = 4;
let live = 0;

/**
 * 进视口后等多久才开水。实测 OSS 封面的三档耗时：
 *
 *   图片处理冷启动      7179ms   ← 水在这一档才有意义，原本这 7 秒是一块灰
 *   已处理、未进浏览器缓存  ~390ms   ← 挡在门外，否则只是闪一下
 *   浏览器缓存命中          5ms    ← image.complete 早就短路了，走不到这里
 *
 * 取 500 而不是 400：中间那档实测 380~397ms，贴着 400 会因为网络抖动
 * 时开时不开。对 7 秒那档而言晚半秒开无所谓。
 */
const SETTLE_GRACE_MS = 500;

/**
 * @param {{ canvas: HTMLCanvasElement, image: HTMLImageElement }} options
 * @returns {{ destroy(): void } | null}
 */
export function attachFluidPlaceholder({ canvas, image }) {
  if (!(canvas instanceof HTMLCanvasElement) || !(image instanceof HTMLImageElement)) return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const container = canvas.parentElement;
  let field = null;
  let frame = 0;
  let grace = 0;
  let destroyed = false;
  let started = false;
  let done = false;

  function settle() {
    // 图到了：把水交还给图。先标记，再在过渡结束后释放上下文 ——
    // 立刻释放会让画布在淡出过程中变空白。
    if (destroyed) return;
    // 记下"已经结束了"，否则还在等待中的 grace 定时器会在图到达之后才把水放出来
    done = true;
    clearTimeout(grace);
    container?.setAttribute('data-fluid-placeholder', 'settled');
    cancelAnimationFrame(frame);
    frame = 0;
    setTimeout(release, 700);
  }

  function release() {
    if (!field) return;
    field.destroy();
    field = null;
    live -= 1;
  }

  function loop(now) {
    frame = 0;
    if (destroyed || !field) return;
    field.render(reducedMotion.matches ? 0 : now * 0.001);
    const context = canvas.getContext('2d');
    if (context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(field.canvas, 0, 0, canvas.width, canvas.height);
    }
    if (!reducedMotion.matches) frame = requestAnimationFrame(loop);
  }

  function start() {
    if (started || destroyed || done || image.complete) return;
    if (live >= MAX_LIVE) return; // 预算用完：不接管，页面保持原来的灰底
    started = true;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));

    field = createFluidField({
      palette: {
        shallow: WASH_LADDER[0].rgb,
        mid: WASH_LADDER[1].rgb,
        deep: WASH_LADDER[2].rgb,
      },
      // 占位是背景不是主角，所以高光收掉、整体压浅（中位仍在 247 上下）。
      //
      // 但**不能连纹理一起压掉**。第一版是 floor .34 / span .3 / flatten .35，
      // 合成到白底后量 9.4 万个采样点，亮度 p05→p95 只剩 6 级、可辨色 5 种 ——
      // 那是一块纯色，流体白做了。docs/fluid-glyph.md 第 3 节记过同一个失败：
      // 范围窄到读不出纹理，等于没画。
      //
      // 拨旋钮量出来的账（固定 t=3.0，p05→p95 的亮度跨度）：
      //   现状 .34/.3/flatten .35   11
      //   只把 flatten 归零          20   ← 单个收益最大的一处
      //   再放开 alpha（此档）       28   ← 与 404 字形同档
      //   floor .12 / span .9        30   ← 边际收益已经拐弯
      //
      // flatten 是把密度往中间拉，正是它先把对比吃掉的；归零后再靠 floor/span
      // 把 alpha 的跨度放开。
      floor: 0.2,
      span: 0.7,
      sheen: 0.35,
      flatten: 0,
      scale: 2.2,
    });
    if (!field) return; // 拿不到 WebGL：同样保持灰底

    live += 1;
    field.resize(canvas.width, canvas.height);
    container?.setAttribute('data-fluid-placeholder', 'on');
    frame = requestAnimationFrame(loop);
  }

  // 图已经在缓存里 —— 连上下文都不必开
  if (image.complete) {
    container?.setAttribute('data-fluid-placeholder', 'settled');
    return { destroy() {} };
  }

  image.addEventListener('load', settle, { once: true });
  // 加载失败也要让位，否则水会一直转下去，看起来像"还在加载"
  image.addEventListener('error', settle, { once: true });

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        observer.disconnect();
        // 不直接 start()：先给图一段时间自己到，到了就不必开水（见 SETTLE_GRACE_MS）
        grace = setTimeout(start, SETTLE_GRACE_MS);
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(canvas);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      clearTimeout(grace);
      observer.disconnect();
      release();
    },
  };
}
