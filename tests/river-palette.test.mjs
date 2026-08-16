// 河的色阶与站点色板必须留在同一条色相轴上。
//
// 背景：riverRenderer 里曾有一句注释声称"前三档对应 tokens.css 的
// --water-100/300/500，最深一档是 --color-river #1651be"。那是错的 ——
// 最深一档实际是 #4298e4，差 (44,71,38)，前三档也各差几到二十几。
//
// 试过按那句注释把两边对齐，河会从青绿转向蓝（28.6% 像素、平均色差 12.32），
// 观感偏离太多。结论是它们本来就该是两套值：--water-* 要承载文字、背着对比度
// 论证，WASH_LADDER 只做图形、在 alpha 0.03~0.09 下叠出来。
//
// 所以这里守的不是"逐值相等"，而是真正成立的那个命题：同一条色相轴。
// 实测两边色相差 0.4° / 0.4° / 2.0° / 9.6° / 10.8°，阈值取 14° 留出余量，
// 又足以拦住把河改成绿色或紫色这类真正的脱轨。
//
// 已有的 murky-water-palette 变异测的是 HTML 上 data-river-palette="clear-water"
// 这个声明，不是色值本身 —— 它拦不住这里的任何一种漂移。

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { WASH_LADDER } from '../src/lib/riverRenderer.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const HUE_TOLERANCE_DEGREES = 14;

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function hue([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  let sector;
  if (max === r) sector = ((g - b) / delta) % 6;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

function hueDistance(a, b) {
  const raw = Math.abs(hue(a) - hue(b));
  return raw > 180 ? 360 - raw : raw;
}

async function tokenValues() {
  const css = await readFile(path.join(projectRoot, 'src/styles/tokens.css'), 'utf8');
  const values = new Map();
  for (const [, name, hex] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    values.set(name, hex.toLowerCase());
  }
  return values;
}

test('every wash step stays on the same hue axis as its sibling token', async () => {
  const tokens = await tokenValues();

  for (const { near, rgb } of WASH_LADDER) {
    const declared = tokens.get(near);
    assert.ok(declared, `tokens.css 里找不到 ${near}`);
    const distance = hueDistance(rgb, hexToRgb(declared));
    assert.ok(
      distance <= HUE_TOLERANCE_DEGREES,
      `rgb(${rgb.join(',')}) 距 ${near} ${declared} 的色相差 ${distance.toFixed(1)}°，超过 ${HUE_TOLERANCE_DEGREES}°`,
    );
  }
});

test('the ladder runs shallow to deep without doubling back', () => {
  // 色阶的意义是深度。亮度必须单调下降 —— 中间冒出一档更亮的，
  // 叠出来会在河心留一条说不清的亮带。
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  for (let index = 1; index < WASH_LADDER.length; index += 1) {
    const previous = luminance(WASH_LADDER[index - 1].rgb);
    const current = luminance(WASH_LADDER[index].rgb);
    assert.ok(
      current < previous,
      `第 ${index + 1} 档比上一档更亮（${current.toFixed(1)} ≥ ${previous.toFixed(1)}）`,
    );
  }
});

test('the renderer keeps no colour outside the two declared tables', async () => {
  // 核心那道渐变原来把四个色标散写在 drawWash 里，其中 rgb(96,182,250)
  // 不属于任何一条色阶，谁也没提过它，只能自己漂。现在它在 CORE_GRADIENT 里。
  const source = await readFile(path.join(projectRoot, 'src/lib/riverRenderer.mjs'), 'utf8');
  const afterTables = source.slice(source.indexOf('const CENTRE_FLOW_PIXELS_PER_SECOND'));
  const literals = afterTables.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) ?? [];

  assert.deepEqual(literals, [], `声明表之外还有写死的颜色：${literals.join(' / ')}`);
});
