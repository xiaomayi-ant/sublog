---
title: 会用 AI 不是稀缺品，看懂 AI 才是——如果它还能被看懂
description: AI 已经在局部碾压人类了（比如 coding），人还要不要学技能？从一个立不住的类比拆起，拆到默顿效应和可解释性缺口——分野不在谁更聪明，在谁站在正在被拉大的那条线上。
pubDate: 2026-09-13
tags: [agent, llm]
draft: false
---

AI 在一些局部领域已经碾压人类了，写代码是最直接的例子。这件事很自然地会逼出一个问题：人还需不需要学技能？

第一反应很容易滑向一个类比：人和人之间的智力差距，本质是处理信息的能力差距——更聪明的人能读到更多信号、处理得更快；人是自然的一部分，这种能力说到底是对环境变化的感知和估计。AI 在某些局部已经具备这种能力了，那接下来会不会是：一小撮能跟上 AI、能和它「对话」的人掌控局面，剩下的人被甩开？

这个类比听起来顺，但立得住吗？拆开看，**它混了两件不是同一回事的东西**：个体之间天生的认知差距，和社会层面谁能吃到技术红利的差距。前者是生物学问题，大体连续、稳定；后者是历史一再重演的社会学问题，靠起点和资源滚雪球。硬把前者的证据拿来撑后者的结论，才会显得勉强。这篇文章就是把这两层分开重新搭一遍。

## 个体层面：该问的不是反应快不快，是能不能应付没见过的事

「处理信息的速度」确实和智商有关——认知心理学里反应时间、检测时间这类指标和智商测验的相关系数在 −0.3 到 −0.5 之间，但只能解释智商差异的 20%-25%[^1]，方向对，远不是全部。更关键的是，主流智力理论（Cattell-Horn-Carroll 理论）本来就把「反应快」和「能解决新问题」分成了两种不同的能力：处理速度（Gs）管的是执行已经学会的操作有多快；流体智力（Gf）管的是「用灵活的注意力去解决一个没见过、不能靠老经验套路解决的新问题」，而且理论本身说得很明确——学一件新事的时候，Gs 帮助有限，真正起作用的是 Gf[^1]。「对环境变化的感知和估计」这句话，对应的其实是 Gf，不是反应速度。这个换算不是抠字眼：它让「人靠什么适应变化」这个问题第一次踩在一个主流、没有争议的构念上，而不是一条只能解释四分之一差异的边缘证据上。

但即便换成 Gf，它解释的也只是**个体之间**为什么有人更容易适应新情况——这是一个连续分布，不是一道切出 1% 和 99% 的线。真正的分野问题，答案不在认知科学里。

## 社会层面：真正的机制是默顿效应，不是天赋

罗伯特·默顿 1968 年提出的「默顿效应」（Matthew effect，出自《马太福音》「凡有的，还要加给他」）说的是：早期的一点点优势会自我复制——早期认可带来更多资源和能见度，能见度又带来下一轮更大的优势，循环滚动，赢家不是因为一直最强，是因为先手的那一点点差距被系统性放大[^2]。

而且这条理论现在有专门针对 AI 的最新验证，结论很直接：**AI 不是制造了这个效应，是放大了它**。本来基础扎实、手上资源多的人，用 AI 产出更多、质量更高，差距不是被 AI 拉平，是被 AI 加速拉开[^3]。这才是「1%/99%」真正对应的机制——不是谁天生反应快，是谁在 AI 浪潮打过来的时候，已经站在能把这点先发优势滚起来的位置上。

## 拿一个真实案例去测：AI 碾压之后，人真的不学了吗

有一个已经跑了近十年的真实样本可以拿来检验：「AI 碾压人类」这件事，是不是真的让人放弃学这项技能了。象棋从 2017 年前后（AlphaZero 出现）开始，就没有人类能赢过顶尖引擎。按最初那个类比，人类应该逐渐退出，只剩一小撮「看得懂引擎」的人还在玩。

实际发生的正好相反：Chess.com 的注册用户从 2020 年的 3500 万涨到 2026 年的 2.5 亿以上，FIDE 估计全球经常下棋的人超过 6 亿[^4]。顶尖棋手用引擎的方式，是把它当一个可以随时提问的陪练——摆一个局面、看评分和推荐招法、凭自己的棋感琢磨为什么，全程不需要看懂神经网络内部在算什么。这说明**「熟练使用 AI」从来不是那道分界线**——它门槛在下降，愿意学的人正在变多，不是变少。

## 为什么「会用 AI」注定越来越不稀缺

这不是巧合，是一个有名字的过程：去技能化（deskilling），哈里·布雷弗曼 1974 年提出——自动化会把原本需要人的那部分技能吸收进机器本身，人为此练出来的技巧就跟着贬值[^5]。今天精心构造提示词还是一门手艺，但这门手艺存在的前提，是模型还不够擅长直接读懂意图——一旦模型自己在这件事上进步，这门手艺的价值就被它自己吃掉了。（这条理论本身有争议，也有研究发现自动化反而会「提技能」[^5]，不是单向铁律，但这条逻辑——AI 自己在进步的那部分能力，会持续吃掉人类为补偿这部分而练出的技巧——是成立的。）

## 真正在拉大的缺口：理解 AI 内部在干什么

「会用」和「看懂」是两条运动方向相反的线。AI 越强，用它需要的技巧越少；但 AI 越强，看懂它内部在做什么并不会跟着变容易，可能反而更难——这不是推测，是当前正在发生的、有据可查的处境：

- Anthropic 自己给可解释性定的目标，只是「到 2027 年，能可靠查出大多数模型问题」[^6]——不是「看懂」，是「能查出问题」，一个很谦虚的门槛；
- 机制可解释性（mechanistic interpretability）能不能扩展到真实规模的大模型，本身还是一个「令人生畏」的未解难题[^7]；
- 模型写出来的「思考过程」（chain-of-thought）已经被证明经常不忠实地反映它真实的内部计算[^8]；
- 更远一点，有研究者担心模型可能会演化出一种叫 "neuralese" 的内部通信方式，用人类读不懂的数字向量代替自然语言——2026 年 7 月已经有一份由 UK AI Safety Institute 和几大实验室的安全研究者联署的立场文件在呼吁守住「模型的思考过程必须保持人类可读」这条线[^9]。

这条缺口现在集中在极少数头部实验室手里，不是分布均匀的——这正是上面默顿效应的一个具体案例：资源和先发优势已经在决定谁能进入这条赛道，不是谁最聪明就能补上。

## 收回结论

分野不在「谁更聪明」（个体智力差距只能解释四分之一，而且解释的是连续分布，不是一刀切）；也不在「谁更愿意学着用 AI」（这项技能本身在变得越来越不稀缺，门槛还在持续下降）。真正的分野在：**谁已经站在一条会被系统性放大的先发优势上，而那条优势现在具体体现为对 AI 内部到底在做什么的理解——一条 AI 越强、可能越难被追上的缺口。**

最后一句自我约束：上面每一段的确定程度不一样，不该用同一种语气讲完。Gf/Gs 的区分、默顿效应在 AI 上的验证、象棋案例、Anthropic 自己定的可解释性目标——这些是已经发生、可查证的事实。"neuralese"和模型演化到人类彻底看不懂，是研究者正在认真防范的风险，不是已经发生的现状，得明确标成「往前推得更远的一段」，不能用同一种笃定的语气说出来。这条自我约束不是客套——站内之前那篇[《一次误解的代价》](/blog/eval/cost-of-a-confident-wrong-answer)讲的就是这件事：语气要跟着材料的稳固程度打折扣，这篇算是把那条原则用在自己身上。

[^1]: 反应时间/检测时间与智商相关性，见 [Inspection time and intelligence: A meta-analysis](https://www.sciencedirect.com/science/article/abs/pii/S0160289689800066)；Gf/Gs 区分见 [The Cattell-Horn-Carroll (CHC) Model of Intelligence](http://www.iapsych.com/chcv2.pdf) 与 [Fluid vs Crystallized Intelligence: Gf, Gc, and CHC Theory](https://www.cogn-iq.org/blog/fluid-vs-crystallized-intelligence/)。
[^2]: [The Matthew Effect in Science](https://www.researchgate.net/publication/298852493_The_Matthew_Effect_in_Science)（Merton, 1968）。
[^3]: [The Matthew Effect in AI](https://www.jeffpooley.com/2025/11/the-matthew-effect-in-ai-summary/)；另见 [The Matthew Effect at Scale: Attention Scarcity and the AI Output Explosion](https://www.networklawreview.org/matthew-effect/)。
[^4]: Chess.com 用户增长数据，见 [Online Chess Statistics (2026)](https://voxbooster.com/blog/online-chess-statistics-2026/)。
[^5]: 去技能化理论与争议，见 [Harry Braverman's Deskilling Thesis in the 21st Century](https://www.academia.edu/107232386/Harry_Bravermans_Deskilling_Thesis_in_the_21_st_Century_The_Relevance_and_Practical_Applicability)；「提技能」反例见 [Automation in shared services centres: implications for skills and autonomy](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/468D3D6C9852C5B480990CA7CE59ED53/S1035304625100264a.pdf/automation_in_shared_services_centres_implications_for_skills_and_autonomy.pdf)。
[^6]: [The Interpretable AI playbook: What Anthropic's research means for your enterprise LLM strategy](https://venturebeat.com/ai/the-interpretable-ai-playbook-what-anthropics-research-means-for-your-enterprise-llm-strategy)。
[^7]: [Mechanistic Interpretability for AI Safety -- A Review](https://arxiv.org/pdf/2404.14082)。
[^8]: [Chain-of-Thought Reasoning In The Wild Is Not Always Faithful](https://arxiv.org/pdf/2503.08679)。
[^9]: [What is neuralese and why is it bad?](https://www.greaterwrong.com/posts/RCYF2rW8wgusidZk7/what-is-neuralese-and-why-is-it-bad)
