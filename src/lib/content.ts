// 文章内容的共享读取与格式化逻辑
import { getCollection, type CollectionEntry } from 'astro:content';

// 顺序即展示顺序：/albums 的卡片和 /blog 的分组都按它排。
// LLM → Harness → Eval → Notes 读作"模型本身 → 如何驾驭 → 如何评估 →
// 由此想到的"，是一条从底层往上的线；原来的顺序没有这层意思。
export const COLLECTIONS = ['llm', 'harness', 'eval', 'notes'] as const;
export type ResearchCollection = (typeof COLLECTIONS)[number];
export type ResearchEntry = CollectionEntry<ResearchCollection>;

// 类型的中英文标注：英文是主名，中文是释义。
//
// harness 没有释义 —— 中文里没有对得上的词。原来写「执行框架」是意译，
// 既不准确也比另外三个长一截，读起来像另一个层级的东西。宁可留原词。
// 于是它的 zh 与 en 相同，中英并置的地方要靠 hasDistinctZh 避免
// 显示成「Harness / Harness」。
export const TYPE_LABELS: Record<ResearchCollection, { zh: string; en: string }> = {
  harness: { zh: 'Harness', en: 'Harness' },
  llm: { zh: '模型', en: 'LLM' },
  eval: { zh: '评估', en: 'Eval' },
  notes: { zh: '笔记', en: 'Notes' },
};

/** 这个类别的中文名是不是真的另一个词。false 表示它只有原词，别并置着显示两遍。 */
export const hasDistinctZh = (name: ResearchCollection): boolean =>
  TYPE_LABELS[name].zh !== TYPE_LABELS[name].en;

/**
 * 把类别名和后面的中文接起来：「模型相册」但「Harness 相册」。
 * 拉丁词和汉字之间留一个空格是中文排版的常规，不留会挤在一起。
 */
export const labelWith = (name: ResearchCollection, zhSuffix: string): string =>
  hasDistinctZh(name)
    ? `${TYPE_LABELS[name].zh}${zhSuffix}`
    : `${TYPE_LABELS[name].zh} ${zhSuffix}`;

// 合并四个 collection 的非草稿文章，按 pubDate 倒序
export async function getAllResearch(): Promise<ResearchEntry[]> {
  const all = await Promise.all(
    COLLECTIONS.map((name) => getCollection(name, ({ data }) => !data.draft)),
  );
  return all.flat().sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

// 按类型分组（保持 COLLECTIONS 顺序）
export async function getResearchByType(): Promise<
  { name: ResearchCollection; entries: ResearchEntry[] }[]
> {
  const all = await getAllResearch();
  return COLLECTIONS.map((name) => ({
    name,
    entries: all.filter((entry) => entry.collection === name),
  }));
}

// 收集全部非草稿文章的标签（去重，按字母序）
export async function getAllTags(): Promise<string[]> {
  const all = await getAllResearch();
  return [...new Set(all.flatMap((entry) => entry.data.tags))].sort();
}

export function articleUrl(entry: ResearchEntry): string {
  return `/blog/${entry.collection}/${entry.id}`;
}

// ── 项目 ──────────────────────────────────────────────────
export type ProjectEntry = CollectionEntry<'projects'>;

// 项目状态的中文标注（状态点颜色在模板里定义）
export const STATUS_LABELS: Record<ProjectEntry['data']['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

// 非草稿项目：featured 优先，其余按 pubDate 倒序
export async function getAllProjects(): Promise<ProjectEntry[]> {
  const all = await getCollection('projects', ({ data }) => !data.draft);
  return all.sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
  });
}

export function projectUrl(entry: ProjectEntry): string {
  return `/projects/${entry.id}`;
}

// 2026.07.28 格式；frontmatter 的日期按 UTC 解析，故也用 UTC 取值，避免时区偏移一天
export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}
