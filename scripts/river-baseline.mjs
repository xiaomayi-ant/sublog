// 河流的视觉基线。改渲染器之前先 capture，改完 check —— 它回答的是
// "像素动了没有"，而不是"动得对不对"，后者只能靠眼睛看并排对照。
//
//   node scripts/river-baseline.mjs capture   # 写入基线
//   node scripts/river-baseline.mjs check     # 与基线比对
//
// 刻意不挂进 npm test：那条链是生产部署的闸门，跑在 ubuntu-latest 上，
// 不该因为一个浏览器二进制不在预期位置而挡住发布。这是开发期工具。
//
// 确定性从哪来：强制 prefers-reduced-motion，渲染器在这个分支下把 time 固定为 0
// （riverRenderer.mjs 的 render()），于是同一份产物每次画出同一帧。实测三次
// sha256 一致。代价是基线只覆盖静态形态——流动本身由变异测试 disabled-animation-loop 守。
//
// 局限：sha256 跨 Chrome 版本、跨机器会变。基线里记了采集时的 Chrome 版本，
// 对不上就重新 capture，别去猜像素差在哪。

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = join(projectRoot, 'dist');
const baselineRoot = join(projectRoot, 'tests/baselines/river');
const manifestPath = join(baselineRoot, 'manifest.json');

const CHROME =
  process.env.CHROME_BINARY ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 视口选得刻意：1440 宽的 aspect 是 1.6，正好落在 optionsAt() 里 bendScale 的
// 分界上（≥1.6 不收敛弯度）；390×844 的 aspect 0.46 走的是收敛那条分支。
// 两个一起截，才盖住 riverRenderer 里那个 Math.min(1, aspect / 1.6) 的两侧。
const SHOTS = [
  { name: 'home-1440x900', path: '/', width: 1440, height: 900 },
  { name: 'home-390x844', path: '/', width: 390, height: 844 },
  { name: 'lab-1440x900', path: '/lab/river/', width: 1440, height: 900 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function serveDist() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let filePath = join(distRoot, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) filePath = join(filePath, 'index.html');
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      response.writeHead(404).end('not found');
    });
    stream.on('open', () => {
      response.writeHead(200, {
        'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
        // 基线要的是确定性，缓存只会让人怀疑自己看到的是哪一版
        'cache-control': 'no-store',
      });
      stream.pipe(response);
    });
  });

  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      resolveServer({ server, port: server.address().port });
    });
  });
}

function chromeVersion() {
  try {
    return execFileSync(CHROME, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      `无法运行 Chrome：${CHROME}\n用 CHROME_BINARY 指到别处，或先装 Google Chrome。`,
    );
  }
}

function screenshot(url, output, { width, height }) {
  return new Promise((resolveShot, rejectShot) => {
    const child = spawn(
      CHROME,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        // 这一条是确定性的来源，不是无障碍偏好：它让渲染器走 time=0 的分支
        '--force-prefers-reduced-motion',
        `--window-size=${width},${height}`,
        // 给字体、脚本和首帧留出时间；虚拟时间到点就截，不依赖真实等待
        '--virtual-time-budget=4000',
        `--screenshot=${output}`,
        url,
      ],
      { stdio: 'ignore' },
    );
    child.on('error', rejectShot);
    child.on('exit', (code) =>
      code === 0 ? resolveShot() : rejectShot(new Error(`Chrome 退出码 ${code}`)),
    );
  });
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function capture(mode) {
  const version = chromeVersion();
  const { server, port } = await serveDist();
  const workRoot = join(tmpdir(), `river-baseline-${process.pid}`);
  await mkdir(workRoot, { recursive: true });

  const results = [];
  try {
    for (const shot of SHOTS) {
      const output = join(workRoot, `${shot.name}.png`);
      await screenshot(`http://127.0.0.1:${port}${shot.path}`, output, shot);
      results.push({ shot, output, digest: await sha256(output) });
    }
  } finally {
    server.close();
  }

  if (mode === 'capture') {
    await mkdir(baselineRoot, { recursive: true });
    for (const { shot, output } of results) {
      await copyFile(output, join(baselineRoot, `${shot.name}.png`));
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          chrome: version,
          commit: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: projectRoot,
            encoding: 'utf8',
          }).trim(),
          shots: Object.fromEntries(results.map(({ shot, digest }) => [shot.name, digest])),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await rm(workRoot, { recursive: true, force: true });
    console.log(`基线已写入 ${baselineRoot}`);
    for (const { shot, digest } of results) console.log(`  ${shot.name}  ${digest.slice(0, 16)}`);
    return 0;
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.chrome !== version) {
    console.warn(`⚠ Chrome 版本变了：基线用 ${manifest.chrome}，当前 ${version}`);
    console.warn('  版本不同时哈希必然不同，这里的比对结果不能作为视觉判据。');
  }

  const drifted = [];
  for (const { shot, output, digest } of results) {
    const expected = manifest.shots?.[shot.name];
    const same = expected === digest;
    console.log(`${same ? '=' : '≠'} ${shot.name}  ${digest.slice(0, 16)} (基线 ${String(expected).slice(0, 16)})`);
    if (!same) {
      const kept = join(baselineRoot, `${shot.name}.current.png`);
      await copyFile(output, kept);
      drifted.push({ name: shot.name, kept });
    }
  }
  await rm(workRoot, { recursive: true, force: true });

  if (drifted.length === 0) {
    console.log('像素未变。');
    return 0;
  }
  console.log('\n以下画面变了，当前帧已存到基线目录旁边，自己并排看：');
  for (const { name, kept } of drifted) console.log(`  ${name}: ${kept}`);
  return 1;
}

const mode = process.argv[2];
if (mode !== 'capture' && mode !== 'check') {
  console.error('用法: node scripts/river-baseline.mjs <capture|check>');
  process.exit(2);
}
process.exit(await capture(mode));
