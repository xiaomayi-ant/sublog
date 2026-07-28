import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// 统一的文章 schema：标题、摘要、发布日期、标签数组、草稿标记。
// harness / llm / eval / notes 四类共用，/blog 索引按类型分组、按标签筛选。
const researchSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const harness = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/harness' }),
  schema: researchSchema,
});

const llm = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/llm' }),
  schema: researchSchema,
});

const evals = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/eval' }),
  schema: researchSchema,
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: researchSchema,
});

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
    demo: z.url().optional(),
    repo: z.url().optional(),
    cover: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

// 目录名 eval 与 JS 保留字冲突，变量叫 evals，对外的 collection 名仍是 eval。
export const collections = { harness, llm, eval: evals, notes, projects };
