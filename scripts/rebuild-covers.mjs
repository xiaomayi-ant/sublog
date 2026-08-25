// rebuild-covers — 保住已认可的画面，只换掉标题。
//
// 为什么不重新生成：标题曾经是烤进 prompt 的，而那句
// "左上角一个横跨半幅宽的大标题" 同时是一条**构图约束** —— 它告诉模型画面
// 上部有一大块被占用、主体必须让位。把它删掉再生成，模型没了这堵承重墙，
// 主体就会放大上移，画面和原来差距巨大。删一句话等于换一张图。
//
// 所以这里走另一条：拿已经认可的原图，用图像编辑擦掉那几个字（画面其余部分
// 原样保留），再用真实字体把标题合成回去。画面零风险，字体四本统一。
//
//   原图 → 擦字（约 $0.14/张）→ 合成标题（本地，免费）→ 成品
//
// 用法：
//   NODE_USE_ENV_PROXY=1 node scripts/rebuild-covers.mjs            全部四本
//   NODE_USE_ENV_PROXY=1 node scripts/rebuild-covers.mjs harness    只做一本

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const OSS = 'https://images-aigc.oss-cn-hangzhou.aliyuncs.com/public';
const OUT_DIR = path.join(homedir(), 'Desktop', 'sublog-covers');
const projectRoot = path.resolve(import.meta.dirname, '..');

/**
 * 四本各自的底图。用的是**已经认可的那一版**。
 *
 * notes 特意指向 cover.jpg 而不是 cover-v2.jpg：v2 是把模型自带的那圈白边
 * 裁掉之后的版本，比另外三本窄一圈。装裱边现在由合成统一给，所以底图要用
 * 未裁的原图，四本尺寸才一致。
 */
const BOOKS = {
  llm: { key: '/llm/2026-08/cover.jpg', title: 'LLM' },
  harness: { key: '/harness/2026-07/cover-v3.jpg', title: 'Harness' },
  eval: { key: '/eval/2026-08/cover.jpg', title: 'Eval' },
  notes: { key: '/notes/2026-08/cover.jpg', title: 'Notes' },
};

// 「不留任何残迹」这句是必要的：第一次试跑时左上留下了一片极淡的字影，
// 在浅灰纸面上放大可见。只说 "remove the lettering" 不够，得点明结果。
const ERASE = [
  'Remove the large lettering from this image completely.',
  'Fill that area seamlessly with the same background that surrounds it — the same paper tone,',
  'grain, and lighting — leaving no ghosting, no faint outlines, and no trace that text was ever there.',
  'Change absolutely nothing else: the objects, their positions, colours, shadows, framing,',
  'and the rest of the background must stay exactly as they are.',
].join(' ');

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('缺少 OPENROUTER_API_KEY');
  process.exit(2);
}

const only = process.argv[2];
const targets = only ? { [only]: BOOKS[only] } : BOOKS;
if (only && !BOOKS[only]) {
  console.error(`没有这一本：${only}。可选：${Object.keys(BOOKS).join(' / ')}`);
  process.exit(2);
}

await mkdir(OUT_DIR, { recursive: true });
let spent = 0;

for (const [name, { key: ossKey, title }] of Object.entries(targets)) {
  process.stdout.write(`${name.padEnd(8)}`);

  // 取原图。w_928 与合成的画布同宽，避免中间再缩放一次
  const src = `${OSS}${ossKey}?x-oss-process=image/resize,w_928/format,jpg/quality,Q_92`;
  const raw = Buffer.from(await (await fetch(src)).arrayBuffer());

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-pro-image',
      messages: [{ role: 'user', content: [
        { type: 'text', text: ERASE },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${raw.toString('base64')}` } },
      ]}],
      modalities: ['image', 'text'],
    }),
    signal: AbortSignal.timeout(240000),
  });

  const text = await res.text();
  if (!res.ok) {
    console.log(`  擦字失败 HTTP ${res.status}  ${text.slice(0, 120)}`);
    continue;
  }
  const body = JSON.parse(text);
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  // 成本每张都记 —— 之前凭挂牌价估算，把单价理解错了 35 倍
  const cost = body.usage?.cost ?? 0;
  spent += cost;
  if (!url) {
    console.log(`  没出图  $${cost.toFixed(4)}`);
    continue;
  }

  const erased = path.join(OUT_DIR, `${name}-erased.png`);
  await writeFile(erased, Buffer.from(url.split(',')[1], 'base64'));

  const out = path.join(OUT_DIR, `${name}.png`);
  const r = spawnSync('node', [path.join(projectRoot, 'scripts/compose-title.mjs'), erased, title, out],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log(`  合成失败：${(r.stderr || '').trim().slice(0, 120)}`);
    continue;
  }
  console.log(`  擦字 $${cost.toFixed(4)}  →  ${path.basename(out)}`);
}

console.log(`\n本次花费 $${spent.toFixed(4)}    成品在 ${OUT_DIR}`);
