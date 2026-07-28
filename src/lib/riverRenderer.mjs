import {
  buildRibbonSample,
  clamp,
  riverWidth,
  smoothNoise,
} from './riverMath.mjs';

/**
 * @typedef {object} RiverState
 * @property {number} bend
 * @property {number} width
 * @property {number} turbulence
 * @property {number} layers
 * @property {number} flow
 * @property {number} cobalt
 */

/** @type {Readonly<Record<string, Readonly<RiverState>>>} */
export const RIVER_PRESETS = Object.freeze({
  watercolor: Object.freeze({
    bend: 1.3,
    width: 1.26,
    turbulence: 0.48,
    layers: 8,
    flow: 1,
    cobalt: 0.3,
  }),
  silk: Object.freeze({
    bend: 0.82,
    width: 0.88,
    turbulence: 0.2,
    layers: 5,
    flow: 0.5,
    cobalt: 0.54,
  }),
  fibers: Object.freeze({
    bend: 1.32,
    width: 0.76,
    turbulence: 0.82,
    layers: 10,
    flow: 0.72,
    cobalt: 0.68,
  }),
});

export const HOME_RIVER_PRESET = RIVER_PRESETS.watercolor;

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   initialState?: Partial<RiverState>,
 *   getProgress?: () => number,
 *   getOpacity?: (progress: number) => number,
 *   observeElement?: Element,
 *   yOffset?: number,
 * }} configuration
 */
export function createRiverRenderer(configuration) {
  const {
    canvas,
    initialState = HOME_RIVER_PRESET,
    getProgress = () => 0,
    getOpacity = () => 1,
    observeElement = canvas,
    yOffset = 0,
  } = configuration;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('createRiverRenderer requires an HTMLCanvasElement.');
  }

  const context = canvas.getContext('2d');
  const ribbonBuffer = document.createElement('canvas');
  const ribbonContext = ribbonBuffer.getContext('2d');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { ...HOME_RIVER_PRESET, ...initialState };
  let canvasWidth = 0;
  let canvasHeight = 0;
  let pixelRatio = 1;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  let scrollProgress = clamp(getProgress(), 0, 1);

  function pointToCanvas(point) {
    return {
      x: point.x * canvasWidth,
      y: (point.y + yOffset) * canvasHeight,
    };
  }

  function optionsAt(time) {
    return {
      bend: state.bend,
      width: state.width,
      turbulence: state.turbulence,
      time: time * state.flow,
      progress: scrollProgress,
      seed: 17,
    };
  }

  function traceRibbon(radius, time, seedOffset) {
    if (!context || !ribbonContext) return false;
    const options = { ...optionsAt(time), curvatureLimit: false };
    const samples = Math.max(100, Math.round(canvasWidth / 8));
    let previous;

    ribbonContext.clearRect(0, 0, ribbonBuffer.width, ribbonBuffer.height);
    ribbonContext.fillStyle = '#fff';

    for (let index = 0; index <= samples; index += 1) {
      const s = index / samples;
      const pulse =
        1 +
        (smoothNoise(s * 8 + time * 0.025, 83 + seedOffset) - 0.5) *
          state.turbulence *
          0.1;
      const sample = buildRibbonSample(s, radius * pulse, options);
      const left = pointToCanvas(sample.left);
      const right = pointToCanvas(sample.right);
      const center = pointToCanvas(sample.center);
      const jointRadius = Math.hypot(left.x - center.x, left.y - center.y);

      if (previous) {
        ribbonContext.beginPath();
        ribbonContext.moveTo(previous.left.x, previous.left.y);
        ribbonContext.lineTo(left.x, left.y);
        ribbonContext.lineTo(right.x, right.y);
        ribbonContext.lineTo(previous.right.x, previous.right.y);
        ribbonContext.closePath();
        ribbonContext.fill();
      }

      ribbonContext.beginPath();
      ribbonContext.arc(center.x, center.y, jointRadius, 0, Math.PI * 2);
      ribbonContext.fill();
      previous = { left, right };
    }

    return true;
  }

  function compositeRibbon(fillStyle, alpha) {
    if (!context || !ribbonContext) return;
    ribbonContext.globalCompositeOperation = 'source-in';
    ribbonContext.fillStyle = fillStyle;
    ribbonContext.fillRect(0, 0, ribbonBuffer.width, ribbonBuffer.height);
    ribbonContext.globalCompositeOperation = 'source-over';

    context.save();
    context.globalAlpha *= alpha;
    context.drawImage(ribbonBuffer, 0, 0, canvasWidth, canvasHeight);
    context.restore();
  }

  function drawWash(time) {
    if (!context) return;
    const layerCount = Math.round(state.layers);
    const colors = [
      [200, 241, 238],
      [132, 220, 217],
      [74, 184, 202],
      [42, 128, 194],
    ];

    for (let layer = layerCount - 1; layer >= 0; layer -= 1) {
      const depth = layer / Math.max(1, layerCount - 1);
      const radius = 1.38 - depth * 0.68;
      const colorIndex = Math.min(colors.length - 1, Math.floor(depth * colors.length));
      const [red, green, blue] = colors[colorIndex];
      const cobaltBoost = colorIndex === colors.length - 1 ? state.cobalt : 0;
      const alpha = 0.028 + depth * 0.035 + cobaltBoost * 0.035;
      if (traceRibbon(radius, time, layer * 19)) {
        compositeRibbon(`rgb(${red}, ${green}, ${blue})`, alpha);
      }
    }

    if (traceRibbon(0.72, time, 103) && ribbonContext) {
      const core = ribbonContext.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      core.addColorStop(0, 'rgb(205, 246, 241)');
      core.addColorStop(0.55, 'rgb(49, 168, 196)');
      core.addColorStop(1, 'rgb(22, 81, 190)');
      compositeRibbon(core, 0.045 + state.cobalt * 0.055);
    }
  }

  function drawFibers(time) {
    if (!context) return;
    const fiberCount = 22 + Math.round(state.layers * 3.5);
    const sampleCount = Math.max(80, Math.round(canvasWidth / 12));
    context.lineCap = 'round';

    for (let fiber = 0; fiber < fiberCount; fiber += 1) {
      const lane = fiberCount === 1 ? 0 : (fiber / (fiberCount - 1)) * 2 - 1;
      const laneRadius = lane * (0.76 + smoothNoise(fiber * 0.61, 211) * 0.2);
      const options = optionsAt(time);
      context.beginPath();

      for (let index = 0; index <= sampleCount; index += 1) {
        const s = index / sampleCount;
        const sample = buildRibbonSample(s, 0, options);
        const lateralOffset = riverWidth(s, options) * laneRadius;
        const flutter =
          (smoothNoise(s * 12 + time * 0.035 + fiber, 307) - 0.5) *
          state.turbulence *
          0.006;
        const point = pointToCanvas({
          x: sample.center.x,
          y: sample.center.y + lateralOffset + flutter,
        });
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }

      const isCobalt = fiber % 7 === 0;
      context.strokeStyle = isCobalt
        ? `rgba(22, 73, 186, ${0.045 + state.cobalt * 0.1})`
        : `rgba(39, 153, 173, ${0.03 + state.turbulence * 0.022})`;
      context.lineWidth = isCobalt ? 0.8 : 0.45;
      context.stroke();
    }
  }

  function drawLight(time) {
    if (!context) return;
    const options = optionsAt(time);
    const sampleCount = Math.max(70, Math.round(canvasWidth / 14));
    context.beginPath();

    for (let index = 0; index <= sampleCount; index += 1) {
      const sample = buildRibbonSample(index / sampleCount, 0, options);
      const point = pointToCanvas(sample.center);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }

    context.strokeStyle = 'rgba(255, 252, 229, 0.3)';
    context.lineWidth = 0.8;
    context.stroke();
  }

  function render(timestamp = 0, settleProgress = false) {
    if (!context || !canvasWidth || !canvasHeight) return;
    const targetProgress = clamp(getProgress(), 0, 1);
    const follow = reducedMotionQuery.matches || settleProgress ? 1 : 0.12;
    scrollProgress += (targetProgress - scrollProgress) * follow;
    const time = reducedMotionQuery.matches ? 0 : timestamp * 0.001;
    const opacity = clamp(getOpacity(scrollProgress), 0, 1);

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.save();
    context.globalAlpha = opacity;
    drawWash(time);
    drawFibers(time);
    drawLight(time);
    context.restore();
  }

  function loop(timestamp) {
    frame = 0;
    if (destroyed || !visible || reducedMotionQuery.matches) return;
    render(timestamp);
    frame = requestAnimationFrame(loop);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!destroyed && visible && !reducedMotionQuery.matches) {
      frame = requestAnimationFrame(loop);
    }
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    canvasWidth = Math.max(1, bounds.width);
    canvasHeight = Math.max(1, bounds.height);
    canvas.width = Math.round(canvasWidth * pixelRatio);
    canvas.height = Math.round(canvasHeight * pixelRatio);
    ribbonBuffer.width = Math.ceil(canvasWidth);
    ribbonBuffer.height = Math.ceil(canvasHeight);
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    render(0, true);
  }

  function setState(nextState) {
    Object.assign(state, nextState);
    render(0, true);
  }

  function drawStaticProgress() {
    if (reducedMotionQuery.matches) render(0, true);
  }

  function syncMotion() {
    if (reducedMotionQuery.matches) render(0, true);
    schedule();
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) render(0, false);
    schedule();
  });

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', drawStaticProgress, { passive: true });
  reducedMotionQuery.addEventListener('change', syncMotion);
  observer.observe(observeElement);
  resize();
  schedule();

  return {
    getState: () => ({ ...state }),
    render: () => render(0, true),
    resize,
    setState,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', drawStaticProgress);
      reducedMotionQuery.removeEventListener('change', syncMotion);
    },
  };
}
