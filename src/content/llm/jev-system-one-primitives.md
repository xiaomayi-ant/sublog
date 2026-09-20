---
title: Jev：三个问题原语
description: Jev 的 API 不是聊天接口，是三种类型化问题原语——Choice、Score、Noul，一次调用里并行提问、结构化返回。置信度怎么用，官方给的不是一个阈值，是一套按操作风险分层的规则。
pubDate: 2026-09-20
tags: [llm]
draft: false
---

TypeSafe AI 官方文档对 Jev 接口的定位：

> System One models are built to make fast, structured decisions that software can use directly.[^1]

不是聊天接口。传统用法是让模型吐一段文本，代码再自己写正则或解析器把结果抠出来；Jev 的调用方式反过来——直接问它几个类型化的问题，拿到的答案本身就是代码能直接消费的结构。

## 三个问题原语

三种问题类型，覆盖单选、评分、是非三类判断：

| 原语 | 用途 | 返回值 |
| --- | --- | --- |
| Choice | 从一组选项里选一个 | `choice`（选中项）+ `probabilities`（各选项概率分布）+ `confidence`（分布有多集中） |
| Score | 在一组有序等级上打分 | `score`（可以落在两个等级之间的连续值）+ `probabilities` + `legend`（等级说明）+ `confidence` |
| Noul | 判断一句话是否成立 | `noul`：0 到 1 之间的概率值，越接近 1 越「是」；没有单独的 confidence 字段，因为这个值本身就是概率[^2] |

Choice 最多支持 255 个选项，Score 的等级数在 2 到 10 之间[^3]。两者的 confidence 算法一致：概率分布越集中在一个选项/等级上，置信度越高，分布越平摊则越低——官方反复强调的一点是，confidence 不是模型自己声称的一个数字，是从内部概率分布算出来的[^1][^2]。

## 一次调用长什么样

一次 `systemOne` 调用可以混合三种原语一起问，官方给的示例（原样摘录，JS 版）：

```js
import { choice, noul, score, TypeSafeClient } from '@typesafe-ai/sdk'

const client = new TypeSafeClient()

const ticket = 'The export button crashes the settings page in Safari. Works in Chrome, but some of our customers only use Safari.'

const { answers, model, usage } = await client.systemOne({
  state: { ticket },
  questions: {
    category: choice('What kind of ticket is `ticket`?', {
      bug_report: 'Something is broken or behaving wrong',
      feature_request: 'Asks for something that does not exist yet',
      billing: 'Charges, invoices, refunds',
      other: null,
    }),
    severity: score('How severe is the issue in `ticket`?', [
      'Cosmetic; no impact on functionality',
      'Broken or degraded feature, but a workaround exists',
      'Blocking issue; no workaround exists',
    ]),
    has_repro_steps: noul('Does `ticket` say how to reproduce the problem?'),
  },
})
```

安装与鉴权都很轻：JS/TS 装 `@typesafe-ai/sdk`（Node.js ≥ 20），Python 装 `typesafe-sdk`（Python ≥ 3.10）；鉴权走环境变量 `TYPESAFE_API_KEY`，客户端自动读取，key 从 console.typesafe.ai/keys 拿[^1]。

## 三个问题互相看不见

容易被忽略的一条：同一次调用里的多个问题是并行、独立评估的，一个问题的答案不会成为另一个问题的上下文[^2]。官方原话：

> The three questions were answered in the same call, at the same time. Adding a fourth question barely changes the response time.[^2]

好处是便宜——这种用法官方称为「投机式扇出」（speculative fan-out）：一次调用里把可能用得上的问题全问了，并行评估让多问一个问题的延迟成本几乎为零[^2]。代价是如果问题 B 的判断逻辑上依赖问题 A 的答案（比如先判断是不是投诉，再决定要不要打严重程度分），Jev 不会替你做这层推理——两个问题会被同时、独立地问出去，B 不知道 A 答了什么。这类有依赖关系的判断需要拆成两次调用，不能指望模型在一次调用内部自己串起来。

## 置信度怎么用

官方明确反对给整个系统设一个统一的置信度阈值，建议按操作的风险分层：查余额这类低风险、可逆操作，阈值可以放到 0.5；转账审批这类高风险、不可逆操作，要求 0.9 以上才自动执行，中间地带转人工确认[^1][^3]。核心原则：

> The risk tolerance lives in your code, in numbers you can read and change.[^2]

置信度阈值不是模型内置的判断，是使用方写在代码里、能按实际出错代价调整的数字。

## 输入的边界

`state` 字段接受字符串、JSON 对象，或一段文本数组；信息不止一份时用对象，问题里用反引号加字段名（比如 `` `ticket` ``）指向具体字段[^2][^3]。上下文预算是 64k token（`state` 加所有问题共享），单个问题最长 32k token[^2]；目前只吃文本，不支持图像或音频输入[^3]——这条边界和站内之前那篇范式分析对上：Jev 目前仍然是一个纯文本决策模型[^4]。

[^1]: TypeSafe AI. "Introduction." *TypeSafe AI Docs*, 2026年9月。https://docs.typesafe.ai/introduction
[^2]: Flavio Copes. "A deep dive into Jev, TypeSafe's System One model." 2026年9月。https://flaviocopes.com/jev/ ——对官方文档的逐句摘录与代码示例复现，speculative fan-out、并行独立评估等细节均出自此文对官方文档的转录。
[^3]: "How to Use Jev: A practical guide to TypeSafe's System One model." *DEV Community*, 2026年9月。https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e
[^4]: 延伸阅读——Jev 作为一种模型范式，和过去自回归语言模型的区别、以及这条路径为什么被开发者选择：《Jev：不写字，只判断》，sumoer.fun/blog/llm/jev-decision-paradigm
