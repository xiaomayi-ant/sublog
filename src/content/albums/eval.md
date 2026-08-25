---
album: eval
coverArt:
  cover: eval/2026-08/cover-titled.jpg
  original: eval/2026-08/cover-titled.png
  model: gemini-3-pro-image
  generatedAt: 2026-08-23
  postProcess: >-
    下面这条 prompt 出的画面把标题也烤了进去，四本抽到四种字形。成品是在它之上改的：
    先用 gemini-3-pro-image 做图像编辑擦掉那几个字（画面其余部分原样保留），
    再由 scripts/compose-title.mjs 用 Iowan Old Style 把标题和装裱边合成上去。
    所以照这条 prompt 重跑只能得到画面，得不到成品。
  prompt: >-
    Album cover, 4:5 vertical, editorial art direction. Ground: white paper #ffffff, faint grain.
    Warm leads: the #a8632c terracotta family carries the subject; cool #c8f1ee to #26788f
    supports it; dark tone #4c3630; #f5c85b under 3%, as colour, never as a drawn mark. Museum-
    label precision, generous empty space, matte materials, soft daylight. A specimen plate, not a
    scene. Subject: a single pale chartreuse sphere, a soft yellow-green glaze, on white paper,
    ringed by several mismatched measuring instruments in warm terracotta metal — a rule, a
    caliper, a protractor — none aligned with another, each giving a different reading.
    Composition: subject in the lower two-thirds, offset right; upper-left quadrant stays empty
    paper and carries the title. Baked-in typography: the single word "Eval" set very large in a
    high-contrast serif, with generous letter-spacing. The only characters in the image; no other
    text, numbers, labels or watermark. Avoid: warm or cream paper, brass, gold, ochre, kraft,
    sepia, olive, khaki; no yellow-green cast; no icons, symbols, sparkles or stars; dark
    background, collage, gradients, glow, 3D render, full-surface ornament, centered title stack,
    stock people, saturated colour fields.
issues: []
---

评估方法学：用不同的尺量同一个东西。真正的困难不是有没有尺，是尺本身在变、而且互相不同意；
而被量的是一个球 —— 没有平面、没有正面，怎么量都不完整。
