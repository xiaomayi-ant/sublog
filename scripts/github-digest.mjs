// github-digest —— 把"最近关注/最近在做"抓成一份 data/github-activity.json。
//
// 数据全部走 `gh api`：本地 gh CLI 已经登录，脚本不用碰任何 token，
// 也符合"凭证只从环境变量取、优先用工具自己的状态命令"的原则。
//
// 两类信号：
//   关注（star / fork）——别人的东西，判断"值不值得展示"才有意义
//   在做（own-repo / pr / issue）——自己的产出，默认都算数
//
// 策展只在有 LLM 凭证时跑，复用 extract-entities.mjs 已经在用的三个变量名
// （GRAPH_LLM_API_KEY / GRAPH_LLM_BASE_URL / GRAPH_LLM_MODEL），不新增一套。
// 没有凭证：全部原样展示、不带点评——不能因为缺凭证就让页面开天窗，
// 这是 FluidImage 已经用过的降级哲学。
//
// 增量缓存 data/github-activity-cache.json（gitignored）：记录已经判过的
// item id 和判断结果，同一周内重跑不会对同一条目再花一次 LLM 调用；
// 窗口外的缓存项会被清掉，不会无限增长。
//
// 用法：
//   GITHUB_DIGEST_USER=xiaomayi-ant node scripts/github-digest.mjs
//   GRAPH_LLM_API_KEY=... node scripts/github-digest.mjs   带策展跑

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(projectRoot, 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'github-activity.json');
const CACHE_PATH = path.join(DATA_DIR, 'github-activity-cache.json');
const WINDOW_DAYS = 7;

const GITHUB_USER = process.env.GITHUB_DIGEST_USER || 'xiaomayi-ant';
// 这几种是自己的产出，不经"值不值得展示"的筛选，见 main() 里的说明
const OWN_KINDS = new Set(['own-repo', 'pr', 'issue']);

// 可选地读项目根 .env —— 与 extract-entities.mjs 同一份写法
async function loadDotEnv(env) {
  try {
    const raw = await readFile(path.join(projectRoot, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || line.trimStart().startsWith('#')) continue;
      const [, key, value] = match;
      if (!(key in env)) env[key] = value.replace(/^["']|["']$/g, '');
    }
  } catch {
    // 没有 .env 是常态
  }
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

// ── 抓取 ──────────────────────────────────────────────────────────

function fetchStars(since) {
  const rows = ghJson([
    'api', '-H', 'Accept: application/vnd.github.star+json',
    `users/${GITHUB_USER}/starred?per_page=50`,
  ]);
  return rows
    // 自己给自己仓库点的星不是"关注他人"，own-repo 那一路已经报过这个仓库了
    .filter((row) => row.starred_at >= since && row.repo.full_name.split('/')[0] !== GITHUB_USER)
    .map((row) => ({
      kind: 'star',
      id: `star:${row.repo.full_name}`,
      repo: row.repo.full_name,
      url: row.repo.html_url,
      title: row.repo.full_name,
      description: row.repo.description ?? '',
      language: row.repo.language ?? '',
      at: row.starred_at,
    }));
}

function fetchForks(since) {
  const events = ghJson(['api', `users/${GITHUB_USER}/events/public?per_page=100`]);
  return events
    .filter((event) => event.type === 'ForkEvent' && event.created_at >= since)
    .map((event) => ({
      kind: 'fork',
      id: `fork:${event.repo.name}:${event.created_at}`,
      repo: event.repo.name,
      url: `https://github.com/${event.repo.name}`,
      title: event.repo.name,
      description: event.payload?.forkee?.description ?? '',
      language: event.payload?.forkee?.language ?? '',
      at: event.created_at,
    }));
}

function fetchOwnRepos(since) {
  const repos = ghJson(['api', `users/${GITHUB_USER}/repos?per_page=30&sort=updated`]);
  return repos
    .filter((repo) => !repo.fork && repo.pushed_at >= since)
    .map((repo) => ({
      kind: 'own-repo',
      id: `own-repo:${repo.full_name}:${repo.pushed_at}`,
      repo: repo.full_name,
      url: repo.html_url,
      title: repo.full_name,
      description: repo.description ?? '',
      language: repo.language ?? '',
      at: repo.pushed_at,
    }));
}

function fetchAuthoredIssuesAndPrs(since) {
  const sinceDate = since.slice(0, 10);
  const result = ghJson([
    'api', '--method', 'GET', 'search/issues',
    '-f', `q=author:${GITHUB_USER} updated:>=${sinceDate}`,
    '-f', 'per_page=50',
  ]);
  return result.items
    .filter((item) => item.updated_at >= since)
    .map((item) => {
      const repo = item.repository_url.split('/').slice(-2).join('/');
      return {
        kind: item.pull_request ? 'pr' : 'issue',
        id: `${item.pull_request ? 'pr' : 'issue'}:${item.html_url}`,
        repo,
        url: item.html_url,
        title: item.title,
        description: '',
        language: '',
        at: item.updated_at,
      };
    });
}

// ── 策展 ──────────────────────────────────────────────────────────

function buildPrompt(items) {
  const system =
    '你在帮一个技术写作者的个人网站策展"最近在关注/在做"这个板块。' +
    '给你一批 GitHub 条目，kind 是 star / fork 时代表别人的仓库，是 own-repo / pr / issue ' +
    '时代表这个人自己的产出。\n' +
    '对 star / fork：判断 keep（是否值得展示给读者，过滤掉配置类/无描述/明显误点的噪音，' +
    '同一个仓库既 star 又 fork 时只需保留一条），note 说清楚这个仓库具体是什么、为什么' +
    '值得一提。\n' +
    '对 own-repo / pr / issue：keep 固定填 true（这是记录，不是拿来筛的候选），' +
    'note 用一句话概括做了什么，不用评价值不值得。\n' +
    '所有 note 都必须用中文，不要写夸奖式的空话，没有把握就写事实性的一句概括。只输出严格 JSON：' +
    '{"items":[{"id":"...","keep":true,"note":"..."}]}，id 必须和输入一一对应。';
  const user = JSON.stringify(
    items.map(({ id, kind, repo, title, description, language }) => ({
      id, kind, repo, title, description, language,
    })),
  );
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

async function callLlm({ baseUrl, apiKey, model }, messages) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`LLM 端点返回 ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function parseCuration(content) {
  const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const list = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(list)) throw new Error('输出里没有 items 数组');
  const byId = new Map();
  for (const row of list) {
    if (typeof row?.id !== 'string') continue;
    byId.set(row.id, { keep: row.keep !== false, note: typeof row.note === 'string' ? row.note : '' });
  }
  return byId;
}

async function curate(items) {
  const env = { ...process.env };
  await loadDotEnv(env);
  const apiKey = env.GRAPH_LLM_API_KEY;
  if (!apiKey || items.length === 0) {
    return new Map(items.map((item) => [item.id, { keep: true, note: '' }]));
  }
  const config = {
    apiKey,
    baseUrl: env.GRAPH_LLM_BASE_URL || 'https://api.openai.com/v1',
    model: env.GRAPH_LLM_MODEL || 'gpt-4o-mini',
  };
  try {
    const content = await callLlm(config, buildPrompt(items));
    const result = parseCuration(content);
    // 模型漏判的条目兜底 keep，不能因为漏了一条就整条丢失
    for (const item of items) if (!result.has(item.id)) result.set(item.id, { keep: true, note: '' });
    return result;
  } catch (error) {
    console.error(`策展失败，全部原样展示：${error.message}`);
    return new Map(items.map((item) => [item.id, { keep: true, note: '' }]));
  }
}

// ── 主流程 ────────────────────────────────────────────────────────

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`抓取 ${GITHUB_USER} 最近 ${WINDOW_DAYS} 天的活动（起点 ${since}）`);
  const raw = [
    ...fetchStars(since),
    ...fetchForks(since),
    ...fetchOwnRepos(since),
    ...fetchAuthoredIssuesAndPrs(since),
  ];
  // 同一个仓库这周内既 star 又 fork，只是同一次"关注"动作的两个信号 ——
  // fork 是更重的动作，留它就够了。放在代码里做而不是交给 LLM 判断：
  // 结构性的事实不该靠一次 LLM 调用去猜，猜得动也不该猜。
  const forkedRepos = new Set(raw.filter((i) => i.kind === 'fork').map((i) => i.repo));
  const deduped = raw.filter((item) => !(item.kind === 'star' && forkedRepos.has(item.repo)));
  console.log(`原始条目 ${raw.length} 条，去重后 ${deduped.length} 条`);

  const cache = await loadCache();
  const needsCuration = deduped.filter((item) => !cache[item.id]);
  console.log(`其中 ${needsCuration.length} 条是新的，需要判断`);

  const judged = await curate(needsCuration);
  for (const [id, verdict] of judged) cache[id] = verdict;

  // 只保留窗口内的缓存项，不然会无限增长
  const windowIds = new Set(deduped.map((item) => item.id));
  for (const id of Object.keys(cache)) if (!windowIds.has(id)) delete cache[id];

  // own-repo / pr / issue 是"在做"的记录，不是拿来筛"值不值得展示"的候选 ——
  // LLM 只负责给它们配一句点评，keep 永远为真，不能因为一次普通的 push
  // 被判定"不够有趣"就从记录里消失。
  const items = deduped
    .map((item) => ({ ...item, ...cache[item.id], keep: OWN_KINDS.has(item.kind) ? true : cache[item.id]?.keep }))
    .filter((item) => item.keep)
    .sort((a, b) => b.at.localeCompare(a.at));

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: now.toISOString(), window: { from: since, to: now.toISOString() }, items }, null, 2) + '\n',
  );
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');

  console.log(`写入 ${items.length} 条（过滤掉 ${raw.length - items.length} 条）→ ${path.relative(projectRoot, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
