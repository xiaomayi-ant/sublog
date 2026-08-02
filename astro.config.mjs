// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://water.localhost';

// https://astro.build/config
export default defineConfig({
  site,
  // 底部那条悬浮工具栏只在 astro dev 下出现，生产构建里本来就没有；关掉它，
  // 免得它压在首页设计上。需要时把 enabled 改回 true。
  devToolbar: { enabled: false },
  markdown: {
    shikiConfig: {
      // 浅色主题，契合暖白底设计系统
      theme: 'github-light',
    },
  },
});
