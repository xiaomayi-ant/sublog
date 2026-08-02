// 履历时间线的数据与刻度计算。
//
// 轴是"年"的等距刻度，不是真实时间的比例尺 —— 十年就是十等份，
// 哪一年发生了什么由里程碑标记，年与年之间不因事件多少而伸缩。

/** 轴的起点。终点跟着当前年份走。 */
export const START_YEAR = 2017;

export interface Milestone {
  /** 四位年份 */
  year: number;
  /** 1–12；决定它落在这一年的哪个位置 */
  month: number;
  /** 轴上显示的短标签 */
  label: string;
}

/**
 * 履历里程碑。只到"年"这一级，所以 month 一律取 1 —— 标记正好落在那一年的珠子上。
 * 加一条就是一行。
 */
export const MILESTONES: Milestone[] = [
  { year: 2017, month: 1, label: 'Office' },
  { year: 2018, month: 1, label: 'MySQL' },
  { year: 2019, month: 1, label: 'BI' },
  { year: 2020, month: 1, label: 'Random Forest' },
  { year: 2021, month: 1, label: 'CNN' },
  { year: 2022, month: 1, label: 'GPT-3.5' },
  { year: 2023, month: 1, label: 'ChatBot' },
  { year: 2024, month: 1, label: 'LangGraph' },
  { year: 2025, month: 1, label: 'Multi-Agent' },
  { year: 2026, month: 1, label: 'Harness' },
];

/** 某一年的里程碑，没有就是 undefined。 */
export function milestoneFor(year: number, milestones = MILESTONES): Milestone | undefined {
  return milestones.find((milestone) => milestone.year === year);
}

/**
 * 轴上标注的年份：START_YEAR 到当前年，含两端。
 * @param {number} [now] 当前年份，便于测试注入
 */
export function axisYears(now = new Date().getUTCFullYear()): number[] {
  const end = Math.max(START_YEAR, now);
  return Array.from({ length: end - START_YEAR + 1 }, (_, index) => START_YEAR + index);
}

/**
 * 把「年 + 月」换算成轴上的百分比位置。
 *
 * 分母取「年数」而不是「年数 − 1」：这样每一年占据一整段，年份标签标的是那一年的**起点**，
 * 而不是一个点。否则最后一年会被压成零宽，今天的位置会溢出到 100% 之外。
 */
export function axisPosition(year: number, month: number, now = new Date().getUTCFullYear()): number {
  const span = Math.max(1, Math.max(START_YEAR, now) - START_YEAR + 1);
  const offset = year - START_YEAR + (Math.min(12, Math.max(1, month)) - 1) / 12;
  return Math.min(1, Math.max(0, offset / span));
}

/** 今天在轴上的位置——小人最终停在这里，随真实时间自己往右挪。 */
export function todayPosition(date = new Date()): number {
  return axisPosition(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCFullYear());
}

/** 走完全程的时长（ms）。CSS 与刻度延迟共用这一个数，避免两边各写各的。 */
export const WALK_SPAN_MS = 9600;

/** 迈一步的周期（ms）。必须与 WALK_SPAN_MS 同比例缩放，否则脚会比人快。 */
export const WALK_STEP_MS = 480;

/**
 * 某个刻度该在第几毫秒显现 —— 也就是小人走到它跟前的时刻。
 *
 * 行进是 linear 的，位置与时间成正比；但小人的终点是 now（约 95%）而不是 100%，
 * 所以要用 now 作分母，否则末尾几颗珠子会在他到站之后才冒出来。
 */
export function revealDelay(position: number, now: number, span = WALK_SPAN_MS): number {
  if (!(now > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, position / now));
  return Math.round(ratio * span);
}

/**
 * 年份标签的抽稀步长。
 *
 * 轴宽是固定的，年份却每年多一个 —— 珠子可以一直加下去，标签不行：
 * 四位数年份约 30px 宽，一旦每年的间距掉到 40px 以下就会互相撞。
 * 所以珠子照旧每年一颗，标签按步长抽稀。
 */
export function labelStride(yearCount: number): number {
  if (yearCount <= 12) return 1;
  if (yearCount <= 24) return 2;
  return 5;
}

/** 该不该给这一年标注：按步长抽稀，但首尾两年永远保留。 */
export function shouldLabelYear(year: number, years: number[], stride = labelStride(years.length)): boolean {
  if (years.length === 0) return false;
  if (year === years[0] || year === years[years.length - 1]) return true;
  return (year - years[0]) % stride === 0;
}
