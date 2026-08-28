---
title: 中心化与去中心化：Codex 和 dsh 的两种 Harness 权威模型
description: Codex 与 DeepSeek Harness（dsh）表面上都是「一堆包」，真正的分野不在包的数量，而在 agent loop 本身的权威放在哪里——一个受保护的核心，还是一个可以随时被卸载的插件。
pubDate: 2026-08-28
tags: [agent, architecture, harness]
draft: false
---

包的数量骗不了人的判断，也帮不了它。Codex 的 Rust workspace 有一百多个 crate，dsh（DeepSeek Harness 的 CLI，`@deepseek-ai/dsh`）本地装出来的插件树也有一百五十多个包——单看「拆成多少份」，两者长得一样碎。真正把它们分到两条路上的问题是：**这套系统会不会表现成同一个样子，是在哪一步、由谁保证的**。答案在 agent loop 自己身上——它是被放进一个谁都不能碰的核心里，还是被当成众多插件里普普通通的一个。

## Codex：core 是一个受保护的地方

OpenAI 自己把这部分代码称为「Codex core」：agent loop、thread 的创建/恢复/分叉/归档、config 与 auth、沙箱化的工具执行，全都在这一个代码库里[^1]。CLI、TUI、VS Code 插件、Web、macOS 客户端是五张不同的脸，但脸后面只有一个 core——App Server 用 JSON-RPC 把它包起来，让任意客户端通过标准输入输出跟它说话[^2]。加一个新前端，是加一个新客户端去连接同一个权威，不是分走权威。

这套权威甚至会主动往回收。团队最早想直接用 MCP 把 core 的能力暴露出去，试了才发现 MCP 的语义装不下一次完整的 agent 对话——它没法承载流式进度、暂停等用户批准、结构化的 diff 输出[^2]。换作一个真正去中心化的系统，这里该做的是把协议的缺口留给插件层自己补；Codex 的选择是自己造一套双向协议，把这部分能力重新收回 core 的边界内。当一个通用标准配不上核心的需要时，边界没有让步，协议让步了。

本地克隆的仓库里还留着两处不经意的旁证。一处是 `AGENTS.md` 里的工程纪律——「resist adding code to codex-core」，因为 core 是仓库里最大、最容易膨胀的 crate，团队要靠一条反复提醒的规则才压得住它往外长的冲动。这条规则本身就是中心化的代价：核心一旦被当成核心，所有人都会先想到往它里面加东西。另一处是 `core-plugins` crate——它不是给核心分权，而是一个插件市场的管理层：`marketplace_add`、`marketplace_remove`、`installed_marketplaces`，市场的名字叫 `openai-curated`、`openai-bundled`。你可以装插件，但哪些插件算数、谁来策展，仍然是 OpenAI 说了算。

## dsh：没有一个地方是特权的

Cordis 的文档把话说得更直接：「There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads.」[^3] 不是「大部分能力是插件」，是**agent loop 自己也是插件**——`core/agent-loop` 向共享的 Cordis context 贡献一个服务，跟 `core/tools`、`core/session`、`llm/llm` 站在同一层。没有谁比谁更中心。

这不是文档里的修辞，本地装出来的包印证了它。`dsh-llm-deepseek` 和 `dsh-llm-pi-ai` 并排存在——dsh 自己都不把模型锁定在开发它的公司身上。`dsh-session-persistence-jsonl` 和 `dsh-session-query-sqlite` 是两种可以互换的存储后端。`dsh-subagent-fork-in-process` 和 `dsh-subagent-spawn-in-process` 是两种子智能体执行策略，挑一种装进去就是挑一种系统。就连进程边界都被拆开了——`dsh-cordis-host-runner` 和 `dsh-cordis-client-runner` 是这套系统日常运行的样子，不是给灾难恢复留的后门；UI 层（`dsh-client-ui-cordis`）本身也参与这张插件图，一路拆到最外面。

站内之前那篇[《智能体 Harness：四种开源架构范式》](/blog/harness/four-agent-harness-architecture-patterns)里写过 DeepSeek Harness 的 Fiber——「已纳入作用域的服务、监听器和副作用可随插件卸载而清理」。这句话现在可以再往下钻一层：能被 Fiber 清理的从来不只是普通工具，是这套系统愿意承认的**任何**东西，包括决定下一步做什么的那个循环本身。

## 两种权威，两种要还的债

中心化把「这套系统会怎么表现」这个问题在编译时回答一次：同一个 core，同一套沙箱纪律，五个前端拿到的是同一份保证。代价是核心自己会不断膨胀——「resist adding to core」不是写完就完事的规则，是团队每天都要重新顶住的引力。想绕开核心的边界（比如 MCP 那次尝试），换来的往往是核心把边界重新画大一圈，而不是权威真的分出去。

去中心化把这个问题推迟到每一次组装：你装了 `dsh-llm-deepseek` 还是接了别的模型、用 jsonl 还是 sqlite 存会话、连了哪些沙箱插件——这些选择拼起来才是「你到底在跑一个什么系统」。没有谁替你在编译时把答案定死，好处是换一块从不需要谁批准，代价是「两次运行行为一致」从产品承诺变成了使用者自己的责任。连「有没有留下审计日志」这件事，都取决于你有没有装那个负责记日志的插件。

一个受保护的核心和一个不承认自己是核心的核心，都能长成一个能干活的 Harness。分歧不在谁的架构图更好看，在于你愿意谁来承担「表现一致」这件事的成本——是核心的维护者，还是你自己。

[^1]: [Unlocking the Codex harness: how we built the App Server](https://openai.com/index/unlocking-the-codex-harness/)——OpenAI 官方博客，描述 Codex core 涵盖 agent loop、thread 生命周期、config/auth、沙箱化工具执行。
[^2]: 同上；MCP 语义不足以承载完整 agent 对话、因此改造自定义双向协议的细节同样出自这篇文章。
[^3]: [DeepSeek Harness 架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)，「Seam」与「无特权核心」一节。
