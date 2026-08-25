// album-prompt — 封面 prompt 模板的约束。
// 四本相册看起来是不是一套，几乎全靠这段模板 —— 每本只有意象一处不同，
// 所以"共享的部分必须真的共享"值得被钉住，而不是靠自觉。
//
// 标题不在这里了：图里一个字都不烤，标题由 scripts/compose-title.mjs
// 用真实字体合成。模板要负责的是**给它留出位置**，见下面那条版式断言。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { albumPrompt, MOTIFS } from '../src/lib/album-prompt.ts';

const ALBUMS = Object.keys(MOTIFS);

test('prompt 不会无限膨胀', () => {
  // 原来钉的是 1200，出处写的是"skill 的规定"—— 仓库和文档里都查不到依据，
  // 而且实测有害：它逼着把关键约束压成从句，压出来的图就是那批碎石头。
  // 真正有效的是写法而不是长度（见 album-prompt.ts 里 FORBIDDEN 上方的记录）。
  // 这里只防膨胀，不再当设计约束。
  for (const album of ALBUMS) {
    const length = albumPrompt(album).length;
    assert.ok(length <= 1800, `${album} 的 prompt 有 ${length} 字符，过长了`);
  }
});

test('描述主体时不用否定式表述', () => {
  // 实测：写 "no border" 模型反而画出了边框，换成"线跑出画面"才成立。
  // 图像模型对否定的执行力很差。禁止项那一段（Avoid: …）是例外 ——
  // 它是行业惯例且实测有效，所以只检查各本自己的意象与版式。
  for (const album of ALBUMS) {
    const own = `${MOTIFS[album].motif} ${MOTIFS[album].layout ?? ''}`;
    for (const bad of [/\bno border\b/i, /\bwithout a border\b/i, /\bno edges?\b/i]) {
      assert.doesNotMatch(own, bad, `${album} 的意象里用了否定式表述，改成正面描述`);
    }
  }
});

test('四本共享同一段基底', () => {
  const prompts = ALBUMS.map((album) => albumPrompt(album));
  for (const shared of ['Warm leads', 'under 3%', 'Avoid: warm or cream paper']) {
    for (let i = 0; i < prompts.length; i += 1) {
      assert.ok(prompts[i].includes(shared), `${ALBUMS[i]} 少了共享片段「${shared}」`);
    }
  }
});

test('共享版式必须仍是多数', () => {
  // 单本可以用 layout 覆盖，但覆盖多了"四本一套"就散了。
  //
  // 原来这条钉死"只有 llm 能例外"，加 notes 时就红了 —— 而那次例外是对的：
  // 涟漪要铺满整幅才没有边界，容不下"主体偏右下、标题缩在左上的纸面"。
  // 把断言从"名单"改成"比例"：守住的是实质（多数一致），而不是某个快照。
  const custom = ALBUMS.filter((a) => MOTIFS[a].layout);
  assert.ok(
    custom.length * 2 <= ALBUMS.length,
    `自定义版式的有 ${custom.length}/${ALBUMS.length} 本（${custom.join(', ')}）——` +
      '过半就不叫"共享骨架"了',
  );
  // 没覆盖的那些必须真的吃到共享版式
  for (const album of ALBUMS.filter((a) => !MOTIFS[a].layout)) {
    assert.match(albumPrompt(album), /upper-left quadrant stays empty paper/);
  }
  // 覆盖的那些也得自己留出那块安静的地方 —— 标题要合成上去，
  // 底下不能是棋盘或者涟漪。原来这条查的是 layout 里有没有 "title"，
  // 那是标题还烤在图里时的写法；现在图里不提标题，要查的是**留白**本身。
  for (const album of custom) {
    assert.match(
      MOTIFS[album].layout,
      /stays (as )?(plain|calm|empty)/,
      `${album} 覆盖了版式却没留出安静的区域，标题合成上去会压在画面上`,
    );
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

test('图里一个字都不烤', () => {
  // 曾经是"只烤大标题"。四本因此永远统一不了 —— 图像模型没有字体文件这个概念，
  // "high-contrast serif" 每次采样都重画一次字形，四本抽到四种字重字宽，
  // 而且每次重出再抽一次。改成图里不出现任何文字，标题本地合成。
  //
  // 这条同时挡住另一件事：模型画小号的编号、日期、标签几乎必然出错，
  // 一句话全禁掉比事后挑错便宜。
  for (const album of ALBUMS) {
    const prompt = albumPrompt(album);
    assert.match(prompt, /No text, no lettering, no characters, no numbers, no watermark/);
    // 意象里也不许再把标题塞回去 —— 引号里的词就是要求模型写字
    assert.doesNotMatch(
      `${MOTIFS[album].motif} ${MOTIFS[album].layout ?? ''}`,
      /"[^"]+"/,
      `${album} 的意象里还有带引号的字，那是在要求模型画字`,
    );
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
