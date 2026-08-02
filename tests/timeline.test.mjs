import assert from 'node:assert/strict';
import test from 'node:test';

import {
  START_YEAR,
  axisPosition,
  axisYears,
  WALK_SPAN_MS,
  labelStride,
  revealDelay,
  shouldLabelYear,
  todayPosition,
} from '../src/lib/timeline.ts';

test('the axis covers every year from the start year through today', () => {
  const years = axisYears(2026);

  assert.equal(years[0], START_YEAR);
  assert.equal(years.at(-1), 2026);
  assert.equal(years.length, 2026 - START_YEAR + 1);
});

test('years are evenly spaced — the axis measures years, not elapsed time', () => {
  const years = axisYears(2026);
  const stops = years.map((year) => axisPosition(year, 1, 2026));
  const gaps = stops.slice(1).map((stop, index) => stop - stops[index]);

  for (const gap of gaps) {
    assert.ok(Math.abs(gap - gaps[0]) < 1e-9, `uneven year spacing: ${gaps.join(', ')}`);
  }
  assert.equal(stops[0], 0);
});

test('each year owns a segment, so today never overflows the axis', () => {
  // 分母若取「年数 − 1」，最后一年会被压成零宽，今天会跑到 100% 之外
  const lastYearStart = axisPosition(2026, 1, 2026);
  const lastYearEnd = axisPosition(2026, 12, 2026);

  assert.ok(lastYearStart < 1, `last year starts at ${lastYearStart}`);
  assert.ok(lastYearEnd < 1, `last year ends at ${lastYearEnd}`);
  assert.ok(lastYearEnd > lastYearStart);

  const today = todayPosition(new Date(Date.UTC(2026, 11, 31)));
  assert.ok(today <= 1 && today > 0, `today sits at ${today}`);
});

test('a month moves a mark inside its own year and never past the next one', () => {
  const january = axisPosition(2020, 1, 2026);
  const july = axisPosition(2020, 7, 2026);
  const nextJanuary = axisPosition(2021, 1, 2026);

  assert.ok(january < july && july < nextJanuary);
});

test('out-of-range input is clamped instead of escaping the axis', () => {
  assert.equal(axisPosition(1990, 1, 2026), 0);
  assert.ok(axisPosition(2099, 12, 2026) <= 1);
  assert.equal(axisPosition(2020, 0, 2026), axisPosition(2020, 1, 2026));
  assert.equal(axisPosition(2020, 99, 2026), axisPosition(2020, 12, 2026));
});

test('year labels thin out so a fixed-width axis survives more years', () => {
  // 轴宽固定，年份每年多一个：珠子可以一直加，标签必须抽稀
  assert.equal(labelStride(10), 1);
  assert.equal(labelStride(12), 1);
  assert.equal(labelStride(13), 2);
  assert.equal(labelStride(24), 2);
  assert.equal(labelStride(25), 5);
});

test('the first and current year are always labelled, however dense the axis', () => {
  const years = Array.from({ length: 30 }, (_, index) => 2017 + index);

  assert.ok(shouldLabelYear(years[0], years));
  assert.ok(shouldLabelYear(years.at(-1), years));

  const labelled = years.filter((year) => shouldLabelYear(year, years));
  assert.ok(labelled.length < years.length, 'dense axes must drop some labels');
  assert.ok(labelled.length >= 6, `kept too few labels: ${labelled.length}`);
});

test('a tick reveals exactly when the walker reaches it', () => {
  const now = todayPosition(new Date(Date.UTC(2026, 6, 15)));

  // 起点即刻显现，终点正好在他到站那一刻
  assert.equal(revealDelay(0, now), 0);
  assert.equal(revealDelay(now, now), WALK_SPAN_MS);

  // 分母必须是 now 而不是 1：否则末尾的珠子会在他停下之后才冒出来
  const lastYear = axisPosition(2026, 1, 2026);
  assert.ok(revealDelay(lastYear, now) < WALK_SPAN_MS, 'the final year must appear before he stops');
  assert.ok(revealDelay(lastYear, now) > WALK_SPAN_MS * 0.9);
});

test('reveal delays rise monotonically along the axis and never overshoot', () => {
  const now = todayPosition(new Date(Date.UTC(2026, 6, 15)));
  const delays = axisYears(2026).map((year) => revealDelay(axisPosition(year, 1, 2026), now));

  for (let index = 1; index < delays.length; index += 1) {
    assert.ok(delays[index] > delays[index - 1], `delays must increase: ${delays.join(', ')}`);
  }
  assert.ok(Math.max(...delays) <= WALK_SPAN_MS);
  assert.equal(revealDelay(2, now), WALK_SPAN_MS, 'positions past now are clamped');
});
