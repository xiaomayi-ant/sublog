import { createFluidField } from './fluidField.mjs';
import {
  buildRibbonGeometry,
  clamp,
  fbm,
  ribbonEdges,
  smoothNoise,
  warpedFbm,
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
 * 水彩层的色阶，浅水 → 深水。
 *
 * 它与 `tokens.css` 的 `--water-*` **不是同一组值**。这一点以前被一句注释说反了
 * ——那句话声称"前三档对应 --water-100/300/500，最深一档是 --color-river"，
 * 实际最深一档差了 (44,71,38)，前三档也各差几到二十几。两者是同一条色相轴上的
 * 两套取值，用途不同：
 *
 *   tokens.css 的 --water-*   要承载文字，每档背着论证过的对比度
 *   这里的 WASH_LADDER        只做图形，在 alpha 0.03~0.09 下叠出来
 *
 * 试过把这里对齐到 tokens 那一组：河从青绿转向蓝，28.6% 的像素变化、平均色差
 * 12.32，观感偏离太多，退回。契约测试因此改为守"同一色相轴"而不是逐值相等，
 * 见 tests/river-palette.test.mjs。
 */
export const WASH_LADDER = Object.freeze([
  Object.freeze({ near: '--water-100', rgb: Object.freeze([222, 252, 250]) }),
  Object.freeze({ near: '--water-300', rgb: Object.freeze([140, 240, 236]) }),
  Object.freeze({ near: '--water-500', rgb: Object.freeze([78, 212, 228]) }),
  Object.freeze({ near: '--water-500', rgb: Object.freeze([74, 186, 234]) }),
  Object.freeze({ near: '--color-river', rgb: Object.freeze([66, 152, 228]) }),
]);

/**
 * 核心那一道斜向渐变的色标。单独列出是因为它有一档 (96,182,250) 不在上面的
 * 色阶里 —— 以前散在 drawWash 内部写死，谁也没提过，只能自己漂。
 */
const CORE_GRADIENT = Object.freeze([
  Object.freeze({ at: 0, rgb: Object.freeze([222, 252, 250]) }),
  Object.freeze({ at: 0.42, rgb: Object.freeze([78, 212, 228]) }),
  Object.freeze({ at: 0.72, rgb: Object.freeze([96, 182, 250]) }),
  Object.freeze({ at: 1, rgb: Object.freeze([66, 152, 228]) }),
]);

/**
 * 纤维条纹的三种色调：白沫、青流、深流。
 *
 * 原来这三个是散写在 drawFibers 里的 rgba() 字面值 —— 也就是这个文件里的
 * **第三套**颜色，既不是 WASH_LADDER 也不是 tokens。而且它躲过了色板契约测试，
 * 因为那条正则写的是 rgb\( ，匹配不到 rgba\( 。现在接到色阶上，测试也一并收紧。
 */
const FIBER_TONES = Object.freeze([
  Object.freeze({ rgb: Object.freeze([255, 255, 255]), width: 0.85 }),
  Object.freeze({ rgb: WASH_LADDER[2].rgb, width: 0.62 }),
  Object.freeze({ rgb: WASH_LADDER[4].rgb, width: 0.72 }),
]);

/**
 * 焦散亮纹的颜色。清水里光折射到水底的那些游动亮纹 —— 它是光不是水，
 * 所以比色阶最浅那一档还要亮，单列一档而不是硬塞进 WASH_LADDER。
 * 原本也是散写在 drawLight 里的 rgba() 字面值。
 */
const CAUSTIC_RGB = Object.freeze([240, 253, 255]);

/** 河心的顺流速度（px/s）。两岸趋近于零，见 laneFlow()。 */
const CENTRE_FLOW_PIXELS_PER_SECOND = 62;

/** 多大的曲率算"弯"。乘上去再钳到 1，所以它决定的是从哪一档开始起浪。 */
const BEND_SENSITIVITY = 1.4;
/** 涌浪沿河的空间频率（一屏几个浪）与推进速度。河不大，两者都取小。 */
const BANK_WAVE_FREQUENCY = 9.5;
const BANK_WAVE_SPEED = 0.55;

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
 *   fluidInterior?: boolean,
 *   fibers?: boolean,
 *   washOpacity?: number,
 *   fluidStrength?: number,
 *   fiberDensity?: number,
 *   fiberOpacity?: number,
 *   bankWave?: number,
 * }} configuration
 */
export function createRiverRenderer(configuration) {
  const {
    canvas,
    initialState = HOME_RIVER_PRESET,
    getProgress = () => 0,
    observeElement = canvas,
    yOffset = 0,
    // 以下三个是实验旋钮，默认值保持现状 —— 首页不传就等于没有它们。
    // 纤维层：河道内部的静止纹路，流动靠虚线相位平移。
    // 流体场接管内里之后它可能是多余的，留个开关便于对比。
    fibers = true,
    // 八层水彩的整体不透明度倍率。1 = 现状；小于 1 河变浅。
    washOpacity = 1,
    // 流体纹理压过缎带原色的比例。0 = 完全是现状；1 = 颜色结构被纹理顶掉。
    fluidStrength = 0.5,
    // 纤维密度倍率。1 = 现状的 50 条。
    fiberDensity = 1,
    // 纤维整体不透明度倍率。
    fiberOpacity = 1,
    // 弯道外岸涌浪的幅度（相对河宽）。0 = 关闭。河不大，值该取小。
    bankWave = 0,
  } = configuration;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('createRiverRenderer requires an HTMLCanvasElement.');
  }

  const context = canvas.getContext('2d');
  const ribbonBuffer = document.createElement('canvas');
  const ribbonContext = ribbonBuffer.getContext('2d');
  // 实验中的流体内里。默认关闭，关闭时这个渲染器与改动前逐像素相同
  // （视觉基线守着这一点）。开启时几何一行不动，只是每层缎带灌的从纯色
  // 换成流体纹理 —— 见 compositeRibbon。
  const fluidField =
    configuration.fluidInterior === true
      ? createFluidField({
          palette: {
            shallow: WASH_LADDER[0].rgb,
            mid: WASH_LADDER[1].rgb,
            deep: WASH_LADDER[2].rgb,
          },
          // 叠在原色之上，所以这里要接近不透明 —— 透明的地方等于没叠。
          // 纹理的强弱交给 FLUID_TEXTURE_STRENGTH 统一控制。
          floor: 0.92,
          span: 0.08,
          sheen: 0.55,
          // 河比字形宽得多，同样的噪声尺度会显得太碎
          scale: 5.2,
        })
      : null;
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

  // 一帧内的几何缓存。键是采样数 —— 水彩、纤维、亮纹各用各的 s 网格
  // （180 / 120 / 103），网格不同就不能共用一张表；但同一张网格上，
  // 八层水彩和五十条纤维要的中心线、法线、曲率、河宽是同一份。
  //
  // 只在帧内有效：options 每帧都随 time 变，跨帧复用就会把河冻住。
  // 换来的是同一帧里 ~7900 次几何求值降到 ~400 次，画面逐像素不变。
  const geometryCache = new Map();

  function geometryGrid(sampleCount, options) {
    const cached = geometryCache.get(sampleCount);
    if (cached) return cached;
    const grid = new Array(sampleCount + 1);
    for (let index = 0; index <= sampleCount; index += 1) {
      grid[index] = buildRibbonGeometry(index / sampleCount, options);
    }
    geometryCache.set(sampleCount, grid);
    return grid;
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
    const grid = geometryGrid(samples, options);
    let previous;

    ribbonContext.clearRect(0, 0, ribbonBuffer.width, ribbonBuffer.height);
    ribbonContext.fillStyle = '#fff';

    for (let index = 0; index <= samples; index += 1) {
      const s = index / samples;
      // 河宽也是河道的属性，几乎不随时间变。
      // 用 fbm 而不是单倍频：水线上同时有大尺度的涨落和细碎的皱，
      // 单一尺度读起来是规整的波浪。幅度不变，仍受 turbulence 控制，
      // turbulence 为 0 时这一项整体消失。
      const pulse =
        1 +
        (fbm(s * 8 - time * 0.05, 83 + seedOffset) - 0.5) * state.turbulence * 0.1;
      const geometry = grid[index];
      const edges = ribbonEdges(geometry, radius * pulse, options);
      const left = pointToCanvas(edges.left);
      const right = pointToCanvas(edges.right);
      const center = pointToCanvas(geometry.center);
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

  /**
   * 把 traceRibbon 留下的白色蒙版灌上内容，再叠到主画布。
   *
   * `fillStyle` 是纯色或渐变；`fluidField` 存在时改灌流体纹理 —— 同一个
   * source-in，只是源从颜色换成一块画布。河道几何、图层数、半径与 alpha
   * 全部不变，变的只是每层填的是什么。
   */
  function compositeRibbon(fillStyle, alpha) {
    if (!context || !ribbonContext) return;
    ribbonContext.globalCompositeOperation = 'source-in';
    ribbonContext.fillStyle = fillStyle;
    ribbonContext.fillRect(0, 0, ribbonBuffer.width, ribbonBuffer.height);

    if (fluidField) {
      // 在这一层自己的颜色之上叠流体，而不是取代它。
      //
      // 试过直接用流体填充八层：形态完全对得上，但整条河淡掉一大截且发绿 ——
      // 因为八层共用同一张流体，而流体的平均色是浅的，原本由深层贡献的
      // #4ed4e4 / #4298e4 全丢了。颜色结构是这条河的骨架，不能让纹理顶掉。
      //
      // source-atop 保证只画在缎带内部（蒙版之外一笔不落），globalAlpha 决定
      // 纹理压过原色多少。
      ribbonContext.globalCompositeOperation = 'source-atop';
      ribbonContext.globalAlpha = fluidStrength;
      ribbonContext.drawImage(fluidField.canvas, 0, 0, ribbonBuffer.width, ribbonBuffer.height);
      ribbonContext.globalAlpha = 1;
    }

    ribbonContext.globalCompositeOperation = 'source-over';

    context.save();
    context.globalAlpha *= alpha;
    context.drawImage(ribbonBuffer, 0, 0, canvasWidth, canvasHeight);
    context.restore();
  }

  function drawWash(time) {
    if (!context) return;
    const layerCount = Math.round(state.layers);
    const colors = WASH_LADDER.map((step) => step.rgb);

    for (let layer = layerCount - 1; layer >= 0; layer -= 1) {
      const depth = layer / Math.max(1, layerCount - 1);
      const radius = 1.38 - depth * 0.68;
      const colorIndex = Math.min(colors.length - 1, Math.floor(depth * colors.length));
      const [red, green, blue] = colors[colorIndex];
      const cobaltBoost = colorIndex >= colors.length - 2 ? state.cobalt : 0;
      // 深端再提亮 + 加成再降：八层叠加后仍不压向黑。
      // washOpacity 是整体倍率，用来把河调浅；默认 1，即现状。
      const alpha = (0.032 + depth * 0.04 + cobaltBoost * 0.018) * washOpacity;
      if (traceRibbon(radius, time, layer * 19)) {
        compositeRibbon(`rgb(${red}, ${green}, ${blue})`, alpha);
      }
    }

    if (traceRibbon(0.72, time, 103) && ribbonContext) {
      const core = ribbonContext.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      for (const { at, rgb } of CORE_GRADIENT) {
        core.addColorStop(at, `rgb(${rgb.join(', ')})`);
      }
      compositeRibbon(core, (0.05 + state.cobalt * 0.038) * washOpacity);
    }
  }

  function drawFibers(time) {
    if (!context) return;
    // 密度：原来固定 22 + layers*3.5 = 50 条。太密会读成一把梳齿而不是水纹，
    // 所以留出倍率。
    const fiberCount = Math.max(3, Math.round((22 + state.layers * 3.5) * fiberDensity));
    const sampleCount = Math.max(80, Math.round(canvasWidth / 12));
    context.lineCap = 'round';

    for (let fiber = 0; fiber < fiberCount; fiber += 1) {
      const lane = fiberCount === 1 ? 0 : (fiber / (fiberCount - 1)) * 2 - 1;
      const laneRadius = lane * (0.76 + smoothNoise(fiber * 0.61, 211) * 0.2);
      const profile = laneFlow(lane);
      // 相邻纤维的差异是平滑的（噪声按 fiber 缓变），所以是剪切，不是各走各的
      const shear = 0.78 + smoothNoise(fiber * 0.34, 911) * 0.44;
      const options = optionsAt(time);
      const grid = geometryGrid(sampleCount, options);
      context.beginPath();

      for (let index = 0; index <= sampleCount; index += 1) {
        const s = index / sampleCount;
        // 纤维只要中心线和河宽 —— 原来为此调 buildRibbonSample(s, 0, …)，
        // 付了六次中心线采样加一次曲率，再把两岸整个扔掉。
        const geometry = grid[index];
        const lateralOffset = geometry.baseWidth * laneRadius;
        // 纤维本身是静止的河道纹路，流动交给下面的虚线偏移去做。
        // 这里换 fbm 不违反那个模型：纹路依然静止，只是它自己有了大小两层尺度，
        // 读起来才像水面的纹理而不是一把平行的梳齿。幅度一个字没动。
        const flutter = (fbm(s * 12 + fiber, 307) - 0.5) * state.turbulence * 0.006;

        // 弯道二次流：表层水涌向外岸，外岸由曲率的符号决定（见 riverMath 的
        // signedCenterlineCurvature）。只在弯得够急、且靠近外岸的一侧起浪，
        // 直河段保持平静 —— 这才是"局部和拐弯处才有动静"。
        //
        // 一浪一浪：用沿河行进的正弦而不是噪声。噪声给的是随机起伏，
        // 涌浪要的是有节奏地推过去。
        let swell = 0;
        if (bankWave > 0) {
          const outerBank = Math.sign(geometry.signedCurvature);
          const towardOuter = Math.max(0, lane * outerBank); // 只作用在外岸那一侧
          const bend = Math.min(1, Math.abs(geometry.signedCurvature) * BEND_SENSITIVITY);
          swell =
            Math.sin(s * BANK_WAVE_FREQUENCY - time * BANK_WAVE_SPEED + fiber * 0.12) *
            towardOuter *
            towardOuter * // 平方：让浪集中在贴岸那几条，中间几乎不受影响
            bend *
            geometry.baseWidth *
            bankWave;
        }

        const point = pointToCanvas({
          x: geometry.center.x,
          y: geometry.center.y + lateralOffset + flutter + swell,
        });
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }

      // 三种条纹：白沫、青流、深流。流动只有靠它们才看得见——之前 alpha 0.055
      // 的纤维虽然在动，但被静止的水体完全淹没，实测位移读不出来。
      // 岸边的条纹一并压淡：不动的水不该有明显的流痕
      const presence = 0.32 + 0.68 * profile;
      const toneIndex = fiber % FIBER_TONES.length;
      const tone = FIBER_TONES[toneIndex];
      const toneAlpha =
        toneIndex === 0
          ? 0.16 + state.turbulence * 0.1
          : toneIndex === 1
            ? 0.12 + state.turbulence * 0.07
            : 0.08 + state.cobalt * 0.08;
      context.strokeStyle = `rgba(${tone.rgb.join(', ')}, ${toneAlpha * presence * fiberOpacity})`;
      context.lineWidth = tone.width;

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
    const grid = geometryGrid(sampleCount, options);
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
        const geometry = grid[index];
        // 每股在河道内横向漂移，亮纹才会互相错开、像在流动。
        // 原来是两个正弦叠加，周期性明显——同一股亮纹的摆动会重复。
        // 换成域扭曲后的 fbm：摆动不再有周期，而且纹样是被"拖着走"的，
        // 这正是焦散该有的样子。幅度维持在原来两个正弦之和的 ±0.20。
        const wander = (warpedFbm(s * 3.4 - time * 0.07 + strand.drift, 500) - 0.5) * 0.4;
        const lateral = geometry.baseWidth * (strand.lane + wander);
        const point = pointToCanvas({ x: geometry.center.x, y: geometry.center.y + lateral });
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }

      context.strokeStyle = `rgba(${CAUSTIC_RGB.join(', ')}, ${strand.alpha})`;
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
    // 几何只在这一帧内可复用：options 随 time 和 scrollProgress 变，
    // 忘了清就等于把河冻在第一帧。
    geometryCache.clear();
    // 流体场每帧只画一次，八层缎带共用同一张 —— 层与层的差别来自半径和 alpha
    fluidField?.render(time);
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.save();
    drawWash(time);
    if (fibers) drawFibers(time);
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
    fluidField?.resize(ribbonBuffer.width, ribbonBuffer.height);
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
      fluidField?.destroy();
    },
  };
}
