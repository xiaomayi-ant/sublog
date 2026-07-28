const DEFAULTS = {
  bend: 1,
  width: 1,
  turbulence: 0.5,
  time: 0,
  progress: 0,
  seed: 17,
};

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
  const organic =
    (smoothNoise(s * 4.6 + options.time * 0.026, options.seed) - 0.5) *
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

export function buildRibbonSample(position, radius = 1, suppliedOptions = {}) {
  const options = optionsWithDefaults(suppliedOptions);
  const s = clamp(position, 0, 1);
  const epsilon = 0.0008;
  const before = sampleCenterline(clamp(s - epsilon, 0, 1), options);
  const after = sampleCenterline(clamp(s + epsilon, 0, 1), options);
  const center = sampleCenterline(s, options);
  const deltaX = after.x - before.x;
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
  const halfWidth = riverWidth(s, options) * radius;
  const offsetX = normal.x * halfWidth;
  const offsetY = normal.y * halfWidth;

  return {
    center,
    tangent,
    normal,
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
