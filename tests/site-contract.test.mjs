import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = process.env.SITE_DIST_DIR
  ? path.resolve(process.env.SITE_DIST_DIR)
  : path.join(projectRoot, 'dist');

async function readRoute(route) {
  const relativePath = route === '/' ? 'index.html' : path.join(route.slice(1), 'index.html');
  return readFile(path.join(distRoot, relativePath), 'utf8');
}

test('build emits the home, research, about, and projects entry routes', async () => {
  const routes = ['/', '/research', '/projects', '/about'];

  await Promise.all(
    routes.map(async (route) => {
      const html = await readRoute(route);
      assert.match(html, /<html lang="zh-CN">/);
      assert.match(html, /<title>.+ · Water<\/title>/);
    }),
  );
});

test('build emits every published research route and excludes drafts', async () => {
  const publishedRoutes = [
    '/research/essays/agent-action-boundaries',
    '/research/essays/local-first-tool-design',
    '/research/notes/evaluation-is-not-scoring',
    '/research/notes/llm-state-and-memory',
    '/research/experiments/aigc-image-triage',
  ];

  await Promise.all(publishedRoutes.map((route) => access(path.join(distRoot, route.slice(1), 'index.html'))));

  await assert.rejects(
    access(path.join(distRoot, 'research/notes/session-continuity-draft/index.html')),
    { code: 'ENOENT' },
  );
});

test('RSS is generated from the configured site URL', async () => {
  const rss = await readFile(path.join(distRoot, 'rss.xml'), 'utf8');
  assert.match(rss, /<rss/);
  assert.match(rss, /<item>/);
});
