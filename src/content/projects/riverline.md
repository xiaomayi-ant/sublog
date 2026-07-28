---
title: Riverline
tagline: 一个把 Markdown 笔记渲染为静态时间线的小工具
status: paused
type: Tool
built: 2025–2026
pubDate: 2025-11-12
featured: false
draft: false
---

## 为什么存在

想给自己多年的零散笔记一个「按时间看」的视图，又不想把它们搬进任何在线服务。

## 解决什么问题

静态博客生成器大多假设你在写「文章」，而笔记是碎片的、持续修改的。Riverline 只按文件的修改时间和 frontmatter 日期把笔记排成一条可滚动的时间线。

## 如何工作

扫描目录，解析 frontmatter，输出单个 HTML 文件，没有构建步骤之外的状态：

```bash
riverline ./notes --out timeline.html
```

## 关键设计决策

- 单文件输出，双击就能看；
- 不做编辑器、不做标签系统，时间线就是全部。

## 当前局限

功能已经满足自用，但中文分词搜索一直没做，所以暂停在「能用」的状态。等本地优先写作工具的检索方案成熟后再回来统一处理。
