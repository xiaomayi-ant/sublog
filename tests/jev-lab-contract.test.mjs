import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Lab 02（/lab/jev）的契约。这一页是回放，不是现场调用——契约里最要紧的不是
// 交互细节，是「别把回放说成实测」：数字必须和来源一致，没公布的不能补。
const distRoot = path.resolve(import.meta.dirname, '..', 'dist');
const readRoute = (route) => readFile(path.join(distRoot, route, 'index.html'), 'utf8');

test('/lab 索引把 Jev 回放列为一条入口', async () => {
  const html = await readRoute('lab');
  assert.match(html, /href="\/lab\/jev"/);
  assert.doesNotMatch(html, /还在搭，做完了链过来/, '占位说明应随第一条入口一起拿掉');
});

test('/lab/jev 只有一个 h1，并声明自己是回放', async () => {
  const html = await readRoute('lab/jev');
  assert.equal((html.match(/<h1(?:\s|>)/g) ?? []).length, 1);
  assert.match(html, /回放，不是现场调用/);
  assert.match(html, /Disallowed CORS origin/, '页面要写明为什么不能现场调用');
});

test('回放数据与来源一致：公布的三个值在，没公布的三个是 null', async () => {
  const html = await readRoute('lab/jev');
  const json = html.match(/<script type="application\/json" id="jev-replay">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, '页面应内嵌回放数据');
  const { questions, replay } = JSON.parse(json);

  assert.equal(questions.length, 6);
  assert.deepEqual(
    questions.map((q) => q.type),
    ['choice', 'score', 'noul', 'noul', 'noul', 'noul'],
  );

  const { sdk, playground } = replay.runs;
  assert.equal(sdk.queue.choice, 'incident_response');
  assert.equal(sdk.queue.confidence, 0.95);
  assert.equal(sdk.goodwill_risk.score, 1.95);
  assert.equal(sdk.is_time_sensitive.noul, 0.97);
  assert.equal(playground.queue.confidence, 0.86);
  assert.equal(playground.queue.probabilities.incident_response, 0.91);
  assert.equal(playground.goodwill_risk.score, 1.93);

  for (const run of [sdk, playground]) {
    for (const id of ['has_reproduction', 'mentions_money', 'is_automated']) {
      assert.equal(run[id], null, `${id} 教程没公布，回放里不能补数`);
    }
  }

  assert.deepEqual(replay.policy, { AUTO_ROUTE_CONFIDENCE: 0.75, YES: 0.8, FRUSTRATED: 2.0 });
  assert.deepEqual(replay.finalRoute, ['incident_response', 'today']);
  assert.equal(replay.usage.input_tokens, 524);
});

test('工单原文逐字出现，请求体按官方字段拼出', async () => {
  const html = await readRoute('lab/jev');
  assert.match(html, /Export to CSV has been broken since Friday\./);
  assert.match(html, /We have a board meeting Thursday\./);
  assert.match(html, /&quot;type&quot;: &quot;choice&quot;/);
  assert.match(html, /&quot;criteria&quot;/);
  assert.match(html, /api\.typesafe\.ai\/v1\/systemone/);
});
