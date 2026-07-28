import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 统一的研究内容 schema：标题、摘要、发布日期、标签数组、草稿标记。
// essays / notes / experiments 三类共用，Phase 3 的 /research 索引按类型分组、按标签筛选。
const researchSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const essays = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/essays' }),
  schema: researchSchema,
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: researchSchema,
});

const experiments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/experiments' }),
  schema: researchSchema,
});

export const collections = { essays, notes, experiments, projects };

// 项目 schema：结构化 metadata（STATUS/TYPE/BUILT）+ 可选链接与封面。
// 正文遵循固定叙事结构（为什么存在/解决什么问题/如何工作/设计决策/当前局限），
// Demo / 源码链接由详情模板统一渲染。
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    status: z.enum(['active', 'paused', 'archived']),
    type: z.string(),
    built: z.string(),
    pubDate: z.coerce.date(),
    demo: z.string().url().optional(),
    repo: z.string().url().optional(),
    cover: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});
