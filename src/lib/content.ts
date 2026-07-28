// 文章内容的共享读取与格式化逻辑
import { getCollection, type CollectionEntry } from 'astro:content';

export const COLLECTIONS = ['harness', 'llm', 'eval', 'notes'] as const;
export type ResearchCollection = (typeof COLLECTIONS)[number];
export type ResearchEntry = CollectionEntry<ResearchCollection>;

// 类型的中英文标注：英文是主名，中文是释义
export const TYPE_LABELS: Record<ResearchCollection, { zh: string; en: string }> = {
  harness: { zh: '执行框架', en: 'Harness' },
  llm: { zh: '模型', en: 'LLM' },
  eval: { zh: '评估', en: 'Eval' },
  notes: { zh: '笔记', en: 'Notes' },
};

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
