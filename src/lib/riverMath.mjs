const DEFAULTS = {
  bend: 1,
  width: 1,
  turbulence: 0.5,
  time: 0,
  progress: 0,
  seed: 17,
  curvatureLimit: true,
  // 画布 宽/高。中心线活在归一化单位方格里，但会被各向异性地画到非方形画布上；
  // 法线和偏移必须在按纵横比校正过的空间里算，否则弯道内侧会折出尖点。
  // 1 表示不校正（旧行为），仅用于纯数学测试。
  aspect: 1,
};

// 半宽相对曲率半径的上限：比值 < 1 才不会折出尖点，0.78 留 22% 余量。
const CUSP_LIMIT = 0.78;
// 饱和指数：越大，越只在临界处才收窄，平缓河段几乎不受影响。
const CUSP_SOFTNESS = 4;

// 平滑饱和，取代硬 Math.min —— 硬截断会在钳制生效处留下宽度突变的折痕。
function softCuspLimit(halfWidth, curvature) {
  if (!(curvature > 1e-6)) return halfWidth;
  const ratio = (halfWidth * curvature) / CUSP_LIMIT;
  return halfWidth * (1 + ratio ** CUSP_SOFTNESS) ** (-1 / CUSP_SOFTNESS);
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function hash(integer, seed) {
  let value = Math.imul(integer ^ Math.imul(seed, 374761393), 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function smoothNoise(value, seed = 0) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  return lerp(hash(lower, seed), hash(lower + 1, seed), fade(fraction));
}

/**
 * 分形布朗运动：把同一种噪声按倍频叠起来。
 *
 * smoothNoise 只有一个尺度，读起来是规整的起伏；叠上去之后大尺度的涌和
 * 小尺度的皱同时在，才像水。频率步进取 2.03 而不是 2：整数倍频会让各层的
 * 峰周期性对齐，叠出肉眼可见的规律条纹。
 *
 * 结果除以振幅之和归一回 [0, 1]，与 smoothNoise 的值域一致 —— 调用处那些
 * (x - 0.5) * 幅度 的写法不必跟着改。
 */
export function fbm(value, seed = 0, octaves = 4) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalisation = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += amplitude * smoothNoise(value * frequency + octave * 19.7, seed + octave * 101);
    normalisation += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return total / normalisation;
}

/**
 * 域扭曲：先用一层噪声去偏移采样坐标，再在偏移后的坐标上取噪声。
 *
 * 直接叠噪声得到的是"原地起伏"，扭曲之后才有"被水拖着走"的样子。
 * 流体质感与缎带质感的分界就在这里 —— 前者的纹理被流动拉长、错开，
 * 后者只是整体平移。
 */
export function warpedFbm(value, seed = 0, strength = 0.6) {
  const warp = fbm(value * 0.5, seed + 613, 3) - 0.5;
  return fbm(value + warp * strength, seed);
}

function gaussian(value, center, spread) {
  const distance = (value - center) / spread;
  return Math.exp(-(distance * distance));
}

function optionsWithDefaults(options = {}) {
  return { ...DEFAULTS, ...options };
}

export function sampleCenterline(position, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const s = clamp(position, 0, 1);
  const progress = clamp(options.progress, 0, 1);
  const bend = Math.max(0, options.bend);

  const travellingBend = lerp(-0.16, 0.13, progress);
  const longCurve =
    0.115 * Math.sin(Math.PI * (s * 1.82 + 0.08 + progress * 0.22)) +
    0.055 * Math.sin(Math.PI * (s * 4.1 - 0.38 - progress * 0.31));
  const scrollMorph =
    travellingBend * gaussian(s, 0.52, 0.23) +
    lerp(0.055, -0.075, progress) * gaussian(s, 0.79, 0.14);
  // 河岸基本是确定的：这里只留极慢的漂移（横穿全河约 230 秒），近乎静止。
  // 流动感必须来自水体内部的纹理平移，而不是让岸线上下摆——那会读成丝带。
  const organic =
    (smoothNoise(s * 4.6 - options.time * 0.02, options.seed) - 0.5) *
    0.045 *
    clamp(options.turbulence, 0, 1.5);

  return {
    x: lerp(-0.12, 1.12, s),
    y: 0.51 + bend * (longCurve + scrollMorph) + organic,
  };
}

export function riverWidth(position, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const s = clamp(position, 0, 1);
  const widthControl = Math.max(0.05, options.width);
  const irregularity =
    0.88 +
    0.17 * smoothNoise(s * 5.2 + options.time * 0.018, options.seed + 31);
  const downstreamBasin = 1 + 0.34 * gaussian(s, 0.72, 0.2);
  const sourceTaper = 0.78 + 0.22 * Math.min(1, s / 0.17);

  return 0.091 * widthControl * irregularity * downstreamBasin * sourceTaper;
}

export function centerlineCurvature(position, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const s = clamp(position, 0, 1);
  const aspect = Math.max(1e-6, options.aspect);
  const epsilon = 0.004;
  const before = sampleCenterline(clamp(s - epsilon, 0, 1), options);
  const center = sampleCenterline(s, options);
  const after = sampleCenterline(clamp(s + epsilon, 0, 1), options);
  // x 乘 aspect：两轴统一成"画布高度"单位，曲率才是屏幕上真正看到的那个曲率
  const firstX = ((after.x - before.x) / (2 * epsilon)) * aspect;
  const firstY = (after.y - before.y) / (2 * epsilon);
  const secondX = ((after.x - 2 * center.x + before.x) / (epsilon * epsilon)) * aspect;
  const secondY = (after.y - 2 * center.y + before.y) / (epsilon * epsilon);
  const speedSquared = firstX * firstX + firstY * firstY;

  if (speedSquared < 1e-12) return 0;
  return Math.abs(firstX * secondY - firstY * secondX) / Math.pow(speedSquared, 1.5);
}

/**
 * 河道里与半径无关的那一半：中心线、切线、法线、曲率、河宽。
 *
 * 分出来是因为它在一帧内被重复算了很多遍 —— 八层水彩、五十条纤维、三股亮纹
 * 都落在各自的 s 网格上，同一个 s 的这些量对所有图层是同一份。渲染器按帧缓存它，
 * 每层只再算与半径有关的那一小段（见 ribbonEdges）。
 *
 * 拆分不改变任何数值：buildRibbonSample 现在由这两半拼出来，结果逐位相同。
 */
export function buildRibbonGeometry(position, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const s = clamp(position, 0, 1);
  const aspect = Math.max(1e-6, options.aspect);
  const epsilon = 0.0008;
  const before = sampleCenterline(clamp(s - epsilon, 0, 1), options);
  const after = sampleCenterline(clamp(s + epsilon, 0, 1), options);
  const center = sampleCenterline(s, options);
  // 切线／法线都在校正后的空间里，left/right 再换算回归一化 x
  const deltaX = (after.x - before.x) * aspect;
  const deltaY = after.y - before.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const tangent = {
    x: deltaX / length,
    y: deltaY / length,
  };
  const normal = {
    x: -tangent.y,
    y: tangent.x,
  };

  return {
    center,
    tangent,
    normal,
    curvature: centerlineCurvature(s, options),
    baseWidth: riverWidth(s, options),
    aspect,
  };
}

/** 与半径有关的那一半：给定几何与半径，算出两岸。曲率钳制发生在这里。 */
export function ribbonEdges(geometry, radius = 1, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const { center, normal, curvature, baseWidth, aspect } = geometry;
  const requestedHalfWidth = baseWidth * radius;
  const halfWidth =
    options.curvatureLimit === false
      ? requestedHalfWidth
      : softCuspLimit(requestedHalfWidth, curvature);
  const offsetX = (normal.x * halfWidth) / aspect;
  const offsetY = normal.y * halfWidth;

  return {
    width: halfWidth * 2,
    left: {
      x: center.x + offsetX,
      y: center.y + offsetY,
    },
    right: {
      x: center.x - offsetX,
      y: center.y - offsetY,
    },
  };
}

export function buildRibbonSample(position, radius = 1, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const geometry = buildRibbonGeometry(position, options);

  return {
    center: geometry.center,
    tangent: geometry.tangent,
    normal: geometry.normal,
    curvature: geometry.curvature,
    ...ribbonEdges(geometry, radius, options),
  };
}
