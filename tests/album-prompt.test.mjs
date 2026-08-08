// album-prompt — 封面 prompt 模板的约束。
// 文字是烤进图里的，四本相册看起来是不是一套完全取决于这段模板，
// 所以"共享的部分必须真的共享"这件事值得被钉住，而不是靠自觉。
import assert from 'node:assert/strict';
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
    'Warm off-white paper ground',
    'a single thin cobalt-blue line',
    'one small warm-yellow accent, under 3%',
    'the upper-left quadrant stays empty paper',
    'Avoid: dark background',
  ]) {
    for (let i = 0; i < prompts.length; i += 1) {
      assert.ok(prompts[i].includes(shared), `${ALBUMS[i]} 少了共享片段「${shared}」`);
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
    assert.match(prompt, /only characters anywhere in the image/);
    assert.match(prompt, /No other text, no numbers, no labels/);
  }
});

test('中文标题控制在 2–4 字，英文是单个全大写的词', () => {
  for (const album of ALBUMS) {
    const { zh, en } = MOTIFS[album];
    // 大字模型画得对，小字不行；标题越短越稳
    assert.ok(zh.length >= 2 && zh.length <= 4, `${album} 的中文标题「${zh}」应为 2–4 字`);
    assert.match(en, /^[A-Z]+$/, `${album} 的英文词「${en}」应是单个全大写单词`);
  }
});

test('四本的意象各不相同 —— 共享的是语言，不是画面', () => {
  const motifs = ALBUMS.map((album) => MOTIFS[album].motif);
  assert.equal(new Set(motifs).size, motifs.length, '有两本的意象重复了');
  const titles = ALBUMS.map((album) => MOTIFS[album].zh);
  assert.equal(new Set(titles).size, titles.length, '有两本的标题重复了');
});
