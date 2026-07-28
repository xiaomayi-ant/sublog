// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://water.localhost';

// https://astro.build/config
export default defineConfig({
  site,
  markdown: {
    shikiConfig: {
      // 浅色主题，契合暖白底设计系统
      theme: 'github-light',
    },
  },
});
