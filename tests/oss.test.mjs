// oss — 图片 URL 拼装的单元测试。纯函数，不联网。
// 这段代码的产物会被烤进每一个相册页面，拼错一个参数就是整站图片全挂或者全不压缩，
// 而两者在构建期都不会报错 —— 所以它值得被单独钉住。
import assert from 'node:assert/strict';
import test from 'node:test';
import { ossImage, ossRaw, OSS_ORIGIN, PRESETS } from '../src/lib/oss.ts';

const KEY = 'harness/2026-08/cover.png';

test('派生图 URL 带上正确的处理参数', () => {
  const url = ossImage(KEY, 'thumb');
  assert.ok(url.startsWith(`${OSS_ORIGIN}/public/${KEY}?`), `意外的前缀：${url}`);
  assert.match(url, /x-oss-process=image\/resize,w_640\/format,webp\/quality,Q_80$/);
});

test('顺序是先缩放再转格式', () => {
  // 反过来会先把全尺寸原图转一遍格式再缩放，多算一次且更贵
  const url = ossImage(KEY, 'full');
  const process = new URL(url).searchParams.get('x-oss-process');
  assert.ok(process, '缺少 x-oss-process');
  const resizeAt = process.indexOf('resize');
  const formatAt = process.indexOf('format');
  assert.ok(resizeAt >= 0 && formatAt >= 0, `参数不完整：${process}`);
  assert.ok(resizeAt < formatAt, `缩放必须排在转格式前面：${process}`);
});

test('OG 图不转 webp —— 各家社交抓取器对它的支持并不一致', () => {
  const url = ossImage(KEY, 'og');
  assert.match(url, /format,jpg/);
  assert.doesNotMatch(url, /format,webp/);
});

test('三个档位都存在，且没有多余的档位悄悄混进来', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['full', 'og', 'thumb']);
  for (const [name, preset] of Object.entries(PRESETS)) {
    assert.ok(preset.w > 0 && preset.w <= 16383, `${name} 的宽度必须在 webp 的 16383px 上限内`);
    assert.ok(preset.q > 0 && preset.q <= 100, `${name} 的质量必须在 1-100`);
  }
});

test('key 前面多余的斜杠不会拼出双斜杠', () => {
  assert.equal(ossRaw(`/${KEY}`), ossRaw(KEY));
  assert.doesNotMatch(ossRaw(`//${KEY}`), /public\/\//);
});

// bucket policy 只对 public/ 开了匿名读；拼到 private/ 去的话线上就是一片 403，
// 而这在构建期不会有任何报错。
test('所有 URL 都落在公开读的 public/ 前缀下，绝不指向 private/', () => {
  for (const preset of Object.keys(PRESETS)) {
    const url = ossImage(KEY, preset);
    assert.ok(url.includes('/public/'), `${preset} 档没有落在 public/ 下：${url}`);
    assert.doesNotMatch(url, /\/private\//, `${preset} 档指向了私有前缀：${url}`);
  }
  assert.ok(ossRaw(KEY).includes('/public/'));
});

test('默认档位是 full', () => {
  assert.equal(ossImage(KEY), ossImage(KEY, 'full'));
});
