---
album: harness
issues:
  - month: 2026-07
    cover: harness/2026-07/cover-titled.jpg
    original: harness/2026-07/cover-titled.png
    model: gemini-3-pro-image
    generatedAt: 2026-08-22
    postProcess: >-
      下面这条 prompt 出的画面把标题也烤了进去，四本抽到四种字形。成品是在它之上改的：
      先用 gemini-3-pro-image 做图像编辑擦掉那几个字（画面其余部分原样保留），
      再由 scripts/compose-title.mjs 用 Iowan Old Style 把标题和装裱边合成上去。
      所以照这条 prompt 重跑只能得到画面，得不到成品。
    entries:
      - harness/local-first-tool-design
      - harness/agent-action-boundaries
    prompt: >-
      Album cover, 4:5 vertical, editorial art direction. Ground: white paper #ffffff, faint
      grain. Two axes only — warm copper #a8632c for the made object, cool water #c8f1ee to
      #26788f for what it holds; dark tone #4c3630; #f5c85b only as a spark under 3%. Museum-label
      precision, generous empty space, matte materials, soft daylight. A specimen plate, not a
      scene. Subject: a warm copper ring mechanism with fine contacts along its inner rim,
      encircling a pale celadon sphere that floats clear of it, touching nothing; one contact on
      the rim is closed, the rest open. Composition: subject in the lower two-thirds, offset
      right; upper-left quadrant stays empty paper and carries the title. Baked-in typography: the
      single word "Harness" set very large in a high-contrast serif, with generous letter-spacing.
      The only characters in the image; no other text, numbers, labels or watermark. Avoid: warm
      or cream paper, brass, gold, ochre, kraft, sepia, olive, khaki; no yellow-green cast; dark
      background, collage, gradients, glow, 3D render, full-surface ornament, centered title
      stack, stock people, saturated colour fields.
---

Harness 这一本收的是「Agent 该在什么地方停下来」这一类问题。

2026-07 期的封面是 Agent = Model + Harness 的直译：一圈紫铜的环状机构在外，内缘布着细小的触点，
中间悬着一颗浅青瓷的球，环托着它却一处也没碰到。边上只有一个触点是闭合的 ——
驾驭不是把它箍死，是有选择地闭合某一路。
