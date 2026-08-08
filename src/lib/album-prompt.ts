// 相册封面的 prompt 模板。
//
// 文字是烤进图里的，所以四本相册看起来是不是一套，几乎完全取决于这个模板 ——
// 每一期都由同一段 BASE 加一小段方向专属的意象拼成，变量只有意象和标题两处。
// 一旦让每期自由发挥，四本封面会各说各话，而那恰恰是"协调一致"要防的事。
//
// 意象不是随手挑的，来自每个方向自己写过的东西：
// harness 谈边界与可逆性、llm 谈状态与记忆、eval 谈尺度与误差、notes 是过程与未定稿。
// 这满足 culture-fragment-poster-engine 对"视觉基因来自材料本身"的要求。

/** 所有封面共享的部分。改这里等于改全系列，不要为某一期单独调。 */
const BASE = [
  'Album cover, 4:5 vertical, editorial art direction.',
  'Warm off-white paper ground with visible fibre grain; deep umber-brown as the only dark tone;',
  'a single thin cobalt-blue line as a structural element; one small warm-yellow accent, under 3% of the surface.',
  'Restrained, museum-label precision, generous empty space, matte materials, soft directional daylight.',
  'Shot like a still-life specimen plate, not a scene.',
].join(' ');

/** 版式骨架：标题的位置固定，四本才叠得起来。 */
const LAYOUT = [
  'Composition: the subject occupies the lower two-thirds, offset to the right;',
  'the upper-left quadrant stays empty paper and carries the title.',
].join(' ');

/**
 * 禁止项。图像模型很吃这一段，缺了就容易滑回旅游海报和廉价拼贴。
 * 但整条 prompt 有 1200 字符的上限（skill 的规定，超了模型会开始丢前面的约束），
 * 所以这里只留最容易滑过去的那几项，不做穷举。
 */
const FORBIDDEN = [
  'Avoid: dark background, collage, gradients, gold foil, glow, 3D render look,',
  'full-surface ornament, centered title stack, stock-photo people, saturated colour fields.',
].join(' ');

/**
 * 只烤大标题。小字一律不烤 —— 图像模型画小字几乎必然出错，
 * 而大字（2 到 4 个汉字）在实测里是可靠的。编号、日期、说明都留给 HTML。
 */
function titleClause(zh: string, en: string): string {
  return [
    `Baked-in typography: the two-character Chinese title "${zh}" set very large in a high-contrast serif,`,
    `and the single word "${en}" beneath it in small letter-spaced uppercase sans.`,
    'These are the only characters anywhere in the image. No other text, no numbers, no labels, no watermark.',
  ].join(' ');
}

export interface AlbumMotif {
  /** 烤进图里的中文标题，控制在 2–4 字 */
  zh: string;
  /** 烤进图里的英文词，单个词，全大写 */
  en: string;
  /** 这一本的意象，来自这个方向自己写过的主题 */
  motif: string;
}

export const MOTIFS: Record<'harness' | 'llm' | 'eval' | 'notes', AlbumMotif> = {
  // 边界、门、可逆性
  harness: {
    zh: '边界',
    en: 'HARNESS',
    motif:
      'Subject: a single machined brass gate mechanism, half open, mounted on a pale plaster block; ' +
      'one hairline scribed across the plaster passing through the opening.',
  },
  // 状态、记忆、上下文的沉积
  llm: {
    zh: '记忆',
    en: 'MODELS',
    motif:
      'Subject: a stack of translucent vellum sheets on paper, each carrying a faint different mark, ' +
      'edges slightly offset so the layers read as sediment seen from above.',
  },
  // 尺度、标准、误差
  eval: {
    zh: '尺度',
    en: 'EVAL',
    motif:
      'Subject: a worn brass measuring rule and a fine mesh sieve laid on paper, ' +
      'a few small ceramic tokens sorted into two uneven groups beside them.',
  },
  // 过程、未定稿
  notes: {
    zh: '过程',
    en: 'NOTES',
    motif:
      'Subject: a folded sheet of handmade paper with a soft crease and a torn edge, ' +
      'one graphite line running off the tear, a small pressed fibre caught in the fold.',
  },
};

/** 拼出一期封面的完整 prompt。存进 frontmatter 的就是它的返回值。 */
export function albumPrompt(album: keyof typeof MOTIFS): string {
  const { zh, en, motif } = MOTIFS[album];
  return [BASE, motif, LAYOUT, titleClause(zh, en), FORBIDDEN].join(' ');
}
