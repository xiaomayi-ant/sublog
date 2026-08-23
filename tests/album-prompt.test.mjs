// album-prompt — 封面 prompt 模板的约束。
// 文字是烤进图里的，四本相册看起来是不是一套完全取决于这段模板，
// 所以"共享的部分必须真的共享"这件事值得被钉住，而不是靠自觉。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { albumPrompt, MOTIFS } from '../src/lib/album-prompt.ts';

const ALBUMS = Object.keys(MOTIFS);

test('每一本的 prompt 都在 1200 字符以内', () => {
  // skill 的规定。超了模型会开始丢前面的约束，而丢掉的通常正是色彩和禁止项 ——
  // 表现为"某一期忽然不像这一套了"，且很难归因。
  for (const album of ALBUMS) {
    const length = albumPrompt(album).length;
    assert.ok(length <= 1200, `${album} 的 prompt 有 ${length} 字符，超过 1200`);
  }
});

test('四本共享同一段基底与版式骨架', () => {
  const prompts = ALBUMS.map((album) => albumPrompt(album));
  for (const shared of [
    // BASE 从「只准冷」改成了冷暖双轴（见 album-prompt.ts 的 FORBIDDEN 注释）
    'Two axes only',
    'under 3%',
    'upper-left quadrant stays empty paper',
    'Avoid: warm or cream paper',
  ]) {
    for (let i = 0; i < prompts.length; i += 1) {
      assert.ok(prompts[i].includes(shared), `${ALBUMS[i]} 少了共享片段「${shared}」`);
    }
  }
});

test('色彩配方的每个色值都来自 tokens.css，不是抄的', async () => {
  // 第一版的配方是手写英文散文，照搬自一套早已废弃的旧 tokens，站点换色后
  // 没跟着走 —— 实测两张已出的图有 99% 的像素落在暖黄相，站点主色（水）
  // 一个像素都没有。所以色值改成从 tokens.css 解析，这条守着别再抄回去。
  const tokens = await readFile(
    path.join(import.meta.dirname, '../src/styles/tokens.css'),
    'utf8',
  );
  const expand = (hex) =>
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const value = (name) =>
    expand(tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))[1].toLowerCase());

  const prompt = albumPrompt('harness');
  for (const name of ['--color-bg', '--water-100', '--water-700',
    '--color-ink', '--color-sun', '--color-ember']) {
    assert.ok(
      prompt.includes(value(name)),
      `prompt 里没有 ${name} 的当前色值 ${value(name)} —— 配方和 tokens 又漂开了`,
    );
  }
});

test('配方点名禁止那些自带暖色相的词', () => {
  // 禁的是卡其那一段（72°–110°），不是"暖" —— 站点本来就有暖轴。
  // brass / vellum / kraft 这些材质词自带 70–90°，实测里正是它们把图带到了
  // 平均色相 85°（--color-sun 的位置）。红铜 40°–55° 反而是合法的。
  const prompt = albumPrompt('harness');
  for (const word of ['brass', 'ochre', 'kraft', 'sepia', 'olive', 'khaki']) {
    assert.match(prompt, new RegExp(`Avoid:[^.]*${word}`), `禁止项里少了「${word}」`);
  }
  // 意象里也不许再出现它们
  for (const album of ALBUMS) {
    for (const word of ['brass', 'vellum', 'kraft', 'ochre']) {
      assert.ok(
        !MOTIFS[album].motif.toLowerCase().includes(word),
        `${album} 的意象里还留着暖色材质「${word}」`,
      );
    }
  }
});

test('只烤大标题，并且明确禁止其他任何文字', () => {
  for (const album of ALBUMS) {
    const prompt = albumPrompt(album);
    const { zh, en } = MOTIFS[album];
    assert.ok(prompt.includes(`"${zh}"`), `${album} 的中文标题没进 prompt`);
    assert.ok(prompt.includes(`"${en}"`), `${album} 的英文词没进 prompt`);
    // 这一句是防小字出错的唯一手段 —— 图像模型画小号编号、日期几乎必然出错
    assert.match(prompt, /only characters in the image/);
    assert.match(prompt, /no other text, numbers, labels or watermark/);
  }
});

test('标题形态：有中文名的配全大写英文小字，没有的直接拿原词当主标题', () => {
  for (const album of ALBUMS) {
    const { zh, en } = MOTIFS[album];

    // zh === en 表示这一本没有中文对应（harness）。这时原词自己就是主标题大字，
    // 不再是谁的副标题，所以 Title Case 而非全大写 —— 全大写读作标签，
    // Title Case 读作一个词。只要求它是单个英文词。
    if (zh === en) {
      assert.match(en, /^[A-Za-z]+$/, `${album} 的标题「${en}」应是单个英文词`);
      continue;
    }

    // 大字模型画得对，小字不行；标题越短越稳
    assert.ok(zh.length >= 2 && zh.length <= 4, `${album} 的中文标题「${zh}」应为 2–4 字`);
    // 这一档的 en 压在中文底下当小字，全大写才立得住
    assert.match(en, /^[A-Z]+$/, `${album} 的英文词「${en}」应是单个全大写单词`);
  }
});

test('四本的意象各不相同 —— 共享的是语言，不是画面', () => {
  const motifs = ALBUMS.map((album) => MOTIFS[album].motif);
  assert.equal(new Set(motifs).size, motifs.length, '有两本的意象重复了');
  const titles = ALBUMS.map((album) => MOTIFS[album].zh);
  assert.equal(new Set(titles).size, titles.length, '有两本的标题重复了');
});
