// compose-title — 把标题与装裱边合成进封面 PNG。
//
// 为什么不让模型把字画进去：图像模型没有"字体文件"这个概念，它生成的是像素。
// "high-contrast serif" 只是一句视觉描述，每次采样都会画出不同的字形 ——
// 实测四本抽到了四种字重和字宽，位置和字号也各飘各的，而且每次重出都重抽一次。
// 追求四本一致等于反复摇骰子直到四个都是六点。
//
// 为什么不干脆用 HTML 叠在页面上：那样图片本身是半成品，左上角空一块，
// 单独拿出去（分享、社交卡片、任何站外场景）就是个缺角的东西。
//
// 所以走第三条：模型只生画面，标题用真实字体渲染后烧进 PNG。
// 字体、字号、位置、边宽全部由这里决定，四本像素级一致；产出仍是完整成品。
//
// 依赖：机器上要有 --font-display 那一族（Iowan Old Style，macOS 自带）。
// 换机器前先确认，否则会静默回退到别的衬线体 —— 脚本会核对实际用到的字体并报错。
//
// 用法：
//   node scripts/compose-title.mjs <画面.png> <标题> <输出.png>

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CHROME =
  process.env.CHROME_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * 版面参数。四本共用这一份 —— 它就是"统一"的全部来源。
 * 比例而非像素，换尺寸时版面不变。
 */
const LAYOUT = {
  width: 928,
  height: 1160,
  /** 装裱边：画面四周的白边，占宽度的比例 */
  mount: 0.055,
  /** 标题基线距顶、距左，占各自边长的比例 */
  top: 0.085,
  left: 0.09,
  /** 字号占画面宽度的比例 */
  size: 0.14,
};

const [artPath, title, outPath] = process.argv.slice(2);
if (!artPath || !title || !outPath) {
  console.error('用法：node scripts/compose-title.mjs <画面.png> <标题> <输出.png>');
  process.exit(2);
}

const projectRoot = path.resolve(import.meta.dirname, '..');
// 字体族从 tokens.css 读，不在这里另抄一份 —— 与封面配方取色值同一个道理
const tokens = await readFile(path.join(projectRoot, 'src/styles/tokens.css'), 'utf8');
const fontDisplay = tokens.match(/--font-display:\s*([^;]+);/)?.[1].replace(/\s+/g, ' ').trim();
const colorInk = tokens.match(/--color-ink:\s*(#[0-9a-fA-F]+)/)?.[1];
if (!fontDisplay || !colorInk) {
  console.error('tokens.css 里读不到 --font-display 或 --color-ink');
  process.exit(2);
}

const art = await readFile(artPath);
const { width, height, mount, top, left, size } = LAYOUT;



const PAGE = `<!doctype html><meta charset="utf-8"><body><style>
  html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden;
               background: #fff; }
  /* 装裱边就是这圈 padding：没有厚度、没有投影，四本绝对均匀。
     让模型画"实物卡纸"的话会带斜切和阴影，读作一张裱好的画的照片，不是封面。 */
  .mount { position: absolute; inset: 0; padding: ${mount * 100}%; box-sizing: border-box; }
  .art { width: 100%; height: 100%; display: block; }
  .title { position: absolute; top: ${top * 100}%; left: ${left * 100}%;
           font-family: ${fontDisplay}; font-size: ${size * width}px; font-weight: 400;
           line-height: 1; letter-spacing: 0.005em; color: ${colorInk}; }
</style>
<div class="mount"><canvas class="art" id="art"></canvas></div>
<div class="title" id="t">${title}</div>
<script>
  // 自动裁掉底图自带的白边。模型常自己画一圈边（prompt 里出现画幅比例时尤其），
  // 那圈边再套上这里的装裱 padding 就成了两层，读起来很重、四本还宽窄不一。
  //
  // 阈值不能写死：水面浅蓝那张的边框 245 / 画面 202，白纸静物那张两者都在
  // 240 上下 —— 固定阈值试过两次都失灵。改成自适应：拿最边上几像素的亮度当
  // "边框色"，往内扫到第一处明显偏离它的地方。
  function detect(px, w, h) {
    const lum = (x, y) => { const i = (y * w + x) * 4; return 0.2126*px[i] + 0.7152*px[i+1] + 0.0722*px[i+2]; };
    const edge = (lum(2, Math.floor(h/2)) + lum(Math.floor(w/2), 2)) / 2;
    const off = (v) => Math.abs(v - edge) > 12;
    // 找的是**整条边**的那一步，不是画面里第一个深色像素。所以阈值取 60%：
    // 边框内沿是一条横贯全宽的硬边，而画面里的物体只覆盖一小段。
    // 原来写 1/12，空白纸上一根尺子伸进来就算数，扫描当场停在错的位置。
    const rowOff = (y) => { let n = 0, s = 0; for (let x = 0; x < w; x += 3) { s++; if (off(lum(x, y))) n++; } return n > s * 0.6; };
    const colOff = (x) => { let n = 0, s = 0; for (let y = 0; y < h; y += 3) { s++; if (off(lum(x, y))) n++; } return n > s * 0.6; };
    const capH = Math.floor(h / 4), capW = Math.floor(w / 4);
    let t = 0; while (t < capH && !rowOff(t)) t++;
    let b = 0; while (b < capH && !rowOff(h - 1 - b)) b++;
    let l = 0; while (l < capW && !colOff(l)) l++;
    let r = 0; while (r < capW && !colOff(w - 1 - r)) r++;
    // 撞到上限就是没扫到边 —— 真边框不会占掉画幅的四分之一
    if (t >= capH || b >= capH || l >= capW || r >= capW) return { t, b, l, r, none: true };
    return { t, b, l, r };
  }

  (async () => {
    await document.fonts.ready;
    const src = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = '/art'; });
    const probe = document.createElement('canvas');
    probe.width = src.width; probe.height = src.height;
    const pc = probe.getContext('2d');
    pc.drawImage(src, 0, 0);
    const { t, b, l, r, none } = detect(pc.getImageData(0, 0, src.width, src.height).data, src.width, src.height);
    // 四边取**最小**值。一度取最大值（想的是"裁完要对称"），结果在没有边框的
    // 图上炸了：Eval 那两张四周本就是大片空白纸，扫描一路撞到 h/4 的上限，
    // 于是四边各裁 288px，主体被切掉一半。
    //
    // 最小值靠得住的道理：真有边框的话，四条边都有，min 就是边框宽；
    // 没边框的话，画面总有一侧顶到画幅（Eval 的尺就跑出左右两边），min 自然是 0。
    // 判错的方向也更安全 —— 边框宽窄不匀时少裁一点，而不是把画面切掉。
    //
    // 但只取 min 还不够。Eval 的第二张四周都是空白纸、主体缩在中间，
    // 四边扫出来 138/200/150/300 这种数，min=138 照样把画面裁进去一大圈。
    // 真边框的特征是**四边一样宽**；空白纸扫出来的四个数彼此差很远。
    // 所以再加一道：四边最大值超过最小值 1.5 倍就判定"没有边框"，一刀不裁。
    const lo = Math.min(t, b, l, r);
    const hi = Math.max(t, b, l, r);
    const m = !none && lo > 0 && hi <= lo * 2 ? lo : 0;
    document.body.setAttribute('data-sides', [t, b, l, r].join('/'));
    const sx = m, sy = m, sw = src.width - m * 2, sh = src.height - m * 2;

    const cv = document.getElementById('art');
    const box = cv.getBoundingClientRect();
    cv.width = Math.round(box.width); cv.height = Math.round(box.height);
    const ctx = cv.getContext('2d');
    // cover：按目标框比例再裁一次，保证不变形
    const scale = Math.max(cv.width / sw, cv.height / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(src, sx, sy, sw, sh, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
    document.body.setAttribute('data-trim', String(m));
    const el = document.getElementById('t');
    // 核对真正用到的字体：字体缺失时浏览器会静默回退，图会悄悄变样
    const first = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    document.body.setAttribute('data-font', first);
    document.body.setAttribute('data-ready', '1');
  })();
</script></body>`;

const server = createServer(async (req, reply) => {
  if (req.url === '/art') {
    reply.writeHead(200, { 'content-type': 'image/png' });
    reply.end(art);
    return;
  }
  reply.writeHead(200, { 'content-type': 'text/html' });
  reply.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// 先 dump 一次确认字体没有静默回退
const dom = await new Promise((res, rej) => {
  const chunks = [];
  const p = spawn(CHROME, ['--headless', '--no-sandbox', '--virtual-time-budget=15000',
    '--dump-dom', `http://127.0.0.1:${port}/`], { stdio: ['ignore', 'pipe', 'ignore'] });
  p.stdout.on('data', (d) => chunks.push(d));
  p.on('error', rej);
  p.on('exit', () => res(Buffer.concat(chunks).toString('utf8')));
});
const used = dom.match(/data-font="([^"]*)"/)?.[1];
const wanted = fontDisplay.split(',')[0].replace(/["']/g, '').trim();
if (used !== wanted) {
  console.error(`字体回退了：想要 ${wanted}，实际 ${used ?? '未知'}。合成中止 —— ` +
    '换机器时缺字体会让四本悄悄变得不一致。');
  server.close();
  process.exit(1);
}

await new Promise((res, rej) => {
  const p = spawn(CHROME, ['--headless', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${width},${height}`, '--virtual-time-budget=20000',
    `--screenshot=${outPath}`, `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
  p.on('error', rej);
  p.on('exit', () => res());
});
server.close();
const trimmed = dom.match(/data-trim="(\d+)"/)?.[1] ?? '0';
const sides = dom.match(/data-sides="([^"]*)"/)?.[1] ?? '';
console.log(`${path.basename(outPath)}  ${title}  字体 ${used}  ` +
  `自带白边裁掉 ${trimmed}px（四边扫描值 ${sides}）`);
