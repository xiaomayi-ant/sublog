// verify-image-palette — 出图之后量色相，不达标就打回重出。
//
// 为什么需要它：prompt 只是请求，不是保证。album-prompt.ts 里的配方现在
// 从 tokens.css 读色值，那解决的是"我们要求了什么"；模型给没给是另一回事，
// 而那是外部事实，只能测不能推。
//
// 这套账是量过的。改配方之前站上两张图的实际分布：
//
//                     水色相 160°–250°   暖黄相 40°–110°   平均色相
//   相册封面 harness         0%              99.7%          85°
//   About 配图               0%              99.1%          85°
//
// 站点 --water-100/300/500/700 是 192°/194°/216°/230°，而 85° 正好是
// --color-sun ——「只做高光、配比约 1%」的那一档。也就是说图把 1% 的强调色
// 当成了 99% 的主色。所以下面的阈值不是凭空定的，是照着这个失败样本定的。
//
// ── 为什么按 Lab 色相角而不是 RGB 距离 ─────────────────────────────
//
// 第一版用 RGB 欧氏距离找"最接近的 token"，量出来说两张图有 71%/79% 的面积
// 落在 --water-100 上 —— 完全是假的。暖灰 #e9dcc7 和浅水 #c8f1ee 的 L 和 C
// 几乎相同（88.3/12 对 92.3/14），RGB 距离自然很近，但色相角差了 107°。
// 判断冷暖只能看色相角。这个错误值得记着：指标本身也要验，不是量了就算数。
//
// ── 为什么要起浏览器 ──────────────────────────────────────────────
//
// 图在 OSS 上，跨源拿不到像素（texImage2D 抛 SecurityError、getImageData
// 被污染）。所以本地起一个服务把图代理成同源再交给浏览器解码 —— 项目里没有
// 图像解码依赖，而 Chrome 本来就要装（visual-baseline 也用它）。
//
// 用法：
//   node scripts/verify-image-palette.mjs             扫 dist，不达标则退出码 1
//   node scripts/verify-image-palette.mjs --report    只报告，永远退出码 0
//   node scripts/verify-image-palette.mjs <url>…      只量指定的图
//   node scripts/verify-image-palette.mjs ./cover.png 量本地文件
//
// 本地文件那一路是给重出流程用的：模型出图之后先在本地量，合格了再传 OSS ——
// 传上去再发现不合格，bucket 里就留下一张没人用的图。

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const CHROME =
  process.env.CHROME_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

/**
 * 阈值。照着已知的失败样本定，留了余量 —— 目的是拦住"整张图是暖的"，
 * 不是把每张图都逼成青色。
 *
 * 彩度低于 4 的像素算中性（白纸、灰阶），不参与色相统计：一张克制的图
 * 大半面积本来就该是接近无彩的纸，把它们算进任何一个色相桶都会失真。
 */
const THRESHOLDS = {
  /**
   * 水色要占到**有彩像素**的这个比例。
   *
   * ⚠️ 第一版写的是"占全图像素"，阈值 25%，这是错的。第一张按新配方出的图
   * 被它拦下来了：水色 14.4%、暖色 2.8%、平均色相 187°，而中性像素占 81.1% ——
   * 那是一张以白纸为主、水色作点缀的克制静物，**正是 prompt 要求的**
   * （generous empty space / a specimen plate, not a scene）。
   * 拿全图占比当分母，等于在惩罚留白。
   *
   * 换成有彩像素作分母之后，同两张图：
   *
   *              水色 / 有彩像素
   *   改配方前         0%      （有彩像素 99.8%，其中 99.7% 是暖黄）
   *   改配方后      76.2%      （有彩像素 18.9%，其中绝大多数是水色）
   *
   * 区分度反而更强了 —— 这是修正指标缺陷，不是为了让图过关而放宽标准。
   * 旧图在新指标下依然被拒，而且拒得更彻底。
   */
  minWaterOfChromatic: 60,
  /** 暖黄相的上限，仍然按全图算 —— 它防的是"整张图泛暖"，分母就该是整张图 */
  maxWarmShare: 15,
  /** 有彩像素的平均色相必须落在这个区间里 */
  meanHue: [150, 250],
};

const WATER_HUE = [160, 250];
const WARM_HUE = [40, 110];

/**
 * 彩度低于这个值的像素算中性，不参与色相统计。
 *
 * ⚠️ 第一版取 4，太低了 —— 白纸的冷阴影彩度就在 4~8 之间，它们被算成有彩，
 * 顶着蓝紫色相（260°–280°）稀释了水色的占比。About 那张的直方图把这件事
 * 摆得很清楚：
 *
 *              有彩占全图    最大的色相桶
 *   C ≥ 4         30.7%     260°–280° 占 48.4%   ← 图上根本没有紫色
 *   C ≥ 8          9.1%     220°–240° 占 68.6%   ← 这才是那只青瓷碟
 *   C ≥ 12         5.1%     220°–240° 占 82.6%
 *
 * 取 8：彩度 8 以下人眼读作灰而不是颜色。这不是为了让图过关而放松 ——
 * 改配方前那两张暖图的彩度在 12~27，提高中性门槛救不了它们，水色占比
 * 依然是 0%。复验过。
 */
const NEUTRAL_CHROMA = 8;

const ossUrlsIn = (html) =>
  [...html.matchAll(/https:\/\/[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com[^"'\s]*/g)].map((m) =>
    m[0].replace(/&#38;/g, '&'),
  );

async function collectFromDist() {
  const found = new Set();
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      throw new Error(`没有找到构建产物：${distRoot}\n先跑 npm run build。`);
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.html')) {
        for (const url of ossUrlsIn(await readFile(full, 'utf8'))) found.add(url);
      }
    }
  }
  await walk(distRoot);
  return [...found];
}

/** 页面里跑的那段：解码、转 Lab、按色相角分桶。 */
const PAGE = (targets) => `<!doctype html><meta charset="utf-8"><body><script>
const TARGETS = ${JSON.stringify(targets)};
const NEUTRAL_CHROMA = ${NEUTRAL_CHROMA};
const WATER = ${JSON.stringify(WATER_HUE)};
const WARM = ${JSON.stringify(WARM_HUE)};

function lab(r, g, b) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = k(X), fy = k(Y), fz = k(Z);
  const A = 500 * (fx - fy), Bb = 200 * (fy - fz);
  let h = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: 116 * fy - 16, C: Math.hypot(A, Bb), h };
}

async function measure(url) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('图片加载失败'));
    i.src = url;
  });
  // 缩到 240 宽再统计：色相分布不需要全分辨率，而全尺寸解码几张就很慢
  const W = 240, H = Math.max(1, Math.round((W * img.height) / img.width));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;

  let total = 0, neutral = 0, water = 0, warm = 0, other = 0, hueSum = 0, hueN = 0;
  const inRange = (h, [lo, hi]) => h >= lo && h <= hi;
  for (let i = 0; i < d.length; i += 4) {
    total++;
    const { C, h } = lab(d[i], d[i + 1], d[i + 2]);
    if (C < NEUTRAL_CHROMA) { neutral++; continue; }
    hueSum += h; hueN++;
    if (inRange(h, WATER)) water++;
    else if (inRange(h, WARM)) warm++;
    else other++;
  }
  const pct = (n) => +((100 * n) / total).toFixed(1);
  return {
    size: img.width + '×' + img.height,
    neutralShare: pct(neutral),
    waterShare: pct(water),
    warmShare: pct(warm),
    otherShare: pct(other),
    // 分母是有彩像素：中性的白纸是设计要求的留白，不该拉低水色的分数
    waterOfChromatic: total - neutral ? +((100 * water) / (total - neutral)).toFixed(1) : 0,
    meanHue: hueN ? Math.round(hueSum / hueN) : null,
  };
}

(async () => {
  const out = {};
  for (const [name, url] of Object.entries(TARGETS)) {
    try { out[name] = await measure(url); }
    catch (e) { out[name] = { error: String(e.message || e) }; }
  }
  document.title = 'PALETTE' + JSON.stringify(out);
})();
</script></body>`;

const LOCAL_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

function serve(targets) {
  return new Promise((resolve) => {
    const server = createServer(async (req, reply) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/proxy') {
        try {
          const upstream = await fetch(url.searchParams.get('u'));
          if (!upstream.ok) throw new Error(`上游 ${upstream.status}`);
          reply.writeHead(200, {
            'content-type': upstream.headers.get('content-type') ?? 'image/jpeg',
          });
          reply.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          reply.writeHead(502);
          reply.end(String(error));
        }
        return;
      }
      if (url.pathname === '/local') {
        try {
          const file = url.searchParams.get('p');
          reply.writeHead(200, {
            'content-type': LOCAL_MIME[path.extname(file).toLowerCase()] ?? 'image/png',
          });
          reply.end(await readFile(file));
        } catch (error) {
          reply.writeHead(404);
          reply.end(String(error));
        }
        return;
      }
      // 本地文件和远端图走各自的取法，页面那边只看到一个同源 URL
      const served = Object.fromEntries(
        Object.entries(targets).map(([name, target]) => [
          name,
          target.local
            ? `/local?p=${encodeURIComponent(target.local)}`
            : `/proxy?u=${encodeURIComponent(target.url)}`,
        ]),
      );
      reply.writeHead(200, { 'content-type': 'text/html' });
      reply.end(PAGE(served));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function dumpDom(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const child = spawn(
      CHROME,
      ['--headless', '--no-sandbox', '--hide-scrollbars', '--virtual-time-budget=30000',
        '--dump-dom', url],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('exit', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** 一张图的判定。返回失败原因的数组，空数组表示通过。 */
function judge(stats) {
  if (stats.error) return [`量不到：${stats.error}`];
  const failures = [];
  if (stats.waterOfChromatic < THRESHOLDS.minWaterOfChromatic) {
    failures.push(
      `有彩像素里只有 ${stats.waterOfChromatic}% 是水色，低于 ${THRESHOLDS.minWaterOfChromatic}%`,
    );
  }
  if (stats.warmShare > THRESHOLDS.maxWarmShare) {
    failures.push(`暖黄相占到 ${stats.warmShare}%，高于 ${THRESHOLDS.maxWarmShare}%`);
  }
  const [lo, hi] = THRESHOLDS.meanHue;
  if (stats.meanHue !== null && (stats.meanHue < lo || stats.meanHue > hi)) {
    failures.push(`平均色相 ${stats.meanHue}° 落在 ${lo}°–${hi}° 之外`);
  }
  return failures;
}

// ── 主流程 ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const reportOnly = argv.includes('--report');
const explicitUrls = argv.filter((a) => a.startsWith('http'));
const explicitFiles = argv.filter((a) => !a.startsWith('http') && !a.startsWith('--'));

try {
  execFileSync(CHROME, ['--version'], { encoding: 'utf8' });
} catch {
  console.error(`无法运行 Chrome：${CHROME}\n用 CHROME_BINARY 指到别处。`);
  process.exit(2);
}

const named = [];
for (const file of explicitFiles) {
  named.push([path.basename(file), { local: path.resolve(file) }]);
}
// 名字取 OSS key，比整条带处理参数的 URL 好读
for (const url of explicitUrls) {
  named.push([decodeURIComponent(new URL(url).pathname).replace(/^\/public\//, ''), { url }]);
}
if (named.length === 0) {
  for (const url of await collectFromDist()) {
    named.push([decodeURIComponent(new URL(url).pathname).replace(/^\/public\//, ''), { url }]);
  }
}
if (named.length === 0) {
  console.error('没有找到任何站外图片 URL —— 先跑 npm run build，或直接把图传进来。');
  process.exit(2);
}
const targets = Object.fromEntries(named);

const { server, port } = await serve(targets);
let results;
try {
  const dom = await dumpDom(`http://127.0.0.1:${port}/`);
  const raw = dom.match(/PALETTE(\{[\s\S]*?\})<\/title>/)?.[1];
  if (!raw) throw new Error(`没能从页面取回结果：\n${dom.slice(0, 400)}`);
  results = JSON.parse(raw);
} finally {
  server.close();
}

console.log(
  `色彩验收 —— 有彩像素里水色相 ${WATER_HUE[0]}°–${WATER_HUE[1]}° 占 ≥ ${THRESHOLDS.minWaterOfChromatic}%，` +
    `全图暖黄相 ${WARM_HUE[0]}°–${WARM_HUE[1]}° ≤ ${THRESHOLDS.maxWarmShare}%，` +
    `平均色相 ${THRESHOLDS.meanHue[0]}°–${THRESHOLDS.meanHue[1]}°\n`,
);

let failed = 0;
for (const [name, stats] of Object.entries(results)) {
  const failures = judge(stats);
  if (failures.length === 0) {
    console.log(`✅ ${name}`);
    console.log(
      `     水 ${stats.waterShare}%（占有彩 ${stats.waterOfChromatic}%）  暖 ${stats.warmShare}%  中性 ${stats.neutralShare}%  ` +
        `平均色相 ${stats.meanHue}°  ${stats.size}`,
    );
  } else {
    failed += 1;
    console.log(`❌ ${name}`);
    if (!stats.error) {
      console.log(
        `     水 ${stats.waterShare}%（占有彩 ${stats.waterOfChromatic}%）  暖 ${stats.warmShare}%  中性 ${stats.neutralShare}%  ` +
          `平均色相 ${stats.meanHue}°  ${stats.size}`,
      );
    }
    for (const reason of failures) console.log(`     ← ${reason}`);
  }
}

console.log(
  `\n${Object.keys(results).length} 张图，${failed} 张不达标。` +
    (failed > 0 ? ' 按新配方重出，或调整 THRESHOLDS 并说明理由。' : ''),
);

if (failed > 0 && !reportOnly) process.exit(1);
