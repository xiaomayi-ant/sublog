import assert from 'node:assert/strict';
import test from 'node:test';

import { CARET_SPEED, FIRST_DELAY, LINE_GAP, paceLines } from '../src/lib/typewriter.mjs';

// 首屏那两组问句的真实量级：中文短而宽，英文长而窄
const HERO_LINES = [
  { width: 268, characters: 18 }, // 在智力方面，人类和AI的区别是什么？
  { width: 356, characters: 60 }, // In terms of intelligence, what separates a human from an AI?
  { width: 165, characters: 11 }, // AI目前的边界是什么？
  { width: 219, characters: 37 }, // Where are the boundaries of AI today?
];

test('every line advances the caret at the same pixels per second', () => {
  const plans = paceLines(HERO_LINES);
  const speeds = plans.map((plan, index) => HERO_LINES[index].width / (plan.duration / 1000));

  for (const speed of speeds) {
    // 四舍五入到毫秒会带来千分之几的漂移，1 px/s 的容差足够严
    assert.ok(
      Math.abs(speed - CARET_SPEED) < 1,
      `line advances at ${speed.toFixed(2)} px/s, expected ${CARET_SPEED}`,
    );
  }
});

test('a wider line takes proportionally longer, regardless of character count', () => {
  const [chinese, english] = paceLines([HERO_LINES[0], HERO_LINES[1]]);

  // 英文字符数是中文的 3.3 倍，但只宽 33%，所以只该慢 33%
  const widthRatio = HERO_LINES[1].width / HERO_LINES[0].width;
  const durationRatio = english.duration / chinese.duration;

  assert.ok(Math.abs(durationRatio - widthRatio) < 0.01, `duration ratio ${durationRatio} vs width ratio ${widthRatio}`);
  assert.ok(HERO_LINES[1].characters > HERO_LINES[0].characters * 3);
});

test('lines queue one after another with a fixed gap', () => {
  const plans = paceLines(HERO_LINES);

  assert.equal(plans[0].delay, FIRST_DELAY);
  for (let index = 1; index < plans.length; index += 1) {
    const previous = plans[index - 1];
    assert.equal(plans[index].delay, previous.delay + previous.duration + LINE_GAP);
  }
});

test('stepping stays per-character so the reveal reads as typing', () => {
  const plans = paceLines(HERO_LINES);

  plans.forEach((plan, index) => {
    assert.equal(plan.steps, HERO_LINES[index].characters);
  });
});

test('degenerate input cannot produce a zero or negative schedule', () => {
  const [plan] = paceLines([{ width: 0, characters: 0 }]);

  assert.ok(plan.duration >= 1);
  assert.ok(plan.steps >= 1);
  assert.throws(() => paceLines(HERO_LINES, { caretSpeed: 0 }), RangeError);
});
