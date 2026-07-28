// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // RSS 等需要绝对 URL；上线前替换为真实域名
  site: 'https://water.example.com',
  markdown: {
    shikiConfig: {
      // 浅色主题，契合暖白底设计系统
      theme: 'github-light',
    },
  },
});
