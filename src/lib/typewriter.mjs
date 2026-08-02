// 打字机节奏：按"光标每秒走多少像素"排期，而不是按字数。
//
// 中文字宽约是拉丁字符的 2.4 倍。若按字数计时，同一句话的中英文要么总时长差三倍，
// 要么光标推进速度差三倍——两种都读得出破绽。以像素定速后，两种语言的光标在屏幕上
// 以同一速度移动，长度、字号、字体换了都不用重调参数。

/** 光标推进速度（px/s）。整块文字只有这一个节奏常数。 */
export const CARET_SPEED = 210;
/** 行与行之间的停顿（ms）。 */
export const LINE_GAP = 180;
/** 首行开口时间（ms）：等标题最后一个字母落位。 */
export const FIRST_DELAY = 2850;

/**
 * @typedef {object} TypedLine
 * @property {number} width 该行文字的真实像素宽度
 * @property {number} characters 字符数，决定逐字的颗粒度
 */

/**
 * @param {TypedLine[]} lines
 * @param {{ caretSpeed?: number, gap?: number, start?: number }} [options]
 * @returns {{ delay: number, duration: number, steps: number }[]}
 */
export function paceLines(lines, options = {}) {
  const { caretSpeed = CARET_SPEED, gap = LINE_GAP, start = FIRST_DELAY } = options;
  if (!(caretSpeed > 0)) throw new RangeError('caretSpeed must be positive.');

  let cursor = start;

  return lines.map(({ width, characters }) => {
    // 时长只由宽度决定 —— 这是"速度一致"的全部内容
    const duration = Math.max(1, Math.round((Math.max(0, width) / caretSpeed) * 1000));
    // 步数仍按字符走，保留逐字敲出的颗粒感，而不是平滑地拉开
    const steps = Math.max(1, Math.round(characters));
    const plan = { delay: cursor, duration, steps };
    cursor += duration + gap;
    return plan;
  });
}
