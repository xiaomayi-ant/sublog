---
title: 这个站的正文能写成什么样
description: 一篇样张：把标题、引用、代码、表格、图片、嵌入视频各用一遍，作为以后写作时的格式参考，也作为改版时的回归对照。
pubDate: 2026-08-05
tags: [meta, writing]
draft: true
---

写之前先把能用的东西摊开一遍。这篇不讲观点，只是把正文里所有会用到的结构各写一次 —— 以后写文章时照着抄格式，改版式时拿它当回归对照，一眼就能看出哪里塌了。

## 段落与强调

正文是窄版心加 1.9 行高，中文读起来需要这个呼吸感。段与段之间靠间距分隔，不缩进首行 —— 中文排版里首行缩进和段间距只取其一，同时用会让节奏变得拖沓。

加粗留给**句子里那个真正的转折词**，不是用来划重点的荧光笔。一段里加粗超过两处，读者就不知道该看哪儿了。行内代码用来指称具体的标识符，比如 `getAllResearch()` 或者 `draft: true`，不用来做强调。

> 引用块用于别处的原话，或者需要独立出来的一句判断。
> 左侧那条竖线是天空蓝，比正文浅，不抢视线。

## 三级标题

### 这是 h3

h3 用于二级标题内部的分节。到这一层基本够用了，再往下说明结构可能有问题。

#### 这是 h4

h4 是小写标签样式，不是标题的第四层，适合给一段代码或一个表格做题注。**能不用就不用。**

## 代码

代码块用来放原始材料 —— 提示词原文、配置片段、真实的报错输出。不是用来展示"我写了代码"。

```js
// 河流中心线：低频噪声叠加，保证有限且局部连续
export function centerline(t, progress) {
  return smoothNoise(t * 0.6 + progress) * 0.35
       + smoothNoise(t * 1.7 - progress * 0.4) * 0.12;
}
```

长行会横向滚动，不会撑破版心：

```text
2026-08-04T16:11:39Z promote release=v0.0.1-20260804161026-a2c0be2 previous=v0.0.1-20260728163717-1fce3ed
```

## 表格

表格适合放对照结果。窄屏上它会横向滚动，滚到边界不会把整页带走。

| 环节 | 触发方式 | 耗时 | 失败时的表现 |
| --- | --- | --- | --- |
| 构建与测试 | push 到 main | 约 45 秒 | Actions 标红，不发布 Release |
| 发布产物 | 测试通过后自动 | 数秒 | 同上 |
| 服务器拉取 | 定时器每 2 分钟 | 约 10 秒 | 保持旧版本，写 deploy.log |
| 切换上线 | 校验通过后 | 瞬时 | 符号链接不动，线上无感 |

表头是标签字体、小字号、大写字距，比正文轻，不喧宾夺主。

## 图片

直接用 markdown 语法就够了，图片放在 `src/assets/` 下用相对路径引用，构建时会被压缩并自动生成尺寸信息：

![首页的两屏布局](../../assets/sample-home.webp)

要加说明文字就手写 `<figure>` —— markdown 的 `![]()` 只生成裸 `<img>`，给不出 figcaption：

<figure>
  <img src="/images/hero-watercolor-shore-v1.webp" alt="首页水彩海岸背景" loading="lazy" />
  <figcaption>手写 figure 时图片要放 <code>public/</code> 并用绝对路径，这条路径不经过压缩优化。</figcaption>
</figure>

两种写法各有代价：markdown 语法能享受构建期优化但没有说明文字，手写 figure 有说明文字但图片不被优化。图多的文章建议用前者，配一句正文说明。

## 视频

**视频不要放进仓库。** 部署产物有 100MB 上限，而且每次发布都会重传整站，视频进仓库很快会把这条链路拖垮。用嵌入：

<figure>
  <div class="embed">
    <iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD" allowfullscreen loading="lazy" title="示例嵌入"></iframe>
  </div>
  <figcaption>嵌入容器固定 16:9，窄屏自适应，不需要写死宽高。</figcaption>
</figure>

自己录的短片段如果一定要自托管，放对象存储再用 `<video>` 引用：

```html
<figure>
  <video src="https://your-bucket.example.com/clip.mp4" controls playsinline preload="none"></video>
  <figcaption>说明文字。</figcaption>
</figure>
```

## 列表

- 无序列表用于并列的东西
- 项与项之间有小间距，不挤在一起
- 超过七八项就该考虑换成表格或者小标题

有顺序的步骤才用有序列表：

1. 写 `src/content/<类型>/xxx.md`
2. `git push`
3. 三分钟后线上更新

---

分隔线用于话题的硬切换，一篇里出现一次就够。

四个分类各有各的用法：`harness` 放执行框架和工具边界，`llm` 放模型行为，`eval` 放评估设计，`notes` 放这种还没长成文章的东西 —— 门槛最低的那一类，本来就该是写得最多的。
