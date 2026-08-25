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

// 相册：四个写作方向各一本，按月出期。
//
// 这里只存元数据，图片本身在 OSS 上 —— 仓库和构建产物都不因为图片变大。
// 每一期都保留生成用的 prompt 和模型名：图像生成不可复现，同一条 prompt 跑两次
// 结果不同，所以「这一期封面是怎么来的」只能靠存档回答，存不下来就等于没有版本可言。
// 这一条与 culture-fragment-poster-engine 的「来源追踪」要求是同一件事。
const albums = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/albums' }),
  schema: z.object({
    // 对应写作 collection 的名字：harness / llm / eval / notes
    album: z.enum(['harness', 'llm', 'eval', 'notes']),
    // 这一本自己的封面，和"出没出期"解耦。
    //
    // 原来封面只能挂在 issue 上，于是"还没攒够文章开期"就等于"这本不能有脸"——
    // 但相册的封面说的是这一本是什么，不是某一期是什么。两件事本来就该分开。
    // 有它时索引页就用它；没有则回落到最新一期的封面。
    coverArt: z
      .object({
        cover: z.string(),
        original: z.string().optional(),
        // 与 issue 封面同样的理由：图像生成不可复现，来源存不下来就没有版本可言
        prompt: z.string(),
        model: z.string(),
        generatedAt: z.coerce.date(),
        // 出图之后又动过什么。
        //
        // 现在的封面不是模型一次吐出来的成品：先按 prompt 出画面，再（早期那几张）
        // 用图像编辑擦掉烤进去的标题，最后用真实字体把标题和装裱边合成上去。
        // 只存 prompt 的话，"照着这条 prompt 重跑一遍应该得到这张图"就是假的 ——
        // 中间那两步没写下来，来源链就断在这里。
        postProcess: z.string().optional(),
      })
      .optional(),
    issues: z
      .array(
        z.object({
          month: z.string().regex(/^\d{4}-\d{2}$/, '期号用 YYYY-MM'),
          // OSS key，相对 aigc/images/（公开读的派生图前缀）
          cover: z.string(),
          // 原图 key，相对 aigc/originals/（私有）。留着是为了以后能重出档位。
          original: z.string().optional(),
          // 生成这张封面用的完整 prompt 与模型，缺一不可 —— 见上面的理由
          prompt: z.string(),
          model: z.string(),
          generatedAt: z.coerce.date(),
          // 出图之后又动过什么，理由见 coverArt.postProcess
          postProcess: z.string().optional(),
          // 这一期收录了哪些文章，形如 harness/agent-action-boundaries
          entries: z.array(z.string()).default([]),
        }),
      )
      .default([]),
  }),
});

// 目录名 eval 与 JS 保留字冲突，变量叫 evals，对外的 collection 名仍是 eval。
export const collections = { harness, llm, eval: evals, notes, projects, albums };
