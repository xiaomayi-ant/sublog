# 逐字浮现 —— 模糊是主体，颜色是参数

> 代码：`src/components/ArtRiverHero.astro` 的 `@keyframes intro-letter-in`
> 对照页：`/lab/title`（noindex），六档起点色可点击重播

---

## 1. 这个效果的主体是什么

首屏标题「my friend.」逐字浮现。三个属性同时动：

```
opacity     0 → 1
filter      blur(3px) → blur(0)
transform   translateY(0.18em) → 0
```

**真正制造"变化感"的是 blur。** 单独的逐字淡入 + 位移几乎读不出来 —— 88px 的字位移 0.18em 只有 16px，在一屏的尺度上等于没动。而 blur 把字糊成一团、再收拢成字形，这个"从无形到有形"的过程才是眼睛能抓住的东西。

一开始我把它当成 bug 处理（"黑色阴影块"），这是**判断错了**。它是这个动效唯一有效的部分。

---

## 2. 那团模糊的颜色必须是参数

原来颜色写死为 `--color-ink`（赭墨 #4c3630）。3px 模糊 + 中途 opacity，深墨糊出来就是一团接近黑的东西 —— 效果成立，但**只有一种性格**。

改成两个自定义属性，任何容器都能覆盖：

```css
@keyframes intro-letter-in {
  from {
    opacity: 0;
    color: var(--intro-reveal-from, var(--color-ink-mist));
    filter: blur(var(--intro-reveal-blur, 3px));
    transform: translate3d(0, 0.18em, 0);
  }
  58% { color: var(--intro-reveal-from, var(--color-ink-mist)); }
  to {
    opacity: 1;
    color: var(--intro-reveal-to, var(--color-ink));
    filter: blur(0);
    transform: translate3d(0, 0, 0);
  }
}
```

用法：

```css
.intro-line--friend {
  --intro-reveal-from: var(--color-ink-mist);  /* 糊团的颜色 */
  --intro-reveal-to: rgba(76, 54, 48, 0.86);   /* 落定的颜色 */
}
```

---

## 3. ⚠️ 关键的一点：颜色必须在最糊的一段保持住

那个 `58%` 的中间帧不是装饰。

**第一版没有它，颜色和模糊同步收敛，结果起点色根本看不见。** 冻帧实测：动画走到 190ms（300ms 的 63%）时，颜色已经基本收到落点色了，而那正是模糊最明显的阶段——于是无论把 `--intro-reveal-from` 设成什么，屏幕上都只是一团墨色。参数形同虚设。

加上 58% 的保持帧之后再冻帧，水色、暖赭、阳黄的糊团都清晰可辨。

**教训**：多属性同时动的动效里，"哪个属性在哪一段可见"必须单独确认。同步收敛看起来最自然，但会让先收敛的那个属性失去表达机会。

---

## 4. 六档对照

`/lab/title` 上可点击重播。模糊量与时长完全相同，只改起点色：

| 起点色 | 值 | 性格 |
|---|---|---|
| 雾赭（当前默认） | `#c3b6b1` | 糊团很轻，几乎只是一层雾 |
| 原始深墨 | `#4c3630` | 糊团最重，最初的样子 |
| 水色 | `--water-500` `#4ab8ca` | 字从水色的雾里浮出，落定成墨 |
| 深水 | `--water-700` `#26788f` | 更实，仍是冷色 |
| 暖赭 | `--color-ember` `#a8632c` | 糊团带暖，落定收回墨 |
| 阳黄 | `--color-sun` `#f5c85b` | 最轻最亮，糊团几乎只是光 |

---

## 5. 可复用性

这个模式不绑定标题。任何"逐个元素浮现"的场景都能用：

- 元素上挂 `--letter-delay`（或 `--reveal-delay`）
- 容器上设 `--intro-reveal-from` / `--intro-reveal-to`
- 动画本身不必复制 —— 但目前 keyframe 定义在 `ArtRiverHero.astro` 的 scoped style 里，
  要跨组件用需要先提到 `global.css`。**尚未提取**，因为现在只有一个使用方。

---

## 6. 已知未决

- 起点色的默认值目前是雾赭。你说原始深墨的效果"其实很好"，那一档在对照页的第二行。
- `--intro-reveal-blur` 也暴露成了参数，但没有试过不同模糊量。
- 「Be」和「water」走的是另一条 `intro-word-in`（整词淡入 + 位移，**没有模糊**），
  所以这套参数对它们无效。要不要让它们也走模糊，未决。
