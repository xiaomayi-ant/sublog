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

async function tokenAlphas() {
  const css = await readFile(path.join(projectRoot, 'src/styles/tokens.css'), 'utf8');
  const values = new Map();
  const pattern = /(--[a-z0-9-]+)\s*:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s*;/g;
  for (const [, name, r, g, b, a] of css.matchAll(pattern)) {
    values.set(name, { rgb: [Number(r), Number(g), Number(b)], alpha: Number(a) });
  }
  return values;
}

function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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

// 首屏两行问句压在河上。带 alpha 的墨会和身后的底混合，所以对比度取决于
// 河面而不是白底 —— 白底上达标不代表这里达标（--color-ink-soft 就是 4.84 → 3.81）。
//
// 这个底色是量出来的，不是猜的：在 1345×669、dpr 2 下对问句所在区域连采 40 帧，
// 取显示色最暗的那一个像素。河的色阶若再调深，必须重新量并更新这个常量。
const DARKEST_RIVER_UNDER_QUESTIONS = [177, 212, 231];
const WCAG_AA_SMALL_TEXT = 4.5;

test('hero questions stay readable where they actually sit — on the river', async () => {
  const alphas = await tokenAlphas();

  for (const token of ['--color-ink-on-water', '--color-ink-on-water-faint']) {
    const declared = alphas.get(token);
    assert.ok(declared, `tokens.css 里找不到 ${token}`);

    const { rgb, alpha } = declared;
    // 有效前景 = 墨按 alpha 混进它身后的河面
    const effective = rgb.map(
      (channel, index) => channel * alpha + DARKEST_RIVER_UNDER_QUESTIONS[index] * (1 - alpha),
    );
    const ratio = contrast(effective, DARKEST_RIVER_UNDER_QUESTIONS);

    assert.ok(
      ratio >= WCAG_AA_SMALL_TEXT,
      `${token}（alpha ${alpha}）在最暗河面上只有 ${ratio.toFixed(2)}:1，低于 ${WCAG_AA_SMALL_TEXT}`,
    );
  }
});

test('the hero questions keep a visible weight difference between the two lines', async () => {
  // 修对比度不能把层次一起修掉：英文行仍应比中文行淡。
  const alphas = await tokenAlphas();
  const strong = alphas.get('--color-ink-on-water').alpha;
  const faint = alphas.get('--color-ink-on-water-faint').alpha;

  assert.ok(faint < strong, `英文行（${faint}）应当比中文行（${strong}）淡`);
});

test('the renderer keeps no colour outside the declared tables', async () => {
  // 这个文件先后出现过三套颜色：WASH_LADDER、核心渐变那四个色标、以及纤维条纹的
  // rgba() 字面值。前两套已经收进常量表；纤维那套躲过了这条测试的上一版 ——
  // 因为正则写的是 rgb\( ，匹配不到 rgba\( 。现在两种都抓。
  const source = await readFile(path.join(projectRoot, 'src/lib/riverRenderer.mjs'), 'utf8');
  const afterTables = source.slice(source.indexOf('const CENTRE_FLOW_PIXELS_PER_SECOND'));
  const literals = afterTables.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) ?? [];

  assert.deepEqual(literals, [], `声明表之外还有写死的颜色：${literals.join(' / ')}`);
});

test('the fibre tones come from the wash ladder', async () => {
  // 纤维原来用 rgba(64,186,206) 和 rgba(74,152,216) —— 与色阶接近但都不相等，
  // 是这个文件里的第三套颜色。现在它们引用 WASH_LADDER 的档位。
  const source = await readFile(path.join(projectRoot, 'src/lib/riverRenderer.mjs'), 'utf8');
  const start = source.indexOf('const FIBER_TONES');
  assert.ok(start >= 0, '找不到 FIBER_TONES');
  // 只截这张表本身，不要连着后面的常量一起 —— 否则加一个新常量就会误报
  const table = source.slice(start, source.indexOf(']);', start) + 3);

  assert.ok(table.includes('WASH_LADDER'), '纤维色调应当引用 WASH_LADDER');
  // 白沫那一档是例外：纯白不属于水的色阶，它是水面反光
  const strays = table.match(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]/g) ?? [];
  assert.deepEqual(strays, ['[255, 255, 255]'], `纤维色调里有游离的色值：${strays.join(' / ')}`);
});
