# Water — Initial Website Direction

## Concept

Water is a personal research and building space about time, flow, intelligent systems, and the future.

The site should feel like a quiet personal world rather than a commercial portfolio or a generic developer template.

Core metaphor:

```text
Ancient characters → present thinking → future systems
```

The visual anchor is a flowing blue river. An oracle-bone-inspired character provides the identity anchor, while a very subtle field of moving points can suggest a distant future and space.

## Brand language

### Primary direction

Use a Chinese-led identity with restrained English metadata.

Possible primary mark:

```text
如斯
```

Possible supporting line:

```text
Researching what moves, building what remains.
```

Chinese interpretation:

```text
研究流动之物，构建留下之物。
```

“Be water, my friend.” can appear as a secondary epigraph or About-page reference, but it should not be the only brand slogan because it is strongly associated with Bruce Lee.

“时空” is a modern compound rather than one single oracle-bone character. “宇” and “宙” together express space and time, but a visual mark may work better if it combines the ideas of 日, 川/水, and a few star points instead of using a large literal character.

## Visual system

### Color direction

The base should be white or a very light warm neutral. A Pantone Color of the Year-inspired tone may be introduced later as an accent, but the system should remain independent of one annual color.

Suggested starting palette:

```text
Warm white       #FFF9EC
Deep ink blue    #10233F
Pure river blue  #246BFF
Sky blue         #CFE5FF
Sun yellow       #F5C85B
```

Suggested balance:

```text
Light background  75%
Dark text         18%
Pure blue          6%
Sun yellow         1%
```

The yellow should feel like sunlight touching water, not like a commercial call-to-action color. Use it for a small highlight, an active state, a point of light, or a brief hover response.

### Typography

- Chinese should be the primary reading language.
- English should support the system through labels, metadata, dates, statuses, and short subtitles.
- Use a calm Chinese serif or humanist sans-serif for major Chinese titles.
- Use a restrained sans-serif or mono face for metadata and technical information.
- Avoid making every label uppercase; reserve English uppercase for system-like navigation and project metadata.

## Site structure

```text
/
├── Home
├── /research
│   ├── essays
│   ├── notes
│   ├── experiments
│   └── tags: agent / llm / aigc / evaluation / product
├── /projects
│   ├── project detail pages
│   └── external demos and repositories
├── /about
└── /now (optional later)
```

Research content should be organized by content type first and topic tags second. A single article may belong to multiple topics, so Agent, LLM, and AIGC should not become rigid top-level silos.

Projects should have their own detail pages. Independent applications may later live on subdomains, but the main site should remain the unified home for research and project narratives.

## Home page structure

### 1. Opening composition

The first viewport should be a single composition, not a conventional centered hero with two buttons.

```text
Top-left:    SUMOER / identity
Main area:   oracle-bone-inspired mark or 如斯
Copy:        short Chinese statement
Structure:   a blue river crossing the page
Secondary:   sparse blue-grey points suggesting distant space
```

Possible copy:

```text
时间如水。
记录正在形成的想法，构建可以被使用的东西。
```

The river should be the dominant visual element. It should act as a structural line that separates or connects sections rather than as a decorative background.

### 2. Main entries

Use large typographic entries rather than equal-weight cards:

```text
01  研究
    思考、实验、技术文章和长期问题

02  项目
    正在构建的工具、系统和独立产品
```

On hover, the river can change locally and a small preview can appear. The interaction should be quiet and informative.

### 3. Time stream

Show recent writing as a timeline or riverbank rather than a card grid:

```text
2026.07.28   关于 Agent 行动边界的几个观察
2026.07.21   一个本地优先工具的设计记录
2026.07.08   LLM 应用中的状态与记忆
```

### 4. Future layer

Use a very subtle moving-point layer later in the page or at the edge of the opening composition.

- Keep the number of points low.
- Use slow movement and gentle clustering.
- Avoid a literal galaxy, planet, or sci-fi illustration.
- Support reduced-motion preferences.

The points should suggest the future without taking attention away from the river.

### 5. Footer

```text
Currently thinking about:
intelligent systems, interfaces, and time.

Made by Sumoer
```

## Research page

The Research page should feel like a calm editorial index.

```text
RESEARCH
关于智能系统、工具和时间的长期记录
```

Content types:

- Essays — long-form arguments and ideas
- Notes — short observations
- Experiments — implementation and evaluation records

Article pages should prioritize reading:

- narrow text measure
- generous vertical rhythm
- large Chinese title
- small English metadata
- fixed or collapsible table of contents
- code blocks with copy action
- blue links and citations
- minimal use of yellow for emphasis

## Projects page

The Projects page should feel more technical but still belong to the same visual system.

```text
PROJECT 01

OpenWorker
一个用于自动化任务执行的实验性系统

STATUS       Active
TYPE         AI Infrastructure
BUILT        2026
```

Each substantial project should explain:

- why it exists
- what problem it addresses
- how it works
- important design decisions
- current limitations
- live demo
- source repository

Technical UI can borrow Swapnil’s structured metadata and case-study clarity, but should avoid turning the site into a skills dashboard.

## Initial interactions

Keep the first version intentionally light:

1. A slowly evolving SVG river.
2. A subtle response when hovering the Research and Projects entries.
3. A low-density moving point layer for the future/space metaphor.
4. A gentle identity-mark or glyph state change.
5. Reduced-motion support.

Do not add 3D scenes, dense particle systems, complex page transitions, accounts, comments, or a custom admin panel in the initial version.

## Initial implementation scope

### Home

- brand mark
- river animation
- research and project entries
- recent writing
- subtle future layer

### Research

- article index
- tags
- article detail pages
- table of contents
- code highlighting
- RSS

### Projects

- project index
- project detail pages
- status and metadata
- screenshots
- demo and repository links

## Design principle

```text
The ancient character gives the site memory.
The river gives it motion.
The points give it a future.
The writing gives it meaning.
```

## Reference websites

### Visual and personal-site references

- [Matteo Bordoni](https://www.matteobordoni.it/?lang=en) — restrained personal identity, short positioning statement, and calm project presentation.
- [Swapnil.design](https://www.swapnil.design/en) — structured technical information, case-study metadata, and handcrafted interface details.
- [Ullaskunder](https://www.ullaskunder.com/projects/ullaskunder-portfolio) — typography-led minimalism, generous whitespace, and a mathematical layout rhythm.
- [Showpage](https://www.showpage.me/) — useful comparison of Minimal, Editorial, Noir, and other portfolio structures.
- [Siiimple](https://siiimple.com/siteinspire/) — curated references for very minimal, typographic, and portfolio-oriented web design.
- [Siteinspire](https://www.siteinspire.com/) — broader visual reference library with Minimal, Typographic, Portfolio, and Unusual Layout categories.

### Chinese and Chinese-led references

- [焕发活力](https://binapp.cn/) — warm personal-universe framing and a non-corporate independent-maker tone.
- [蔚蓝 Weilanx](https://www.weilanx.com/) — Chinese-led bilingual structure combining projects, writing, design system, and personal identity.
- [咕咚](https://gudong.site/) — very simple independent-developer information architecture; useful for restraint even though the visual identity is less distinctive.
- [1da.top](https://1da.top/) — compact independent-developer portfolio and direct project presentation.
- [YUCONG](https://4zyc.cn/) — technical UI experiments and project-oriented interface presentation; use selectively and avoid overusing glassmorphism.

These references are sources of patterns, not templates to copy. The Water identity should be built from the river, the ancient-character mark, Chinese-led typography, and the restrained blue/yellow visual system.
