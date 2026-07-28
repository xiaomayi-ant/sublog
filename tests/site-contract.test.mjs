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

test('every published project has a complete case-study route', async () => {
  const projects = [
    {
      route: '/projects/openworker',
      title: 'OpenWorker',
      sections: ['为什么存在', '解决什么问题', '如何工作', '关键设计决策', '当前局限'],
    },
    {
      route: '/projects/riverline',
      title: 'Riverline',
      sections: ['为什么存在', '解决什么问题', '如何工作', '关键设计决策', '当前局限'],
    },
  ];

  for (const project of projects) {
    const html = await readRoute(project.route);
    assert.match(html, new RegExp(`<h1[^>]*>${project.title}</h1>`));
    assert.match(html, /返回项目/);

    for (const section of project.sections) {
      assert.ok(html.includes(section), `${project.route} should include "${section}"`);
    }
  }

  await assert.rejects(
    access(path.join(distRoot, 'projects/secret-draft/index.html')),
    { code: 'ENOENT' },
  );
});

test('published output contains no example.com placeholders', async () => {
  const routes = ['/', '/projects', '/projects/openworker', '/projects/riverline', '/about'];
  const html = (await Promise.all(routes.map(readRoute))).join('\n');

  assert.doesNotMatch(html, /example\.com/);
});
