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

/** 河心的顺流速度（px/s）。两岸趋近于零，见 laneFlow()。 */
const CENTRE_FLOW_PIXELS_PER_SECOND = 62;

/**
 * 明渠流的横向速度剖面：贴壁不动、河心最快。
 * lane ∈ [-1, 1]，-1/1 是两岸。抛物线是教科书形态，够读得出中间快、两边慢。
 * @param {number} lane
 */
function laneFlow(lane) {
  return Math.max(0, 1 - lane * lane);
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   initialState?: Partial<RiverState>,
 *   getProgress?: () => number,
 *   observeElement?: Element,
 *   yOffset?: number,
 * }} configuration
 */
export function createRiverRenderer(configuration) {
  const {
    canvas,
    initialState = HOME_RIVER_PRESET,
    getProgress = () => 0,
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
    // 让几何跟着画布的真实比例走，而不是在被压扁的单位方格里算
    const aspect = canvasHeight > 0 ? canvasWidth / canvasHeight : 1;
    // 画布越窄越高，同一条曲线被拉得越陡，河宽就追不上曲率半径，只能靠钳制救场、
    // 一路收放。所以窄屏按比例收敛弯度；aspect ≥ 1.6 的横屏不受影响。
    const bendScale = Math.min(1, aspect / 1.6);

    return {
      bend: state.bend * bendScale,
      width: state.width,
      turbulence: state.turbulence,
      time: time * state.flow,
      progress: scrollProgress,
      seed: 17,
      aspect,
    };
  }

  function traceRibbon(radius, time, seedOffset) {
    if (!context || !ribbonContext) return false;
    const options = optionsAt(time);
    const samples = Math.max(100, Math.round(canvasWidth / 8));
    let previous;

    ribbonContext.clearRect(0, 0, ribbonBuffer.width, ribbonBuffer.height);
    ribbonContext.fillStyle = '#fff';

    for (let index = 0; index <= samples; index += 1) {
      const s = index / samples;
      // 河宽也是河道的属性，几乎不随时间变
      const pulse =
        1 +
        (smoothNoise(s * 8 - time * 0.05, 83 + seedOffset) - 0.5) *
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
    // 这条浅水→深水的色阶就是全站色板的来源：前三档对应 tokens.css 的
    // --water-100 / 300 / 500，最深一档是 --color-river #1651be。
    // 改这里要同步改那边，否则标题与河会脱色。
    const colors = [
      [222, 252, 250],
      [140, 240, 236],
      [78, 212, 228],
      [74, 186, 234],
      [66, 152, 228],
    ];

    for (let layer = layerCount - 1; layer >= 0; layer -= 1) {
      const depth = layer / Math.max(1, layerCount - 1);
      const radius = 1.38 - depth * 0.68;
      const colorIndex = Math.min(colors.length - 1, Math.floor(depth * colors.length));
      const [red, green, blue] = colors[colorIndex];
      const cobaltBoost = colorIndex >= colors.length - 2 ? state.cobalt : 0;
      // 深端再提亮 + 加成再降：八层叠加后仍不压向黑
      const alpha = 0.032 + depth * 0.04 + cobaltBoost * 0.018;
      if (traceRibbon(radius, time, layer * 19)) {
        compositeRibbon(`rgb(${red}, ${green}, ${blue})`, alpha);
      }
    }

    if (traceRibbon(0.72, time, 103) && ribbonContext) {
      const core = ribbonContext.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      core.addColorStop(0, 'rgb(222, 252, 250)');
      core.addColorStop(0.42, 'rgb(78, 212, 228)');
      core.addColorStop(0.72, 'rgb(96, 182, 250)');
      core.addColorStop(1, 'rgb(66, 152, 228)');
      compositeRibbon(core, 0.05 + state.cobalt * 0.038);
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
      const profile = laneFlow(lane);
      // 相邻纤维的差异是平滑的（噪声按 fiber 缓变），所以是剪切，不是各走各的
      const shear = 0.78 + smoothNoise(fiber * 0.34, 911) * 0.44;
      const options = optionsAt(time);
      context.beginPath();

      for (let index = 0; index <= sampleCount; index += 1) {
        const s = index / sampleCount;
        const sample = buildRibbonSample(s, 0, options);
        const lateralOffset = riverWidth(s, options) * laneRadius;
        // 纤维本身是静止的河道纹路，流动交给下面的虚线偏移去做
        const flutter =
          (smoothNoise(s * 12 + fiber, 307) - 0.5) * state.turbulence * 0.006;
        const point = pointToCanvas({
          x: sample.center.x,
          y: sample.center.y + lateralOffset + flutter,
        });
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }

      // 三种条纹：白沫、青流、深流。流动只有靠它们才看得见——之前 alpha 0.055
      // 的纤维虽然在动，但被静止的水体完全淹没，实测位移读不出来。
      // 岸边的条纹一并压淡：不动的水不该有明显的流痕
      const presence = 0.32 + 0.68 * profile;
      const tone = fiber % 3;
      if (tone === 0) {
        context.strokeStyle = `rgba(255, 255, 255, ${(0.16 + state.turbulence * 0.1) * presence})`;
        context.lineWidth = 0.85;
      } else if (tone === 1) {
        context.strokeStyle = `rgba(64, 186, 206, ${(0.12 + state.turbulence * 0.07) * presence})`;
        context.lineWidth = 0.62;
      } else {
        context.strokeStyle = `rgba(74, 152, 216, ${(0.08 + state.cobalt * 0.08) * presence})`;
        context.lineWidth = 0.72;
      }

      // 顺流：虚线沿路径平移。河道本身不动，动的是描在它上面的条纹 —— 这正是
      // "岸线确定、水在流"的模型。每条纤维错开相位，条纹才不会整齐划一。
      const dashUnit = Math.max(24, canvasWidth * 0.055);
      context.setLineDash([dashUnit, dashUnit * 0.85, dashUnit * 0.22, dashUnit * 0.7]);
      // 相位必须在各条纤维之间保持相干：错开太多（曾用 0.37 个周期）会让任意一列上
      // 总有一部分是亮段，总量恒定 —— 读起来是闪烁而不是平移。小幅错开只为斜切一点角度。
      // 速度按剖面取，再叠一点逐条的剪切差异，免得整条河像刚体在平移。
      const flow = CENTRE_FLOW_PIXELS_PER_SECOND * profile * shear;
      context.lineDashOffset = -(time * flow + fiber * dashUnit * 0.045);
      context.stroke();
      context.setLineDash([]);
    }
  }

  // 焦散：清水里光折射到水底的那些游动亮纹。清澈感主要来自它，而不是来自更淡的底色。
  function drawLight(time) {
    if (!context) return;
    const options = optionsAt(time);
    const sampleCount = Math.max(70, Math.round(canvasWidth / 14));
    // 压到刚好能感觉到"有光"，不该抢戏；速度也放慢一个量级
    const strands = [
      { lane: 0, alpha: 0.26, weight: 0.85, drift: 0 },
      { lane: -0.34, alpha: 0.15, weight: 0.6, drift: 1.7 },
      { lane: 0.41, alpha: 0.12, weight: 0.55, drift: 3.4 },
    ];

    context.lineCap = 'round';

    for (const strand of strands) {
      context.beginPath();

      for (let index = 0; index <= sampleCount; index += 1) {
        const s = index / sampleCount;
        const sample = buildRibbonSample(s, 0, options);
        // 每股在河道内横向漂移，亮纹才会互相错开、像在流动
        const wander =
          Math.sin(s * 9.3 - time * 0.09 + strand.drift) * 0.14 +
          Math.sin(s * 21.7 - time * 0.05 + strand.drift) * 0.06;
        const lateral = riverWidth(s, options) * (strand.lane + wander);
        const point = pointToCanvas({ x: sample.center.x, y: sample.center.y + lateral });
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }

      context.strokeStyle = `rgba(240, 253, 255, ${strand.alpha})`;
      context.lineWidth = strand.weight;
      context.stroke();
    }
  }

  function render(timestamp = 0, settleProgress = false) {
    if (!context || !canvasWidth || !canvasHeight) return;
    const targetProgress = clamp(getProgress(), 0, 1);
    const follow = reducedMotionQuery.matches || settleProgress ? 1 : 0.12;
    scrollProgress += (targetProgress - scrollProgress) * follow;
    const time = reducedMotionQuery.matches ? 0 : timestamp * 0.001;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.save();
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
