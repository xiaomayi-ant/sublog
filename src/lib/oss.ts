// 相册图片的 URL 拼装。图片存在阿里云 OSS，站点只存 URL —— 构建产物一个字节都不因为
// 图片变大，服务器也不承担图片流量。这正是相册这条线能成立的前提。
//
// 压缩靠 OSS 的图片处理：在 URL 后面挂 x-oss-process 参数，服务端现场转格式和尺寸，
// 我们只上传一份原图。写法见
// https://help.aliyun.com/zh/oss/user-guide/convert-image-formats-2
//
// bucket 名和 endpoint 是公开信息 —— 浏览器要直接从这个域名拉图，藏不住，也不需要藏。
// 真正需要保密的是 AK/SK，那些只在本地上传脚本里用，不进仓库也不进构建产物。
const BUCKET = 'images-aigc';
const ENDPOINT = 'oss-cn-hangzhou.aliyuncs.com';

/**
 * 投递源图所在的前缀，公开读 —— bucket policy 只对它开了匿名 GetObject，
 * 没开 ListObjects，所以外面无法枚举，只能访问已知确切路径的对象。
 *
 * 归档原图在 private/ 下，保持私有，不从这里取：x-oss-process 只对浏览器
 * 能读到的对象有效，私有目录里的图连拉都拉不到，更谈不上让 OSS 帮它转。
 * public/ 里放的是原图缩到长边 2048 的一份 —— OSS 每次处理都要先读一遍源图，
 * 先缩一次，后面每一次派生都便宜。
 */
const PUBLIC_PREFIX = 'public';

export const OSS_ORIGIN = `https://${BUCKET}.${ENDPOINT}`;

// 档位是固定的三档，不开放任意参数组合。
// 每一种参数组合都是一次独立的图片处理请求、也是一个独立的缓存键；
// 放开之后既烧处理费又让缓存命中率掉下来。要新档位就往这里加一个名字。
export const PRESETS = {
  /** 相册索引里的缩略图 */
  thumb: { w: 640, q: 80 },
  /** 相册详情页的大图 */
  full: { w: 1600, q: 82 },
  /** 社交预览图。OG 图不转 webp —— 各家抓取器对 webp 的支持并不一致 */
  og: { w: 1200, q: 85, format: 'jpg' as const },
} satisfies Record<string, { w: number; q: number; format?: 'webp' | 'jpg' }>;

export type PresetName = keyof typeof PRESETS;

/**
 * 把 OSS 上的一个 key 拼成带处理参数的完整 URL。
 * key 是相对 aigc/images/ 的路径，例如 `harness/2026-08/cover.png`。
 */
export function ossImage(key: string, preset: PresetName = 'full'): string {
  const clean = key.replace(/^\/+/, '');
  const { w, q } = PRESETS[preset];
  const format = 'format' in PRESETS[preset] ? PRESETS[preset].format : 'webp';
  // 参数顺序即处理顺序：先缩放再转格式，反过来会先转一遍全尺寸的格式，白算一次
  const process = `image/resize,w_${w}/format,${format}/quality,Q_${q}`;
  return `${OSS_ORIGIN}/${PUBLIC_PREFIX}/${clean}?x-oss-process=${process}`;
}

/** 不带任何处理参数的原始派生图地址，只在需要拿到未压缩版本时用 */
export function ossRaw(key: string): string {
  return `${OSS_ORIGIN}/${PUBLIC_PREFIX}/${key.replace(/^\/+/, '')}`;
}
