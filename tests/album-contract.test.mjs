// album-contract — 相册的构建契约。
//
// 这条链路最危险的地方是：图片全在站外，所以图坏了构建期一声不吭。
// URL 拼错、指向私有前缀、忘了带压缩参数 —— 三种都能顺利构建、顺利部署，
// 只有读者会看到一片灰。所以这里断言的重点不是"页面在不在"，是"URL 对不对"。
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

const readRoute = (route) => readFile(path.join(distRoot, route.slice(1), 'index.html'), 'utf8');

async function pathExists(relative) {
  try {
    await access(path.join(distRoot, relative));
    return true;
  } catch {
    return false;
  }
}

const ossUrls = (html) =>
  [...html.matchAll(/https:\/\/[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com[^"'\s]*/g)].map((m) =>
    m[0].replace(/&#38;/g, '&'),
  );

test('/albums 永远存在，没出过期也是一页', async () => {
  const html = await readRoute('/albums');
  assert.match(html, /<title>相册 · Water<\/title>/);
  assert.match(html, /<main id="content"/);
});

// Albums 是导航上的一项，不是只能靠猜地址进去的暗页
test('导航提供 Albums', async () => {
  for (const route of ['/', '/blog', '/albums']) {
    const html = await readRoute(route);
    const nav = html.match(/<nav aria-label="主导航"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${route} 应当渲染主导航`);
    assert.match(nav, />Albums</, `${route} 的导航缺少 Albums`);
    assert.match(nav, /href="\/albums"/, `${route} 的导航没链到 /albums`);
  }
});

// 扫全站，不是只扫相册页 —— 任何页面都可能用到 OSS 上的图（/about 就用了），
// 而这条链路的错法全都是构建期无声的：拼错、指向私有前缀、忘带压缩参数。
async function allHtmlFiles(dir = distRoot) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allHtmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

test('每一个站外图片 URL 都落在公开前缀下，且带着压缩参数', async () => {
  const files = await allHtmlFiles();

  let seen = 0;
  for (const file of files) {
    const route = path.relative(distRoot, file);
    const html = await readFile(file, 'utf8');
    for (const url of ossUrls(html)) {
      seen += 1;
      // bucket policy 只对 public/ 开了匿名读；拼到 private/ 线上就是一片 403
      assert.ok(url.includes('/public/'), `${route} 的图片没落在 public/ 下：${url}`);
      assert.doesNotMatch(url, /\/private\//, `${route} 的图片指向了私有前缀：${url}`);
      // 忘了带处理参数 = 直接拉几百 KB 的源图，压缩这一整套就白做了
      assert.match(url, /x-oss-process=image\//, `${route} 的图片没带压缩参数：${url}`);
      const process = new URL(url).searchParams.get('x-oss-process');
      assert.ok(
        process.indexOf('resize') < process.indexOf('format'),
        `缩放必须排在转格式前面：${process}`,
      );
    }
  }
  assert.ok(seen > 0, '至少应当有一个站外图片 URL —— 一个都没有说明图片没渲染出来');
});

test('已出期的相册有详情页，并摊开它的来源', async () => {
  if (!(await pathExists('albums/harness'))) return; // 还没出期就没有这一支

  const html = await readRoute('/albums/harness');
  assert.match(html, /2026-07/, '应当显示期号');
  assert.match(html, /封面来源/, '应当摊开封面的来源');

  // 生成不可复现，prompt 和模型名是"这张封面怎么来的"唯一的答案。
  //
  // 守的是**有没有记录**，不是用了哪一家。原来这里写死了
  // /image_gen__imagegen|gpt-image/，换成 gemini-3-pro-image 出图就假红了 ——
  // 那条断言把 provider 锁死，而 provider 本来就会换（OpenAI 和 xAI 的额度
  // 都可能用尽）。改成拿 frontmatter 里的实际值去页面上找。
  const source = await readFile(
    path.join(projectRoot, 'src/content/albums/harness.md'),
    'utf8',
  );
  const model = source.match(/^\s+model:\s*(.+?)\s*$/m)?.[1];
  assert.ok(model, 'frontmatter 里没有 model —— 这张封面怎么来的就无从回答了');
  assert.ok(html.includes(model), `页面上应当出现模型名「${model}」`);

  assert.match(html, /Album cover, 4:5 vertical/, '应当存下完整的 prompt');
  // 收录的文章要真的链得过去
  assert.match(html, /href="\/blog\/harness\/agent-action-boundaries"/);
});

test('构建产物不因为相册变大 —— 图片一张都不进仓库', async () => {
  const html = await readRoute('/albums');
  // 站内图片路径（/images/、/_astro/ 下的位图）不应该因为相册出现
  const localCovers = [...html.matchAll(/src="(\/[^"]*\.(?:png|jpe?g|webp))"/g)].map((m) => m[1]);
  assert.deepEqual(localCovers, [], `封面不该落在站内：${localCovers.join(', ')}`);
});
