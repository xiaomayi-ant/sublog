import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRibbonSample,
  centerlineCurvature,
  clamp,
  fbm,
  riverWidth,
  sampleCenterline,
  smoothNoise,
  warpedFbm,
} from "../src/lib/riverMath.mjs";

const baseOptions = {
  bend: 1,
  width: 1,
  turbulence: 0.55,
  time: 2.4,
  progress: 0.4,
  seed: 17,
};

test("smooth noise is deterministic, bounded, and locally continuous", () => {
  const first = smoothNoise(2.25, 17);
  const repeated = smoothNoise(2.25, 17);
  const nearby = smoothNoise(2.251, 17);

  assert.equal(first, repeated);
  assert.ok(first >= 0 && first <= 1);
  assert.ok(Math.abs(first - nearby) < 0.02);
});

test("fbm is deterministic, stays in the same range as one octave, and is locally continuous", () => {
  const first = fbm(2.25, 17);
  const repeated = fbm(2.25, 17);
  const nearby = fbm(2.251, 17);

  assert.equal(first, repeated);
  // 归一化过，值域必须和 smoothNoise 一致 —— 调用处按 [0,1] 的语义在用它
  assert.ok(first >= 0 && first <= 1);
  // 最细那一档倍频约为基频的 8 倍，局部连续性相应放宽，但仍必须连续
  assert.ok(Math.abs(first - nearby) < 0.02);
});

test("fbm carries detail that a single octave does not", () => {
  // 单倍频在细尺度上几乎是直线；叠了四层之后，同样一小段里应当能读出更多起伏。
  // 用相邻采样差的总变差来量：这是"多尺度"唯一可证伪的表现。
  function totalVariation(sample) {
    let sum = 0;
    let previous = sample(0);
    for (let index = 1; index <= 400; index += 1) {
      const current = sample(index / 400);
      sum += Math.abs(current - previous);
      previous = current;
    }
    return sum;
  }

  const single = totalVariation((s) => smoothNoise(s * 8, 17));
  const layered = totalVariation((s) => fbm(s * 8, 17));

  assert.ok(layered > single * 1.3, `expected more detail: ${layered} vs ${single}`);
});

test("domain warp shifts the field without leaving its range", () => {
  const plain = fbm(1.7, 23);
  const warped = warpedFbm(1.7, 23);

  assert.equal(warped, warpedFbm(1.7, 23));
  assert.ok(warped >= 0 && warped <= 1);
  // 扭曲必须真的改变了采样位置，否则这个函数等于白加
  assert.notEqual(warped, plain);
  // strength 为 0 时退化回未扭曲的 fbm —— 幅度参数是有意义的
  assert.equal(warpedFbm(1.7, 23, 0), plain);
});

test("the centerline stays finite while scroll progress changes its composition", () => {
  const start = sampleCenterline(0.52, { ...baseOptions, progress: 0 });
  const end = sampleCenterline(0.52, { ...baseOptions, progress: 1 });

  for (const point of [start, end]) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
  }

  assert.ok(Math.hypot(start.x - end.x, start.y - end.y) > 0.03);
});

test("river width is positive, non-constant, and scales with the width control", () => {
  const narrow = riverWidth(0.22, { ...baseOptions, width: 0.7 });
  const wide = riverWidth(0.22, { ...baseOptions, width: 1.4 });
  const downstream = riverWidth(0.72, { ...baseOptions, width: 1.4 });

  assert.ok(narrow > 0);
  assert.ok(wide > narrow * 1.8);
  assert.notEqual(wide, downstream);
});

test("ribbon banks are symmetric around the centerline and normal to its tangent", () => {
  const sample = buildRibbonSample(0.43, 0.8, baseOptions);
  const leftVector = {
    x: sample.left.x - sample.center.x,
    y: sample.left.y - sample.center.y,
  };
  const rightVector = {
    x: sample.right.x - sample.center.x,
    y: sample.right.y - sample.center.y,
  };

  assert.ok(
    Math.abs(
      Math.hypot(leftVector.x, leftVector.y) -
        Math.hypot(rightVector.x, rightVector.y),
    ) < 1e-9,
  );
  assert.ok(Math.abs(leftVector.x + rightVector.x) < 1e-9);
  assert.ok(Math.abs(leftVector.y + rightVector.y) < 1e-9);
  assert.ok(
    Math.abs(
      leftVector.x * sample.tangent.x + leftVector.y * sample.tangent.y,
    ) < 1e-6,
  );
});

test("wide ribbons stay below the local cusp limit through sharp bends", () => {
  const options = {
    ...baseOptions,
    bend: 1.3,
    width: 1.26,
    turbulence: 0.48,
  };

  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    for (let index = 2; index < 99; index += 1) {
      const s = index / 100;
      const curvature = centerlineCurvature(s, { ...options, progress });
      const sample = buildRibbonSample(s, 1.38, { ...options, progress });

      assert.ok(Number.isFinite(curvature));
      assert.ok(curvature >= 0);
      assert.ok(
        sample.width * curvature <= 1.641,
        `offset cusp risk at s=${s}, progress=${progress}`,
      );
    }
  }
});

// 真正决定"弯折处平不平滑"的是屏幕空间里的 半宽×曲率，必须 < 1。
// 归一化空间是个单位方格，画布却是非方形的；不带 aspect 就等于在压扁的空间里算法线。
test("ribbon stays cusp-free in screen space across viewport shapes", () => {
  const options = { ...baseOptions, bend: 1.3, width: 1.26, turbulence: 0.48 };
  const viewports = [
    [1547, 784],
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
  ];

  for (const [viewportWidth, viewportHeight] of viewports) {
    const aspect = viewportWidth / viewportHeight;

    // 水体现在顺流推移，形状随时间明显变化，所以时间轴也要扫
    for (const time of [0, 2.7, 5.4, 8.1]) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        for (let index = 2; index < 99; index += 1) {
          const s = index / 100;
          const shaped = { ...options, progress, aspect, time };
          const curvature = centerlineCurvature(s, shaped);
          const sample = buildRibbonSample(s, 1.38, shaped);

          assert.ok(
            (sample.width / 2) * curvature < 1,
            `cusp at s=${s}, progress=${progress}, time=${time}, viewport=${viewportWidth}x${viewportHeight}`,
          );
        }
      }
    }
  }
});

test("aspect correction keeps the banks perpendicular and evenly thick on screen", () => {
  const aspect = 1547 / 784;
  const options = { ...baseOptions, bend: 1.3, width: 1.26, aspect };
  let worstCosine = 0;
  let worstThicknessError = 0;

  for (let index = 5; index < 96; index += 1) {
    const s = index / 100;
    const sample = buildRibbonSample(s, 0.8, options);
    // 参照切线独立算出来，不用 sample.tangent —— 否则法线与它天然垂直，断言是空的
    const before = sampleCenterline(s - 0.0008, options);
    const after = sampleCenterline(s + 0.0008, options);
    const screenTangent = {
      x: (after.x - before.x) * aspect,
      y: after.y - before.y,
    };
    const bank = {
      x: (sample.left.x - sample.center.x) * aspect,
      y: sample.left.y - sample.center.y,
    };
    const tangentLength = Math.hypot(screenTangent.x, screenTangent.y);
    const bankLength = Math.hypot(bank.x, bank.y);

    worstCosine = Math.max(
      worstCosine,
      Math.abs(
        (bank.x * screenTangent.x + bank.y * screenTangent.y) /
          (tangentLength * bankLength),
      ),
    );
    worstThicknessError = Math.max(
      worstThicknessError,
      Math.abs(bankLength - sample.width / 2) / (sample.width / 2),
    );
  }

  assert.ok(
    worstCosine < 1e-3,
    `banks are ${worstCosine} off perpendicular on screen`,
  );
  assert.ok(
    worstThicknessError < 1e-9,
    `screen thickness drifts by ${worstThicknessError}`,
  );

  // 省略 aspect 时必须退回"不校正"，纯数学调用方才能不受影响
  const implicit = buildRibbonSample(0.43, 0.8, baseOptions);
  const explicitOne = buildRibbonSample(0.43, 0.8, {
    ...baseOptions,
    aspect: 1,
  });
  assert.deepEqual(implicit.left, explicitOne.left);
  assert.deepEqual(implicit.right, explicitOne.right);
});

test("the cusp limit saturates smoothly instead of stepping", () => {
  const options = {
    ...baseOptions,
    bend: 1.3,
    width: 1.26,
    aspect: 1547 / 784,
  };
  let previous = buildRibbonSample(0.02, 1.38, options).width;
  let worstJump = 0;

  for (let index = 3; index < 99; index += 1) {
    const current = buildRibbonSample(index / 100, 1.38, options).width;
    worstJump = Math.max(
      worstJump,
      Math.abs(current - previous) / Math.max(previous, 1e-6),
    );
    previous = current;
  }

  // 硬 Math.min 会在钳制生效处留下阶跃；平滑饱和不会
  assert.ok(
    worstJump < 0.12,
    `width jumped by ${(worstJump * 100).toFixed(1)}% between neighbouring samples`,
  );
});

test("clamp protects scroll and control boundaries", () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
  assert.equal(clamp(4, 0, 1), 1);
});
