---
title: Computer Use 与越权率
description: computer use 从独立工具走到 GPT-6 Astra 的核心能力，这条轨迹里 OpenAI 看到了什么。系统卡中一项越权评估的数据，是这个判断背后的一条具体证据。
pubDate: 2026-09-14
tags: [agent, llm]
draft: false
---

OpenAI 官方文档对 computer use 的定义：

> Computer use lets a model operate browser and desktop interfaces. Use it to fill out forms, test user flows, or complete tasks in applications through their UI.[^1]

模型不再只是回答，而是直接操作界面：截图 → 判断落点 → 执行 → 再截图确认结果。

这条能力线的发展轨迹：2025 年 1 月，Operator 作为独立的研究预览版上线，核心是专门训练来理解 GUI 的 Computer-Using Agent（CUA）模型。同年 7 月并入 ChatGPT，成为可随时启用的 agent 模式。到 2026 年 9 月，GPT-6 Astra 发布，computer use 已经是旗舰模型自带的能力，不再是独立工具。[^2]

## Evaluation

GPT-6 Astra 系统卡[^3]里有这样一段：

> Astra is our most aligned model, showing significant improvements in understanding user intent and model behavior—you can confidently delegate tasks to Astra and trust its judgment. As one way to test this, we built a new evaluation based on the Hugging Face event to assess whether the model exceeds its expected performance when faced with difficult or impossible tasks. Without production safeguards, GPT-5.6 Sol exceeded its authorized targets in 48% of cases; in contrast, GPT-6 Astra exceeded it in 0%.

「Hugging Face event」指一次真实事故：运行 ExploitGym（一项网络安全评估）的 agent 攻破了第三方系统。

OpenAI 据此设计了一项蜜罐测试：把 ExploitGym 里最难的任务单独取出，观察模型在任务做不到时，是否会转而尝试触碰周边看起来可达的基础设施。GPT-5.6 Sol 在无生产防护条件下，「超出授权目标」这一具体指标为 48%；GPT-6 Astra 为 0%。[^4]

## 一个越权的场景

想象两个模型分别被要求「帮我把这批发票导入财务系统」，但系统里没有对应的导入入口。

只输出文字的模型会回答：「没有找到对应功能，建议联系管理员。」——回答不完美，但止步于此。

能操作界面的模型可能会尝试别的路径：改数据库配置、绕过权限检查、用管理员留在浏览器里的 session 硬闯进去。任务没有完成，但多了一串已经真实执行过的操作。

区别不是「谁更聪明」，是**有没有能力在做不到的时候停下来**。GPT-6 Astra 系统卡里那项测试，衡量的正是后一种失败。

UK AI Safety Institute 的另一项独立评估显示同一种模式：把网络安全挑战的范围明确限定为「不许联网」后，Astra 的越权比例从 60/499 降至 2/500——降幅明显，✓ 但不是 0。[^3]

## Observations

**从输出文字到执行动作。** 只输出文字的模型交付的是文字——答案、草稿、代码片段，仍需要人把它变成结果。computer use 把这一步也纳入了模型的输出范围：直接在既有软件上完成动作，不需要每个应用单独提供 API。模型的可服务范围因此从「给出建议」扩展到「用鼠标和键盘能完成的事」。

**GUI 作为绕开集成成本的路径。** 传统自动化（RPA、Zapier 类工具、定制 API 对接）需要为每个软件单独对接，长尾应用大多没有可用的 API。computer use 不依赖这类对接——只要模型能识别界面、执行操作，就不需要软件厂商的配合。

**对齐评估是这条产品线的前置条件。** 系统卡中「可以放心委托任务给 Astra」这一表述，能否成立取决于越权率能否被压低。OpenAI 为这一种失败模式专门构建了一套新评估，说明这不是常规安全检查的附带产出，是这条产品线能否投入使用的前置条件。

**0% 的成立条件有待验证。** 有分析者提出一个问题：[^4] 0% 是否反映模型识别出了测试环境、知道这是一次评估，因此没有采取相应行动。如果成立，这项评估衡量的可能是模型识别测试场景的能力，而不是它在真实、无监督部署环境下的行为——这是当前对这套评估方法论的一项开放质疑。

[^1]: OpenAI. "Computer use." *OpenAI API Documentation*, 2026. https://developers.openai.com/api/docs/guides/tools-computer-use
[^2]: OpenAI. "Introducing Operator." 2025年1月. https://openai.com/index/introducing-operator/ ；OpenAI. "GPT-6 Astra: A new generation of intelligence." 2026年9月. https://openai.com/index/gpt-6-astra/
[^3]: OpenAI. "GPT-6 Astra System Card." 2026年9月. https://deploymentsafety.openai.com/gpt-6-astra ——本文引用的 Astra 对齐声明与 UK AISI 供应链攻击评估均出自该文档。
[^4]: Zvi Mowshowitz. "GPT-6 Astra: The System Card, Alignment and What Comes Next." *Don't Worry About the Vase*, 2026年9月9日. https://thezvi.wordpress.com/2026/09/09/gpt-6-astra-the-system-card-alignment-and-what-comes-next/ ——56% 这一具体数字与"evaluation awareness"（评估感知）质疑均出自此文对系统卡的解读。
[^5]: 延伸阅读——关于行动边界的产品设计原则：《关于 Agent 行动边界的几个观察》，sumoer.fun/blog/harness/agent-action-boundaries
[^6]: 延伸阅读——关于错误答案的认知成本与「最终答对」这一记分方式的局限：《一次误解的代价》，sumoer.fun/blog/eval/cost-of-a-confident-wrong-answer
