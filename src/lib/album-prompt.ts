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
  // 写"色族"而不是"铜"。上一版这里是 warm copper for the made object，
  // 结果四本封面全在用铜器具 —— 把暖色和一种材质绑死了。铜只是恰好落在
  // 暖轴上的一种材质，不是唯一一种；赤陶、木、砖同样在 40°–61°。
  `Warm leads: the ${token('--color-ember')} terracotta family carries the subject;`,
  `cool ${token('--water-100')} to ${token('--water-700')} supports it;`,
  // "as colour, never as a drawn mark"：上一版写 "only as a spark under 3%"，
  // 模型把 spark 当字面的火花去画了，eval 和 notes 上各多出一个小图标。
  `dark tone ${token('--color-ink')}; ${token('--color-sun')} under 3%, as colour, never as a drawn mark.`,
  'Museum-label precision, generous empty space, matte materials, soft daylight.',
  'A specimen plate, not a scene.',
].join(' ');

/**
 * 版式骨架：标题的位置固定，四本才叠得起来。
 *
 * 单本可以用 AlbumMotif.layout 覆盖它 —— 但那意味着这一本从"四本一套"里
 * 走出去一步，只有当意象自带构图时才值得。LLM 就是：它的棋盘要从画面底边
 * 铺满、远端消散，才能既有纵深又没有边界，容不下"主体偏右下、标题缩在左上"。
 */
const LAYOUT = [
  'Composition: subject in the lower two-thirds, offset right;',
  // 原来这里是 "...and carries the title"。标题不再烤进图，但这块留白要留着 ——
  // 它同时是构图锚点，去掉之后主体会漫上来。所以只换掉"承载标题"那半句。
  'upper-left quadrant stays empty paper, reserved and unoccupied.',
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
  'no yellow-green cast; no icons, symbols, sparkles or stars;',
  'dark background, collage, gradients, glow, 3D render,',
  'full-surface ornament, centered title stack, stock people, saturated colour fields.',
].join(' ');

/**
 * 图里不烤任何文字。
 *
 * 标题曾经是烤进图里的，四本因此永远统一不了 —— 图像模型不能指定字体文件，
 * "high-contrast serif" 每次都会抽到不同的字形：LLM 抽到细窄无衬线感的，
 * 另外三本抽到粗重衬线的，四本四个样，而且每次重出都重抽一次。字号"约半幅宽"、
 * 位置"左上角"同样是模糊指令。追求四本一致等于反复摇骰子直到四个都是六点。
 *
 * 改成图片只出画面，标题在本地用真实字体合成进 PNG（见 scripts/compose-title.mjs）：
 * 字体走 --font-display、颜色走 --color-ink，位置、字号、装裱边宽由一份版面参数决定，
 * 四本像素级一致，以后加第五本也不会漂。
 *
 * 中途试过第三条路 —— 标题用 HTML 排在图片上（AlbumCover.astro）。四本确实统一了，
 * 但图片本身成了半成品：左上角空一块，单独拿出去分享就是个缺角的东西。
 * 合成进 PNG 同样统一，而且产出是完整成品，所以那个组件删掉了。
 */
const NO_TEXT =
  'No text, no lettering, no characters, no numbers, no watermark anywhere in the image.';

export interface AlbumMotif {
  /** 封面上那个中文标题，控制在 2–4 字。不进 prompt —— 由合成写上去 */
  zh: string;
  /** 封面上的英文词，单个词，全大写。同样不进 prompt */
  en: string;
  /** 这一本的意象，来自这个方向自己写过的主题 */
  motif: string;
  /** 覆盖共享版式。只在意象自带构图时用 —— 见 LAYOUT 上方的说明。 */
  layout?: string;
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
  // 大模型本身：语言变成了数学。
  //
  // 围棋而不是"权重矩阵的铜板"。它多说了三件事：AlphaGo 是深度学习进入
  // 公众视野的那个事件，用它讲发展有历史刻度；简单规则涌现出无法枚举的
  // 复杂度，正是下一个 token 的预测涌现出推理；而"势"只能整体感知、
  // 无法逐点计算，与涌现同构。
  //
  // 棋子在交点上拼出 LLM，这件事本身就是矩阵 —— 点阵字形就是一个 0/1 矩阵，
  // 哪个交点有子、哪个没有。所以"融入矩阵元素"不必额外加东西，也就没有
  // 破坏画面的风险。它还多说了一层：离散的点涌现出意义，正是语言模型在做的事。
  // 网格跑出画外、不要边框 —— 那个空间没有边。
  //
  // 棋盘必须走赤陶／深赭那一档：传统榧木盘是浅木黄，正落在 70°–90° 的
  // 卡其区 —— 最初两张被判死的图就死在那里。
  llm: {
    zh: 'LLM',
    en: 'LLM',
    // 这一版的写法与其余三本不同，是被实测逼出来的：
    //   · 一律正面表述。写 "no border" 模型反而画出边框；改成"线跑出画面"才成立。
    //   · 围棋子要写 biconvex discs。只写 stones 会得到碎石头。
    //   · 透视与无边界会打架 —— 一旦倾斜，模型就要给平面一个立足点，边界就回来了。
    //     解法是让近景直接从画面底边开始、左右顶满，远端消散进纸里，物理上没有边可画。
    motif:
      'The upper quarter is off-white rice paper washed with drifting bands of pale water blue, ' +
      'carrying the title. Beneath it a Go board stretches away from a low viewpoint: near cells ' +
      'large, far cells compressing, every line running off the top and both sides without ever ' +
      'showing a board edge. Go stones, smooth biconvex discs, rest on the intersections in the ' +
      'near field: the two L matte black, the M pale jade.',
    // 只说画面怎么铺，不再说标题放哪 —— 标题的落位由 TITLE_PLACEMENT 统一管。
    layout:
      'Composition: the upper quarter stays as plain paper; ' +
      'the board fills everything below it, reaching the bottom and both side edges of the picture.',
  },
  // 评估方法学：用不同的尺量同一个东西。
  //
  // 画的是评估真正的困难 —— 不是"有没有尺"，是尺本身在变、而且互相不同意。
  // 被量的是一个球：没有平面、没有正面，怎么量都不完整。
  //
  // 球是黄绿釉，不是青瓷。原来的浅青彩度只有 6.4，低于周围量具的 11.3 ——
  // 主体比配角还灰，视觉重心反而被推给了量具。换成黄绿之后它才立得住。
  // 代价是黄绿的色相落在 72°–110°，正是色彩判据里的卡其禁区，
  // verify:palette 会报红。这是有意的例外，不是失手。
  //
  // 做过两次减法，都退回来了，记在这里省得再走一遍：
  //   尺 + 圆规   圆规抢了主体，尺成了配角；"跨距压不到刻度上"这层意思
  //               只有凑近看才成立，封面尺寸上读不出来。
  //   只留一把尺  画面干净，但什么都不说了 —— 没有被量的东西，就没有"评估"，
  //               只剩一件器物的静物照。
  // 减到最后才看清：球不是配角，它就是那个"被评估的对象"，去掉它这张图没有主语。
  eval: {
    zh: 'Eval',
    en: 'Eval',
    motif:
      'Subject: a single pale chartreuse sphere, a soft yellow-green glaze, on white paper, ' +
      'ringed by several mismatched ' +
      'measuring instruments in warm terracotta metal — a rule, a caliper, a protractor — ' +
      'none aligned with another, each giving a different reading.',
  },
  // 随想、启发、别人的思路：几列波相遇。
  //
  // 这一本收三样东西 —— 自己的随想、得到的启发、看到别人的思路。
  // 前两个方案都只说中了一样：
  //   棱镜与光谱  说了"灵光一闪是离散的"，但只有一个源，没有"来自别处"；
  //               而且那张 99% 是留白，几根彩虹谱线就把色彩判据拉垮。
  //   杠杆        说了"以小博大"，"来自别处"和"还没成形"一样没说到。
  //
  // 干涉能同时说到三样：两列波相遇，产生的图样两列各自都没有 ——
  // 那正是看到别人的思路之后发生的事。而且水是站点的主色（首页那条河、
  // 整条 --water-* 色阶），四本里终于有一本真正用上它。
  notes: {
    zh: 'Notes',
    en: 'Notes',
    motif:
      'Subject: the surface of still shallow water, seen from directly above. ' +
      'A single set of concentric ripples spreads outward from one point in the lower right, ' +
      'its rings widening across the water and running off the edges. ' +
      'A small terracotta pebble rests at the centre of the rings, the only warm note. ' +
      'The rest of the water is calm and unbroken.',
    // 水要铺满整幅才没有边界，容不下"主体偏右下、标题缩在左上的纸面"。
    // 标题改压在左上那片没有波及的静水上 —— 位置仍与另外三本呼应。
    layout:
      'Composition: the water fills the entire frame; ' +
      'the upper-left area stays calm and unbroken.',
  },
};

/** 拼出一期封面的完整 prompt。存进 frontmatter 的就是它的返回值。 */
export function albumPrompt(album: keyof typeof MOTIFS): string {
  const { motif, layout } = MOTIFS[album];
  return [BASE, motif, layout ?? LAYOUT, NO_TEXT, FORBIDDEN].join(' ');
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
 * /about 的配图。
 *
 * 原来画的是「Be water, my friend.」的视觉转译（石头是"形"、静水是"适应"）。
 * 转译本身没错，错在母题选偏了 —— 那句话已经是首页的大标题，About 的图
 * 等于把站点的座右铭又说一遍。
 *
 * 而 About 这一页自己说的是另一件事：
 *
 *     Sumoer 找了点有趣的东西放在这里。
 *     If it's interesting, it's worth chasing.
 *
 * 核心是"觉得有意思就去追"，不是"保持适应"。
 *
 * 试过分格标本盘，不行 —— 格子是"归档"的语言：每样东西被分好类、各就各位，
 * 说的是"我收集完了"。而 chasing 是进行时，盒子把一件正在做的事画成了
 * 已完成的事。而且盒子有边，画面立刻封闭。
 *
 * 改成散落的鹅卵石：没有容器就没有边界，可以散、可以叠、可以跑出画外。
 * 它和这个站也是同源的 —— 石头被磨圆本来就是水的作品；有几颗还湿着、
 * 带着光泽，说明是刚捡起来的，是新鲜的、还在进行的。
 *
 * 与封面的分别：这张不烤任何文字（旁边就是真排版的正文）。
 * 封面是一本书的脸，这张是一段文字旁边的插图。
 */
export function aboutPrompt(): string {
  return sitePrompt(
    'Subject: river-worn pebbles scattered across white paper, seen from directly above. ' +
      // 颜色不能平列着写 —— 平列的话模型会均匀分配，深色就占了大头。
      // 要写清主次：浅的是主，深的是点。
      'Most of them are pale and well-rounded: chalk white, milky jade green, soft dove grey, ' +
      'smooth and plump rather than flat or angular. ' +
      'A few darker slate-blue or near-black stones sit among them as accents, not as the main note. ' +
      'Some are still wet and catch the light in a bright highlight; the rest are dry and matte. ' +
      'Each casts a soft shadow on the paper. ' +
      'They lie at uneven distances, a few touching, most apart. ' +
      'The scattering continues past the edges of the picture on two sides.',
    'Editorial still life, 3:4 vertical',
  );
}
