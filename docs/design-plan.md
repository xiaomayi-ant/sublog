# Water — 设计模块与实施计划

> 方向定义见 `site-direction.md`；本文档是落地的模块拆解与分阶段 TODO。
> 技术栈：Astro（内容驱动、Markdown Content Collections、默认零 JS）。

## 设计模块

1. **设计系统层** — 色彩 tokens（#FFF9EC / #10233F / #246BFF / #CFE5FF / #F5C85B，比例 75/18/6/1，黄色仅限高光/hover/激活态）、字体（中文宋体标题 + 中文无衬线正文 + 英文 sans/mono metadata）、窄行宽排版、全局 `prefers-reduced-motion` 基线。
2. **品牌标识** — 主标识「如斯」+ 辅助行 *Researching what moves, building what remains.*；甲骨文意象 SVG mark（日 + 川/水 + 星点，非字面大字）；"Be water" 仅作 About 页题跋。
3. **河流视觉** — 缓慢演化的 SVG 河流曲线，作结构线而非装饰背景；首页主构图、入口 hover 局部响应复用。
4. **未来星点层** — 低密度（<40 点）慢速移动点层，首页边缘/后段；禁止银河/科幻感；reduced-motion 时静态。
5. **布局导航** — 左上 SUMOER + 右侧极简导航；首页四段式：开篇构图 / 大号排印入口（01 研究、02 项目）/ 时间流 / 页脚。
6. **内容系统** — Content Collections：`essays` / `notes` / `experiments` 三类统一在 `/research` 下；多标签（agent/llm/aigc/evaluation/product），类型优先、标签次之；文章页含 TOC、代码复制、蓝色链接；RSS。
7. **项目展示** — `/projects` 索引 + 详情页；结构化 metadata（STATUS/TYPE/BUILT）+ 固定叙事结构（为什么/问题/如何工作/设计决策/局限/Demo/源码）。
8. **About / Now** — About 含个人叙事与题跋；`/now` 二期。
9. **工程基础** — SEO/OG、sitemap、favicon、中文字体子集化、图片优化、部署。

**明确不做（首版）**：3D 场景、密集粒子、复杂页面过渡、账号/评论/后台、技能仪表盘。

## 分阶段 TODO

- [x] Phase 0 — 脚手架：Astro minimal + TS，目录结构，Content Collections schema（`src/content.config.ts` + glob loader，Astro 7 已移除旧版 `src/content/config.ts`），build 跑通
- [x] Phase 1 — 设计系统：tokens.css、字体方案、全局样式、Meta/Prose/SiteNav/Footer 组件
- [x] Phase 2 — 首页：SVG mark、河流动画、首屏构图、大号入口 + hover、时间流、星点层、页脚
- [x] Phase 3 — Research：索引页（类型分组 + 标签）、文章详情模板（TOC/代码复制/高亮）、标签页、RSS、占位文章
- [ ] Phase 4 — Projects：索引页、详情页模板（metadata + 叙事结构 + 截图 + 链接）、首个项目
- [ ] Phase 5 — About + 收尾：About 页、SEO/OG/sitemap/favicon、性能检查、reduced-motion 与移动端走查
- [ ] Phase 6（二期）— /now、动效增强、子域名方案
