// graph-extract — 用本地 mock LLM 服务验证抽取脚本的端到端流程：
// 扫描 → 正文 hash → 调用 → 入库 → 幂等重跑 → --force → 删除文章清理。
// 全程不联网：LLM 端点是 node:http 起的本地服务，返回固定 JSON。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runExtraction } from '../scripts/extract-entities.mjs';

const ARTICLE_ALPHA = `---
title: 测试文章甲
description: 甲
pubDate: 2026-08-01
tags: [agent]
draft: false
---

正文甲：关于状态管理与记忆。
`;

const ARTICLE_BETA = `---
title: 测试文章乙
description: 乙
pubDate: 2026-08-02
tags: [llm]
---

正文乙：关于评估。
`;

const DRAFT = `---
title: 草稿
description: 草稿
pubDate: 2026-08-03
draft: true
---

不该被抽取。
`;

// mock 的固定返回：带首尾空格的名字（考规范化）、非法 type、越界 salience
const MOCK_ENTITIES = {
  entities: [
    { name: 'LLM', type: 'technology', salience: 0.9 },
    { name: ' 状态管理 ', type: 'concept', salience: 0.7 },
    { name: '奇怪类型', type: 'other', salience: 5 },
  ],
};

function startMockLlm() {
  const state = { requests: 0 };
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    state.requests += 1;
    // 第一次请求故意回垃圾，验证「解析失败重试一次」的路径
    const content = state.requests === 1 ? '这不是 JSON' : JSON.stringify(MOCK_ENTITIES);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, state, baseUrl: `http://127.0.0.1:${server.address().port}/v1` });
    });
  });
}

test('extract-entities 端到端：增量、幂等、--force、删除清理', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'water-graph-extract-'));
  const contentRoot = path.join(root, 'content');
  const dbPath = path.join(root, 'graph.db');
  await mkdir(path.join(contentRoot, 'harness'), { recursive: true });
  await mkdir(path.join(contentRoot, 'llm'), { recursive: true });
  await mkdir(path.join(contentRoot, 'notes'), { recursive: true });
  await writeFile(path.join(contentRoot, 'harness/alpha.md'), ARTICLE_ALPHA);
  await writeFile(path.join(contentRoot, 'llm/beta.md'), ARTICLE_BETA);
  await writeFile(path.join(contentRoot, 'notes/drafty.md'), DRAFT);

  const { server, state, baseUrl } = await startMockLlm();
  const env = {
    GRAPH_LLM_BASE_URL: baseUrl,
    GRAPH_LLM_API_KEY: 'mock-key',
    GRAPH_LLM_MODEL: 'mock-model',
  };
  const silent = () => {};
  const run = (options = {}) =>
    runExtraction({ contentRoot, dbPath, env, log: silent, ...options });

  t.after(async () => {
    server.close();
    await rm(root, { recursive: true, force: true });
  });

  // 首跑：两篇入库，draft 跳过；甲第一次拿到垃圾 JSON，重试后成功
  const first = await run();
  assert.deepEqual(first, { added: 2, skipped: 0, draft: 1, failed: 0, removed: 0 });
  assert.equal(state.requests, 3, '甲重试一次 + 乙一次');

  const db = new Database(dbPath, { readonly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_entities').get().n, 6);
  const entities = db.prepare('SELECT name, name_norm, type FROM entities ORDER BY name_norm').all();
  assert.deepEqual(entities, [
    { name: 'LLM', name_norm: 'llm', type: 'technology' },
    { name: '奇怪类型', name_norm: '奇怪类型', type: 'concept' },
    { name: '状态管理', name_norm: '状态管理', type: 'concept' },
  ]);
  // salience 在关联表上：合法值保留，越界的回落到 0.5
  const saliences = db
    .prepare(
      `SELECT e.name_norm AS n, ae.salience AS s FROM article_entities ae
       JOIN entities e ON e.id = ae.entity_id WHERE ae.article_id = 'harness/alpha' ORDER BY n`,
    )
    .all();
  assert.deepEqual(saliences, [
    { n: 'llm', s: 0.9 },
    { n: '奇怪类型', s: 0.5 },
    { n: '状态管理', s: 0.7 },
  ]);

  // 幂等重跑：正文没变就不该再调 LLM，行数不变
  const second = await run();
  assert.deepEqual(second, { added: 0, skipped: 2, draft: 1, failed: 0, removed: 0 });
  assert.equal(state.requests, 3, '未变化的文章不能再产生请求');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_entities').get().n, 6);

  // --force：全部重抽，但不产生重复行
  const forced = await run({ force: true });
  assert.deepEqual(forced, { added: 2, skipped: 0, draft: 1, failed: 0, removed: 0 });
  assert.equal(state.requests, 5);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entities').get().n, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_entities').get().n, 6);

  // 正文改动 → 只重抽那一篇
  await writeFile(path.join(contentRoot, 'harness/alpha.md'), ARTICLE_ALPHA + '\n追加一段。\n');
  const updated = await run();
  assert.deepEqual(updated, { added: 1, skipped: 1, draft: 1, failed: 0, removed: 0 });

  // 删除文章 → 文章、关联、孤儿实体一起清掉
  await rm(path.join(contentRoot, 'llm/beta.md'));
  const cleaned = await run();
  assert.deepEqual(cleaned, { added: 0, skipped: 1, draft: 1, failed: 0, removed: 1 });
  assert.deepEqual(db.prepare('SELECT id FROM articles').all(), [{ id: 'harness/alpha' }]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_entities').get().n, 3);
  db.close();
});

test('缺少 GRAPH_LLM_API_KEY 时直接拒绝运行', async () => {
  await assert.rejects(
    runExtraction({ env: {}, log: () => {} }),
    /GRAPH_LLM_API_KEY/,
  );
});
