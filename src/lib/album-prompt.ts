// 相册封面的 prompt 模板。
//
// 这个模块只在 Node 侧跑（测试与出期规划），从不进浏览器产物，
// 所以可以直接读文件系统去取 tokens。
//
// 文字是烤进图里的，所以四本相册看起来是不是一套，几乎完全取决于这个模板 ——
// 每一期都由同一段 BASE 加一小段方向专属的意象拼成，变量只有意象和标题两处。
// 一旦让每期自由发挥，四本封面会各说各话，而那恰恰是"协调一致"要防的事。
//
// 意象不是随手挑的，来自每个方向自己写过的东西：
// harness 谈边界与可逆性、llm 谈状态与记忆、eval 谈尺度与误差、notes 是过程与未定稿。
// 这满足 culture-fragment-poster-engine 对"视觉基因来自材料本身"的要求。
//
// ── 色彩为什么必须从 tokens.css 读 ──────────────────────────────────
//
// 第一版的色彩段是手写的英文散文（"Warm off-white paper ground … deep
// umber-brown … cobalt-blue line … warm-yellow accent"），照搬自
// docs/design-plan.md 第 1 条那套早已废弃的旧 tokens。站点后来换成
// --color-bg: #fff 加水色主导，这段配方没跟着走，于是漂了。
//
// 漂成什么样是量过的（Lab 色相角分桶，取样两张已出的图）：
//
//                     水色相 160°–250°   暖黄相 40°–110°   平均色相
//   相册封面 harness         0%              99.7%          85°
//   About 配图               0%              99.1%          85°
//
// 站点这边 --water-100/300/500/700 分别是 192°/194°/216°/230°，
// 而 85° 正好压在 --color-sun 上 —— tokens.css 写明它"只做高光，永不承载
// 文字"、配比约 1%。也就是说图把 1% 的强调色当成了 99% 的主色，而站点的
// 主色一个像素都没有。图里的深色 #8d734d / #6e542c 落在 78–79°，正是
// tokens.css 第 22 行判过死刑的那个位置（"偏到 70° 附近就成了橄榄／卡其"）。
//
// 所以色值不再手抄，直接从 tokens.css 解析 —— 与 riverRenderer 和 404 字形
// 共用 WASH_LADDER 是同一个道理：同源，不是同步。
//
// 光改色彩词压不住：材质词自带色相。brass（黄铜）、vellum（羊皮纸）、
// kraft 本身就在 70–90°，所以下面 MOTIFS 里的材质一并换成了冷的那一族，
// 意象（闸门、层叠、量尺、折痕）原样保留 —— 那才是内容价值所在。
//
// prompt 只是请求，不是保证。真正的验收在 scripts/verify-image-palette.mjs：
// 出图之后量色相分布，不达标就打回重出。

import { readFileSync } from 'node:fs';
import path from 'node:path';

const TOKENS_PATH = path.resolve(import.meta.dirname, '../styles/tokens.css');
let tokensCache: string | null = null;

/** 从 tokens.css 取一个色值。取不到就抛 —— 悄悄回退到硬编码正是漂移的来源。 */
function token(name: string): string {
  tokensCache ??= readFileSync(TOKENS_PATH, 'utf8');
  const hex = tokensCache.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1];
  if (!hex) throw new Error(`tokens.css 里找不到 ${name}，色彩配方无法生成`);
  // #fff → #ffffff，让 prompt 里的写法统一，也便于验收脚本比对
  const value = hex.toLowerCase();
  return value.length === 4
    ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
    : value;
}

/**
 * 所有封面共享的部分。改这里等于改全系列，不要为某一期单独调。
 *
 * 色彩的分工照抄 tokens.css 的比例感：底是清澈白，水色一族承担画面，
 * 赭墨是唯一的暗调，阳黄压在 3% 以内当高光。
 */
const BASE = [
  'Album cover, 4:5 vertical, editorial art direction.',
  `Ground: white paper ${token('--color-bg')}, faint grain.`,
  `Two axes only — warm copper ${token('--color-ember')} for the made object,`,
  `cool water ${token('--water-100')} to ${token('--water-700')} for what it holds;`,
  `dark tone ${token('--color-ink')}; ${token('--color-sun')} only as a spark under 3%.`,
  'Museum-label precision, generous empty space, matte materials, soft daylight.',
  'A specimen plate, not a scene.',
].join(' ');

/** 版式骨架：标题的位置固定，四本才叠得起来。 */
const LAYOUT = [
  'Composition: subject in the lower two-thirds, offset right;',
  'upper-left quadrant stays empty paper and carries the title.',
].join(' ');

/**
 * 禁止项。图像模型很吃这一段，缺了就容易滑回旅游海报和廉价拼贴。
 * 但整条 prompt 有 1200 字符的上限（skill 的规定，超了模型会开始丢前面的约束），
 * 所以这里只留最容易滑过去的那几项，不做穷举。
 */
const FORBIDDEN = [
  // 前半守色相。禁的不是"暖"，是**卡其那一段**（Lab 色相 72°–110°）——
  // tokens.css 第 22 行就判过它："偏到 70° 附近就成了橄榄／卡其，读作
  // '发黄的黑'而不是'与水相对的暖'"。下面每个词都落在那一段里。
  //
  // 一度写成 "any warm cast"，那是矫枉过正：站点本来就有暖轴
  // （--color-ink 41°、--color-ember 61°），禁掉暖等于禁掉半个色板。
  // 红铜 40°–55° 是合法的，黄铜 78°–85° 不是 —— 两者必须分开点名。
  'Avoid: warm or cream paper, brass, gold, ochre, kraft, sepia, olive, khaki;',
  'no yellow-green cast; dark background, collage, gradients, glow, 3D render,',
  'full-surface ornament, centered title stack, stock people, saturated colour fields.',
].join(' ');

/**
 * 只烤大标题。小字一律不烤 —— 图像模型画小字几乎必然出错，
 * 而大字（2 到 4 个汉字）在实测里是可靠的。编号、日期、说明都留给 HTML。
 */
function titleClause(zh: string, en: string): string {
  // zh 与 en 相同 = 这一本没有中文对应（harness 就是，见 content.ts 的
  // TYPE_LABELS）。硬译出来的「边界」并不是 harness 的意思，封面上摆一个
  // 不准确的大字比不摆更糟，所以只烤原词 —— 它自己就是主角，字号跟着上去。
  const heading =
    zh === en
      ? [
          `Baked-in typography: the single word "${en}" set very large in a high-contrast serif,`,
          'with generous letter-spacing.',
        ]
      : [
          `Baked-in typography: the two-character Chinese title "${zh}" set very large in a high-contrast serif,`,
          `and the single word "${en}" beneath it in small letter-spaced uppercase sans.`,
        ];
  return [
    ...heading,
    'The only characters in the image; no other text, numbers, labels or watermark.',
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

// 材质换过一轮：brass（黄铜）、vellum（羊皮纸）、handmade paper 这些词自带
// 70–90° 的暖色相，光在 BASE 里写"cool water only"压不住 —— 实测两张已出的图
// 有 99% 的像素落在暖黄相，材质词是主要来源之一。
//
// 换的是材质不是意象：闸门、层叠、量尺、折痕原样保留，它们来自每个方向自己
// 写过的东西，是这四本封面的内容价值所在。铜绿（verdigris）尤其合用 ——
// 它既是金属氧化的真实颜色、落在水色相里，又和水有天然的因果关系。
export const MOTIFS: Record<'harness' | 'llm' | 'eval' | 'notes', AlbumMotif> = {
  // 边界、门、可逆性
  // 没有中文对应：harness 是马具、是"驾驭"，硬译成「边界」只说中了它的
  // 一个侧面（安全边界），丢掉了主干 —— 缰绳、鞍、导航把原始动力变成
  // 可控的运动。zh 与 en 相同即表示"只烤原词"，titleClause 据此分支。
  harness: {
    zh: 'Harness',
    en: 'Harness',
    // Agent = Model + Harness（Martin Fowler）的直译：控制层在外圈，模型在核心，
    // 包裹而不触碰。冷暖分工正好承载这层语义 —— 暖铜是人造的控制层，
    // 冷瓷是被驾驭的原始核心。边上那个闭合的触点是"决策"：不是均匀的机械
    // 约束，而是有选择地闭合某一路。
    //
    // 走到这一版之前试过：闸门加石块（意思全错）、Watt 飞球调速器（概念最硬，
    // 但"三条岔道闸住一条"在字符预算里压不住主体）、纯马具（太字面，没有
    // 智能决策的位置）。
    motif:
      'Subject: a warm copper ring mechanism with fine contacts along its inner rim, ' +
      'encircling a pale celadon sphere that floats clear of it, touching nothing; ' +
      'one contact on the rim is closed, the rest open.',
  },
  // 状态、记忆、上下文的沉积
  llm: {
    zh: '记忆',
    en: 'MODELS',
    motif:
      'Subject: a stack of translucent frosted-glass sheets on white paper, each with a faint different mark, ' +
      'edges offset so the layers read as sediment from above.',
  },
  // 尺度、标准、误差
  eval: {
    zh: '尺度',
    en: 'EVAL',
    motif:
      'Subject: a worn steel measuring rule and a fine mesh sieve laid on white paper, ' +
      'a few small pale-celadon ceramic tokens sorted into two uneven groups beside them.',
  },
  // 过程、未定稿
  notes: {
    zh: '过程',
    en: 'NOTES',
    motif:
      'Subject: a folded sheet of cool white paper with a soft crease and a torn edge, ' +
      'one graphite line running off the tear, a small pressed fibre caught in the fold.',
  },
};

/** 拼出一期封面的完整 prompt。存进 frontmatter 的就是它的返回值。 */
export function albumPrompt(album: keyof typeof MOTIFS): string {
  const { zh, en, motif } = MOTIFS[album];
  return [BASE, motif, LAYOUT, titleClause(zh, en), FORBIDDEN].join(' ');
}

/**
 * 站内其他地方要配图时走这里，共用同一段 BASE 和禁止项 ——
 * 这样新加的图和相册封面是一家人，而不是另一种风格闯进来。
 * 一致性靠代码保证，不靠下次还记得。
 *
 * 与封面的两点不同：画幅按位置给，且**一个字都不烤** ——
 * 配图旁边就是真排版的正文，图里再出现文字只会打架。
 */
export function sitePrompt(motif: string, ratio: string): string {
  return [
    BASE.replace('Album cover, 4:5 vertical,', `${ratio},`),
    motif,
    'No text, no lettering, no characters, no numbers, no watermark anywhere in the image.',
    FORBIDDEN,
  ].join(' ');
}

/**
 * /about 的配图。意象来自这一页自己的结尾那句
 * 「Be water, my friend. A reminder to stay adaptive without losing form.」——
 * 被水磨圆的石头是"形"，静水是"适应"，所以它是那句话的视觉转译，不是装饰。
 */
export function aboutPrompt(): string {
  return sitePrompt(
    'Subject: one smooth river-worn grey stone resting beside a shallow ceramic dish of still water on paper; ' +
      'the water surface perfectly calm, holding a single soft reflection; ' +
      'a thin cobalt line scribed on the paper passing beneath both.',
    'Editorial still life, 3:4 vertical',
  );
}
