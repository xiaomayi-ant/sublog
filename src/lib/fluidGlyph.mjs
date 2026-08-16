/**
 * 把一段文字的字形当作遮罩，在里面渲染流体。
 *
 * 流体本身由 fluidField 提供 —— 它只负责画满一块离屏画布，不关心最终被裁成
 * 什么形状。这里负责的只有两件事：读排版、做遮罩。
 *
 * 遮罩用两块画布：fluidField 的 WebGL 画布画流体，这边的 2D 画布 drawImage
 * 之后用 destination-in 叠上文字，流体就被裁进字形里。比 SVG mask 可靠 ——
 * 后者依赖 SVG 内的字体解析结果与 CSS 一致，跨浏览器不保证。
 */

import { createFluidField } from './fluidField.mjs';

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   source: HTMLElement,
 *   palette: {
 *     shallow: readonly number[],
 *     mid: readonly number[],
 *     deep: readonly number[],
 *   },
 *   sheen?: number,
 * }} configuration
 * @returns {{ destroy(): void, ok: boolean } | null}
 */
export function createFluidGlyph(configuration) {
  const { canvas, source, palette, sheen = 1 } = configuration;
  if (!(canvas instanceof HTMLCanvasElement) || !(source instanceof HTMLElement)) return null;

  const view = canvas.getContext('2d');
  const field = createFluidField({ palette, sheen });
  // 两条降级路径都在这里合流：没有 2D 上下文，或者 fluidField 拿不到 WebGL /
  // 着色器编译失败。调用方只看 null，不必区分是哪一种。
  if (!view || !field) return null;
  const buffer = field.canvas;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  let glyph = { text: '', font: '', spacing: 0, baseline: 0, left: 0 };

  /** 从 DOM 里读真实排版，而不是在这里另写一套 —— 字号是 clamp() 出来的。 */
  function readGlyph() {
    const style = getComputedStyle(source);
    const rect = source.getBoundingClientRect();
    const size = parseFloat(style.fontSize);
    const spacingRaw = style.letterSpacing;
    return {
      text: (source.textContent || '').trim(),
      font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`,
      spacing: spacingRaw === 'normal' ? 0 : parseFloat(spacingRaw) || 0,
      // 基线位置：行盒顶部 + 行高的一半 + 半个字高，够贴近 CSS 的实际排布
      baseline: (rect.height + size * 0.72) / 2,
      left: 0,
      size,
    };
  }

  function paintMask() {
    view.globalCompositeOperation = 'destination-in';
    view.fillStyle = '#000';
    view.textBaseline = 'alphabetic';
    view.font = glyph.font;
    if ('letterSpacing' in view) view.letterSpacing = `${glyph.spacing}px`;
    view.fillText(glyph.text, glyph.left, glyph.baseline);
    view.globalCompositeOperation = 'source-over';
  }

  function render(now) {
    if (destroyed || !width || !height) return;
    const time = reducedMotion.matches ? 0 : now * 0.001;
    field.render(time);

    view.setTransform(1, 0, 0, 1, 0, 0);
    view.clearRect(0, 0, canvas.width, canvas.height);
    view.setTransform(ratio, 0, 0, ratio, 0, 0);
    view.drawImage(buffer, 0, 0, width, height);
    paintMask();
  }

  function loop(now) {
    frame = 0;
    if (destroyed || !visible || reducedMotion.matches) return;
    render(now);
    frame = requestAnimationFrame(loop);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!destroyed && visible && !reducedMotion.matches) frame = requestAnimationFrame(loop);
  }

  function resize() {
    const rect = source.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    field.resize(canvas.width, canvas.height);
    glyph = readGlyph();
    render(0);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(source);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting !== false;
    schedule();
  });
  intersectionObserver.observe(canvas);
  const onMotionChange = () => {
    render(0);
    schedule();
  };
  reducedMotion.addEventListener('change', onMotionChange);

  resize();
  schedule();

  return {
    ok: true,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      reducedMotion.removeEventListener('change', onMotionChange);
      field.destroy();
    },
  };
}
