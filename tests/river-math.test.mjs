import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRibbonSample,
  centerlineCurvature,
  clamp,
  riverWidth,
  sampleCenterline,
  smoothNoise,
} from '../src/lib/riverMath.mjs';

const baseOptions = {
  bend: 1,
  width: 1,
  turbulence: 0.55,
  time: 2.4,
  progress: 0.4,
  seed: 17,
};

test('smooth noise is deterministic, bounded, and locally continuous', () => {
  const first = smoothNoise(2.25, 17);
  const repeated = smoothNoise(2.25, 17);
  const nearby = smoothNoise(2.251, 17);

  assert.equal(first, repeated);
  assert.ok(first >= 0 && first <= 1);
  assert.ok(Math.abs(first - nearby) < 0.02);
});

test('the centerline stays finite while scroll progress changes its composition', () => {
  const start = sampleCenterline(0.52, { ...baseOptions, progress: 0 });
  const end = sampleCenterline(0.52, { ...baseOptions, progress: 1 });

  for (const point of [start, end]) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
  }

  assert.ok(Math.hypot(start.x - end.x, start.y - end.y) > 0.03);
});

test('river width is positive, non-constant, and scales with the width control', () => {
  const narrow = riverWidth(0.22, { ...baseOptions, width: 0.7 });
  const wide = riverWidth(0.22, { ...baseOptions, width: 1.4 });
  const downstream = riverWidth(0.72, { ...baseOptions, width: 1.4 });

  assert.ok(narrow > 0);
  assert.ok(wide > narrow * 1.8);
  assert.notEqual(wide, downstream);
});

test('ribbon banks are symmetric around the centerline and normal to its tangent', () => {
  const sample = buildRibbonSample(0.43, 0.8, baseOptions);
  const leftVector = {
    x: sample.left.x - sample.center.x,
    y: sample.left.y - sample.center.y,
  };
  const rightVector = {
    x: sample.right.x - sample.center.x,
    y: sample.right.y - sample.center.y,
  };

  assert.ok(Math.abs(Math.hypot(leftVector.x, leftVector.y) - Math.hypot(rightVector.x, rightVector.y)) < 1e-9);
  assert.ok(Math.abs(leftVector.x + rightVector.x) < 1e-9);
  assert.ok(Math.abs(leftVector.y + rightVector.y) < 1e-9);
  assert.ok(Math.abs(leftVector.x * sample.tangent.x + leftVector.y * sample.tangent.y) < 1e-6);
});

test('wide ribbons stay below the local cusp limit through sharp bends', () => {
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

test('clamp protects scroll and control boundaries', () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
  assert.equal(clamp(4, 0, 1), 1);
});
