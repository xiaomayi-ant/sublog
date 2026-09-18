---
title: Jev：不写字，只判断
description: Jev 用并行采样直接吐出带校准概率的类型化决策，不生成文字——这和自回归语言模型是两条不同的路，架构和训练目标是一起换的。它自己公布的评测数字之外，Every 给出了目前唯一一份独立测试。
pubDate: 2026-09-18
tags: [llm, evaluation]
draft: false
---

TypeSafe AI 官方博客对 Jev 的定义：

> Jev is a new class of frontier models built to make fast, structured decisions that software can use directly.[^1]

不生成文字。自回归语言模型逐 token 生成，每一个 token 都以前面已经吐出的内容为条件；Jev 用的是并行采样器，一次查询把所有输出同时生成：

> Generates all outputs in a single query. Incredibly efficient and hardware-aware.[^1]

输出的形式也不一样。语言模型吐字符串——句子、代码、JSON，都是拼出来的文本，格式对不对、内容准不准，全靠训练和提示词去约束。Jev 吐的是预先声明好的类型化值：给定一组候选选项，返回其中之一，附带一个校准过的概率。类型错误在数学上不可能发生，因为输出空间从一开始就是有限、封闭的。

## 变了的不是速度，是训练目标

这不是同一条技术路线上的又一次提速，是两套不同的优化目标。语言模型这些年靠的是 RLHF（人类反馈强化学习）和 RLVR（可编程验证的强化学习）——前者优化「人喜欢读的文本」，后者优化「能通过测试的代码」。TypeSafe 给 Jev 配的是另一套训练方法，叫「校准决策强化学习」（RLCD）：

> training method we call Reinforcement Learning for Calibrated Decisions (RLCD)[^1]

用 Brier 分数一类的合理评分规则计算 reward，优化目标不是「答案像不像人写的」，是这个概率本身诚不诚实。架构和训练目标是一起换的：并行采样器省下来的是逐 token 生成的时间，RLCD 对付的是语言模型的一个老毛病——一句错误的回答和一句正确的回答，读起来常常一样自信。非自回归采样、reward 里塞入合理评分规则，各自都有研究脉络，不算新；把两者绑在一起、专门喂给软件里的决策点，是 Jev 这次的新组合。

## 为什么走这条路

创始人 Diogo Almeida 此前在 OpenAI，是 InstructGPT 论文的作者之一——那篇论文是 RLHF 用到 ChatGPT 上的奠基工作[^2]。TypeSafe 这次发布开篇提的问题是：

> Models have been superhuman at chat for years, so where is all the automation?[^1]

自由生成的文本对聊天场景是优点——语气、措辞、篇幅都可以灵活调整；对嵌入软件控制流的场景是缺点——软件要的是一个能判断真假的分支条件，不是一段需要解析、且随时可能跑偏的字符串。官方给出的具体理由：

> If a model can do a task 95% of the time but doesn't say when it's in the 5%, it can't automate that task.[^1]

这句话点出自动化的真正瓶颈：不是模型够不够聪明，是模型知不知道自己什么时候不知道。语言模型的置信度混在语气里，很难单独拿出来用；Jev 把置信度做成一个专门训练过的输出字段。这也是 TypeSafe 把 Jev 定位成软件里「模糊 if 语句」的原因：分类、路由、评分、提取——这些原本要靠人工规则硬编码、或者靠解析不稳定的语言模型输出去做的判断点。

## Evaluation

TypeSafe 自己的测试横跨安全事件响应、agent 轨迹可观测性、发票处理、客服四类工作流：Jev 平均准确率 67.8%，成本 0.0004 美元/例，0.4 秒；对照的 GPT-5.6 Terra 是 67.9% / 0.0304 美元 / 10.1 秒，Opus 5 是 73.1% / 0.1761 美元 / 37.8 秒[^3]——速度和成本的差距是数量级的，准确率的差距不是。但这组参照答案本身值得停一下：ground truth 不是独立的人工标注，是 GPT-6 Astra 和 Claude Fable 5.1 在高推理设置下给出答案的平均值[^3][^4]，用另外两个语言模型的输出去定义「正确答案」，再拿这个「正确答案」给 Jev 打分——这个方法论有没有偏差，TypeSafe 自己也承认存在风险[^4]。

目前唯一一份不是 TypeSafe 自己跑的测试，来自 Every 的 Mike Taylor[^5]。他把自己写过的 27 篇文章、加上 10 篇刻意模仿的 AI 风格对照文本喂给 Jev，21 个问题并发提问，777 次判断在 0.7 秒内全部跑完，成本约四分之一美分。在另一组 12 段合成文本、7 类预设写作缺陷的测试里，Jev 找出了 6 类，Fable 5.1 找全了 7 类——Jev 中位数每段 0.35 秒，Fable 5.1 是 8.83 秒，快了约 25 倍，成本便宜约 580 倍[^5]。差的那一类缺陷是「未解释的行动」——判断一段描述有没有交代清楚动机，这类判断比纯粹的风格识别更依赖对上下文的理解。Taylor 自己的结论：投入生产前还想做更彻底的准确率核查，但作为早期预警层，这个精度已经够用[^5]。

## Observations

**范式在往「收窄输出空间换可靠性」这个方向走，不止 Jev 一家。** 站内之前写过 OUI-1[^6]，用扩散模型一次性生成一整屏 UI，靠的也是把输出限定在一个组件库的有限组合里，换来复杂界面之外场景下更高的可靠性和速度。OUI-1 收窄的是「UI 长什么样」，Jev 收窄的是「答案是哪几个选项」——两条路径赌的是同一件事：通用自回归生成的自由度，对很多具体场景是负资产，不是正资产。

**校准的价值取决于能不能被验证，而验证目前只有一份独立样本。** Every 的测试和 TypeSafe 自己的数字方向一致，但样本量、任务类型都有限，也没有覆盖「高置信度判断里，多少比例真的对」这个最核心的校准问题——目前公开的数字里，还没有一份专门针对校准曲线本身的独立评测。

**下一步大概率不是更大的模型，是更多类型的决策原语。** TypeSafe 自己的说法很克制：

> We're still in Jev's early days. We have a lot more in the pipeline and are so excited to keep on shipping.[^1]

没有给出具体路线。从已知的设计目标——软件可以直接调用的类型化决策——往前推，比较自然的延伸方向是把输出类型从「分类 + 概率」扩展到更结构化的对象（带字段约束的记录，接近 OUI-1 的组件级输出），以及把「不确定就转交给语言模型」做成官方支持的混合管线，而不是使用者自己拼接。这两条是从当前材料推出来的方向，不是 TypeSafe 已经证实的路线图。

[^1]: TypeSafe AI. "Introducing System One Models & Jev." *TypeSafe AI Blog*, 2026-09-15. https://typesafe.ai/blog/introducing-system-one-models-and-jev
[^2]: "Former OpenAI researcher builds an AI model that judges options instead of writing text." *The Decoder*, 2026年9月。https://the-decoder.com/former-openai-researcher-builds-an-ai-model-that-judges-options-instead-of-writing-text/
[^3]: DataCamp. "Jev: TypeSafe's System One Model That Never Hallucinates." 2026年9月。https://www.datacamp.com/blog/system-one-models-jev ——TypeSafe 自己设计的四工作流评测数字，经此文转述。
[^4]: Anthony Maio. "Jev: The Language Model That Won't Talk." 2026年9月。https://anthonymaio.substack.com/p/jev-the-language-model-that-wont ——对 ground truth 方法论的质疑与发票处理场景的具体数字均出自此文。
[^5]: Mike Taylor. "Mini-Vibe Check: TypeSafe's Jev Judged Everything I've Written in 0.7 Seconds." *Every*, 2026年9月。https://every.to/also-true-for-humans/mini-vibe-check-typesafe-s-jev-judged-everything-i-ve-written-in-0-7-seconds
[^6]: 延伸阅读——同一种「收窄输出空间换可靠性」的范式选择，在扩散式 UI 生成上的具体案例：《OUI-1：一秒生成一整屏 UI，代价是什么》，sumoer.fun/blog/eval/oui-1-generative-ui-diffusion
