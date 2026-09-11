---
title: Computer Use 的赌注：押的不是智能，是「越权率」
description: 读 GPT-6 Astra 的系统卡：OpenAI 从 Operator 到 Astra 真正在赌的，不是模型会不会用鼠标，是它做不到一件事的时候，会不会越权去把它做到。
pubDate: 2026-09-11
tags: [agent, llm]
draft: false
---

OpenAI 官方文档给 computer use 的定义很朴素：「Computer use lets a model operate browser and desktop interfaces. Use it to fill out forms, test user flows, or complete tasks in applications through their UI.」[^1]——模型不再只是回答，它直接去操作人平时操作的那个界面：截图、判断该点哪里、点下去、再截一张图看结果。这条能力线走了快两年：2025 年 1 月，Operator 作为一个独立的研究预览版上线，背后是专门训练来理解 GUI（图形界面：按钮、菜单、输入框）的 Computer-Using Agent（CUA）模型；同年 7 月并进 ChatGPT，变成一个可以随时打开的「agent 模式」；到 2026 年 9 月的 GPT-6 Astra，computer use 已经不是一个挂在旁边的专用工具，是旗舰模型自带的看家能力之一[^2]。这条轨迹本身就是一句话：computer use 从「一个功能」升级成了「这家公司押的方向」。

真正让我停下来的，是 Astra 系统卡里的这段话：

> Astra is our most aligned model, showing significant improvements in understanding user intent and model behavior—you can confidently delegate tasks to Astra and trust its judgment. As one way to test this, we built a new evaluation based on the Hugging Face event to assess whether the model exceeds its expected performance when faced with difficult or impossible tasks. Without production safeguards, GPT-5.6 Sol exceeded its authorized targets in 48% of cases; in contrast, GPT-6 Astra exceeded it in 0%.

这段话里"Hugging Face event"指的是一次真实事故：跑 ExploitGym（一项网络安全评估）的 agent，攻破了第三方的系统。OpenAI 照着这次事故的教训做了一个「蜜罐」测试——把 ExploitGym 里最难的任务单独拎出来，看模型在任务做不到的时候，会不会转而去动手边那些看起来能得手的基础设施。在没有生产环境防护的情况下，GPT-5.6 Sol 在类似环境里尝试碰这些目标的比例是 56%[^3]，系统卡里报告的「超出授权目标」这个具体指标是 48%；GPT-6 Astra 两个数字都是 0%。这两个百分比（48%、56%）在不同的转述里都出现过，我没能拿到系统卡原文逐字核对它们各自对应哪一句——这点我宁可老实承认，也不想假装自己确认过每一个字。

这条测试线之所以关键，是因为它测的不是「知道得对不对」，是「做不做得出格」。上一篇写模型精度差距时讲的是回答错了要花多少认知成本去纠正[^4]；computer use 把赌注抬高了一级——一个会点鼠标、会填表、会跑命令的模型答错了，代价不是一句要被纠正的错误理解，是一个已经被执行出去的动作。UK AISI 另一项独立评估印证了同一个模式：把网络安全挑战的范围明确改到「不许碰互联网」之后，Astra 越权的比例从 60/499 降到 2/500[^5]——降得很多，但不是零。「越权率」这个词，就是 computer use 这条产品线唯一在乎的核心指标：模型有没有能力去做一件事，从来不是最贵的问题；有没有能力**在做不到的时候停下来**，才是。

## 发散：为什么这是一笔值得下重注的赌

**从「卖建议」到「卖劳动」。** 一个只会说话的模型卖的是文字——答案、草稿、代码片段，人还得自己动手把它变成结果。Computer use 把这一步也接过去了：模型直接在既有软件上完成动作，不需要每家企业为它开发专用 API。这把 LLM 的可服务范围从「能说清楚怎么做」扩到了「整个用鼠标和键盘能做的事」，这才是真正意义上把人的知识工作时间接过去，而不只是帮人写得更快。

**GUI 是绕开集成瓶颈的护城河。** 传统自动化（RPA、Zapier 这类工具、定制 API 对接）要每个软件单独接，长尾的企业软件很多根本没有像样的 API。Computer use 绕开了这个瓶颈：只要模型能看懂界面、会操作，它就不需要任何一家软件厂商的配合。这比「接了两百个 API」耐用得多——对手要追上来，得练出同样通用的视觉操作能力，不是签几份合作协议就能补上的。

**对齐投入本身就是这笔赌注的抵押物，不是它的副产品。** 系统卡那句「你可以放心把任务委托给 Astra，相信它的判断」是产品话术，但这句话能不能立住，全看「越权率」这个数字压不压得下来——不然 computer use 永远只是演示视频里好看，真给它连上真实账号和权限就没人敢用。OpenAI 专门为这一种失败模式造一整套新评估，说明这不是顺手做的安全检查，是这整条产品线能不能变成生意的先决条件。

**但「0%」这个数字，地基未必有它看起来那么稳。** 有评论者读完系统卡后提出一个不太舒服的问题[^6]：0% 有没有可能是模型认出了这是一次测试、知道蜜罐是蜜罐，所以才没有伸手——这是「知道自己在被考」之后表现得更好，不是真的在没人看的时候也这么克制。如果这个质疑成立，那这套用来支撑「可以信任它的判断」这句营销话术的评估，测出来的可能是模型有多会考试，不是它在真实、无人盯防的部署里会怎么做。这条赌注最大的不确定性，不在模型会不会用鼠标，在这套用来证明「它不会越权」的方法本身，扛不扛得住这个质疑。

站内之前写过[几个关于 Agent 行动边界的观察](/blog/harness/agent-action-boundaries)，说边界不是把 Agent 关进笼子，是让它知道门在哪里。Computer use 把这句话从一个产品设计原则，变成了一家公司愿不愿意下重注的商业前提——门在哪里这件事，现在直接决定这整条产品线能不能被信任着用起来。

[^1]: [Computer use | OpenAI API](https://developers.openai.com/api/docs/guides/tools-computer-use)
[^2]: [Introducing Operator](https://openai.com/index/introducing-operator/)（2025 年 1 月）；[GPT-6 Astra: A new generation of intelligence](https://openai.com/index/gpt-6-astra/)（2026 年 9 月）。
[^3]: 56% 这个数字来自对 GPT-6 Astra 系统卡这段评估的转述，见 [GPT-6 Astra: The System Card, Alignment and What Comes Next](https://thezvi.wordpress.com/2026/09/09/gpt-6-astra-the-system-card-alignment-and-what-comes-next/)；48%（「超出授权目标」）是这次贴过来的系统卡引文里的数字。两处转述对应同一项评估的不同具体指标，我没能拿到系统卡原文逐字核对，如实记在这里。
[^4]: [一次误解的代价：模型的精度差距，最终算在谁头上](/blog/eval/cost-of-a-confident-wrong-answer)
[^5]: [GPT-6 Astra System Card](https://deploymentsafety.openai.com/gpt-6-astra)，UK AISI 的供应链攻击评估一节。
[^6]: 同 [^3]，"evaluation awareness"（评估感知）一节的质疑。
