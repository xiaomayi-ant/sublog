// 河的色阶与 tokens.css 必须是同一条。
//
// 这两边曾经长期不一致：renderer 最深一档是 #4298e4，而 tokens.css 里
// riverRenderer 那条注释声称它是 --color-river #1651be，差 (44,71,38)。
// 前三档也各差几到二十几。同步全靠一句"改这里要同步改那边"的注释，
// 而注释拦不住漂移 —— 已有的 murky-water-palette 变异测的是 HTML 上
// data-river-palette="clear-water" 这个声明，不是真的色值，所以漂了也没人红。
//
// 这份测试把两边逐档钉死。tokens.css 是唯一真相：那边每个色都背着论证过的
// 对比度和能否承载文字的规则；renderer 的色值是在 alpha 0.03~0.09 下叠出来的。

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { WATER_LADDER } from '../src/lib/riverRenderer.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

async function tokenValues() {
  const css = await readFile(path.join(projectRoot, 'src/styles/tokens.css'), 'utf8');
  const values = new Map();
  for (const [, name, hex] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    values.set(name, hex.toLowerCase());
  }
  return values;
}

test('the wash ladder is exactly the tokens.css water ladder', async () => {
  const tokens = await tokenValues();

  for (const { token, rgb } of WATER_LADDER) {
    const declared = tokens.get(token);
    assert.ok(declared, `tokens.css 里找不到 ${token}`);
    assert.deepEqual(
      rgb,
      hexToRgb(declared),
      `${token}: renderer 用 rgb(${rgb.join(',')})，tokens.css 声明 ${declared}`,
    );
  }
});

test('the ladder runs shallow to deep without doubling back', async () => {
  // 色阶的意义是深度。亮度必须单调下降 —— 中间冒出一档更亮的，
  // 叠出来就会在河心留一条说不清的亮带。
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  for (let index = 1; index < WATER_LADDER.length; index += 1) {
    const previous = luminance(WATER_LADDER[index - 1].rgb);
    const current = luminance(WATER_LADDER[index].rgb);
    assert.ok(
      current < previous,
      `${WATER_LADDER[index].token} 比上一档更亮（${current.toFixed(1)} ≥ ${previous.toFixed(1)}）`,
    );
  }
});

test('the renderer keeps no second hard-coded palette', async () => {
  // 核心那一道渐变原来自带一组色标，与主色阶各漂各的。
  // 除了色阶定义本身，渲染器里不该再出现整数三元组形式的颜色。
  const source = await readFile(path.join(projectRoot, 'src/lib/riverRenderer.mjs'), 'utf8');
  const withoutLadder = source.slice(source.indexOf('const CENTRE_FLOW_PIXELS_PER_SECOND'));
  const literals = withoutLadder.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) ?? [];

  assert.deepEqual(literals, [], `渲染器里还有写死的颜色：${literals.join(' / ')}`);
});
