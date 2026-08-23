// draft-cover — 出封面候选图，一次至少两张，并当场跑色彩验收。
//
// 为什么"至少两张"写进脚本而不是写进流程文档：单张出图会让人对着唯一的结果
// 判断"行不行"，而对着两张才判断得出"哪里不一样、为什么"。这一轮 LLM 封面
// 折腾了十几版，真正定位问题的每一次都是对照：
//
//   S1 vs S2   同一批调用，只差一句 "no border"。写了它的那张反而画出边框 ——
//              图像模型对否定式指令的执行力很差。不对照根本发现不了。
//   A  vs B    同一个模型、同一个意象，短从句版给出碎石头，分句版给出干净的棋局。
//              问题在写法不在模型，也是对照才看出来的。
//
// 靠人记住"要做对照"是不可靠的，所以让工具默认就这么干。
//
// 用法：
//   NODE_USE_ENV_PROXY=1 node scripts/draft-cover.mjs llm          出 2 张
//   NODE_USE_ENV_PROXY=1 node scripts/draft-cover.mjs llm 4        出 4 张
//   NODE_USE_ENV_PROXY=1 node scripts/draft-cover.mjs --about      /about 的配图
//
// NODE_USE_ENV_PROXY=1 不能省：Node 内置 fetch 默认不读 HTTPS_PROXY，
// curl 读而它不读，少了这个会报 ECONNRESET，看着像网络故障。

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const MODEL = process.env.COVER_MODEL || 'gemini-3-pro-image';
const OUT_DIR = path.join(homedir(), 'Desktop', 'sublog-covers', '候选');
const MIN_DRAFTS = 2;

const argv = process.argv.slice(2);
const isAbout = argv.includes('--about');
const album = argv.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const count = Math.max(MIN_DRAFTS, Number(argv.find((a) => /^\d+$/.test(a))) || MIN_DRAFTS);

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('缺少 GEMINI_API_KEY');
  process.exit(2);
}
if (!isAbout && !album) {
  console.error('用法：node scripts/draft-cover.mjs <harness|llm|eval|notes> [张数]');
  console.error('   或：node scripts/draft-cover.mjs --about');
  process.exit(2);
}

const projectRoot = path.resolve(import.meta.dirname, '..');
const mod = await import(path.join(projectRoot, 'src/lib/album-prompt.ts'));
const prompt = isAbout ? mod.aboutPrompt() : mod.albumPrompt(album);
const ratio = isAbout ? '3:4' : '4:5';
const name = isAbout ? 'about' : album;

console.log(`${name}：${prompt.length} 字符，${ratio}，出 ${count} 张\n`);

await mkdir(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const made = [];

for (let i = 1; i <= count; i += 1) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio } },
      }),
      signal: AbortSignal.timeout(240000),
    },
  );
  if (!res.ok) {
    console.error(`  ${i}/${count} HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    continue;
  }
  const body = await res.json();
  const img = (body.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!img) {
    console.error(`  ${i}/${count} 没出图：${body.candidates?.[0]?.finishReason ?? '未知'}`);
    continue;
  }
  const file = path.join(OUT_DIR, `${name}-${stamp}-${i}.png`);
  await writeFile(file, Buffer.from(img.inlineData.data, 'base64'));
  made.push(file);
  console.log(`  ${i}/${count} → ${path.basename(file)}`);
}

if (made.length === 0) {
  console.error('\n一张都没出来。');
  process.exit(1);
}
if (made.length < MIN_DRAFTS) {
  console.error(`\n⚠️ 只出了 ${made.length} 张，没法对照 —— 单张看不出"哪里不一样"。`);
}

console.log(`\n── 色彩验收 ──`);
spawnSync('node', [path.join(projectRoot, 'scripts/verify-image-palette.mjs'), ...made, '--report'], {
  stdio: 'inherit',
});

console.log(`\n候选都在 ${OUT_DIR}`);
console.log('并排看过再挑。定了之后：转 JPG → oss-upload → 写进 frontmatter。');
spawnSync('open', [OUT_DIR], { stdio: 'ignore' });
