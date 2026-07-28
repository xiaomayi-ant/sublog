import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(projectRoot, 'dist');

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
    }),
  );

  return files.flat();
}

function targetForHref(href) {
  const pathname = href.split('#', 1)[0].split('?', 1)[0];
  if (!pathname) return null;

  if (pathname === '/') return path.join(distRoot, 'index.html');

  const relative = decodeURIComponent(pathname.replace(/^\//, ''));
  if (path.extname(relative)) return path.join(distRoot, relative);
  return path.join(distRoot, relative, 'index.html');
}

test('every generated HTML page has one primary heading and the shared landmark contract', async () => {
  const files = await collectFiles(distRoot);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));

  assert.ok(htmlFiles.length >= 16, 'expected the full initial-release route set');

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const headings = html.match(/<h1(?:\s|>)/g) ?? [];

    assert.equal(headings.length, 1, `${path.relative(distRoot, file)} should have exactly one h1`);
    assert.match(html, /<main id="content"/);
    assert.match(html, /<html lang="zh-CN">/);
  }
});

test('every local href in generated HTML resolves inside dist', async () => {
  const files = await collectFiles(distRoot);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const missing = [];

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const hrefs = [...html.matchAll(/\shref="([^"]+)"/g)].map((match) => match[1]);

    for (const href of hrefs) {
      if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/.test(href)) continue;
      const target = targetForHref(href);
      if (!target) continue;

      try {
        await access(target);
      } catch {
        missing.push(`${path.relative(distRoot, file)} -> ${href}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
