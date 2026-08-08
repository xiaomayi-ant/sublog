// oss-upload — 把本地文件传到 OSS。
//
// 目录约定（见 src/lib/oss.ts 的注释）：
//   private/  归档原图，模型出的全尺寸高清，不对外
//   public/   投递源图，缩到长边 2048，浏览器直接读它并挂 x-oss-process 实时出 webp
//
// webp 不单独存 —— OSS 的图片处理是实时的，公开目录里有一份能读的源图就够了。
//
// 凭据只从环境变量取，不落盘、不进日志：
//   ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET
//
// 用法：
//   node scripts/oss-upload.mjs <本地文件> <远端 key>
//   node scripts/oss-upload.mjs cover.png public/harness/2026-07/cover.png
import { createHmac, createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const BUCKET = process.env.OSS_BUCKET ?? 'images-aigc';
const ENDPOINT = process.env.OSS_ENDPOINT ?? 'oss-cn-hangzhou.aliyuncs.com';

// 投递源图的体积上限。超过它说明没有先缩过 ——
// OSS 每次处理都要读一遍源图，源图越大每一次派生都越贵，缩一次一劳永逸。
const PUBLIC_MAX_BYTES = 1_200_000;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function credentials() {
  const id = process.env.ALIYUN_ACCESS_KEY_ID;
  const secret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  if (!id || !secret) {
    throw new Error('缺少 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET');
  }
  return { id, secret };
}

// OSS 签名 V1：VERB\nContent-MD5\nContent-Type\nDate\nCanonicalizedResource
function authorization({ id, secret }, verb, contentMd5, contentType, date, resource) {
  const raw = `${verb}\n${contentMd5}\n${contentType}\n${date}\n${resource}`;
  return `OSS ${id}:${createHmac('sha1', secret).update(raw).digest('base64')}`;
}

export async function putObject(localPath, key) {
  const creds = credentials();
  const cleanKey = key.replace(/^\/+/, '');

  const info = await stat(localPath);
  if (cleanKey.startsWith('public/') && info.size > PUBLIC_MAX_BYTES) {
    throw new Error(
      `${path.basename(localPath)} 有 ${(info.size / 1e6).toFixed(1)} MB，` +
        `超过投递源图的 ${(PUBLIC_MAX_BYTES / 1e6).toFixed(1)} MB 上限。` +
        `先缩到长边 2048 再传，或者传到 private/ 做归档。`,
    );
  }

  const body = await readFile(localPath);
  const contentType = MIME[path.extname(localPath).toLowerCase()] ?? 'application/octet-stream';
  const contentMd5 = createHash('md5').update(body).digest('base64');
  const date = new Date().toUTCString();

  const response = await fetch(`https://${BUCKET}.${ENDPOINT}/${cleanKey}`, {
    method: 'PUT',
    headers: {
      Date: date,
      'Content-Type': contentType,
      'Content-MD5': contentMd5,
      Authorization: authorization(
        creds,
        'PUT',
        contentMd5,
        contentType,
        date,
        `/${BUCKET}/${cleanKey}`,
      ),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    const code = text.match(/<Code>([^<]*)<\/Code>/)?.[1] ?? String(response.status);
    const message = text.match(/<Message>([^<]*)<\/Message>/)?.[1] ?? '';
    throw new Error(`上传失败 ${code}: ${message}`);
  }

  return { key: cleanKey, bytes: info.size, url: `https://${BUCKET}.${ENDPOINT}/${cleanKey}` };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [localPath, key] = process.argv.slice(2);
  if (!localPath || !key) {
    console.error('用法：node scripts/oss-upload.mjs <本地文件> <远端 key>');
    process.exitCode = 1;
  } else {
    try {
      const result = await putObject(localPath, key);
      console.log(`✓ ${result.key}  ${(result.bytes / 1024).toFixed(0)} KB`);
      console.log(`  ${result.url}`);
    } catch (error) {
      console.error(`✗ ${error.message}`);
      process.exitCode = 1;
    }
  }
}
