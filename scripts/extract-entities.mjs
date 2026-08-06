// 知识图谱实体抽取：扫描四个写作 collection 的 Markdown，
// 用 OpenAI 兼容端点抽实体，增量写入 data/graph.db（SQLite），
// 再把全量投影导出成 data/graph.json —— 后者才是入库、被构建期读取的产物。
//
// 两段式的原因：SQLite 适合增量（按正文 hash 跳过、按文章清理），但二进制不适合
// 进 git；JSON 可 review 可 diff，构建期也就不需要 better-sqlite3 当运行时依赖。
// 所以 .db 是本地缓存（gitignored），.json 是提交物。
//
// 全自动、可反复跑：正文 SHA-256 没变就跳过，--force 强制重跑；
// 删掉的文章（含转成 draft 的）会从库里清掉。构建期只读 JSON，
// 文件不存在时图谱降级为空 —— 所以本脚本不进 build 链，需要 LLM 凭证时单独跑。
//
// 用法：GRAPH_LLM_API_KEY=... npm run graph:extract [-- --force]
// 端点：GRAPH_LLM_BASE_URL（默认 https://api.openai.com/v1）/ GRAPH_LLM_MODEL（默认 gpt-4o-mini）
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const projectRoot = path.resolve(import.meta.dirname, '..');
const COLLECTIONS = ['harness', 'llm', 'eval', 'notes'];
const ENTITY_TYPES = ['concept', 'technology', 'person', 'organization'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  extracted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS article_entities (
  article_id TEXT NOT NULL REFERENCES articles(id),
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  salience REAL NOT NULL DEFAULT 0.5,
  PRIMARY KEY (article_id, entity_id)
);
`;

// 可选地读项目根 .env：手写 key=value 解析，不为这点事引 dotenv
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
    // 没有 .env 是常态，环境变量直接给就行
  }
}

async function listMarkdownFiles(contentRoot) {
  const files = [];
  for (const collection of COLLECTIONS) {
    const dir = path.join(contentRoot, collection);
    let entries;
    try {
      entries = await readdir(dir, { recursive: true, withFileTypes: true });
    } catch {
      continue; // collection 目录不存在就跳过
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({
          collection,
          slug: entry.name.replace(/\.md$/, ''),
          filePath: path.join(entry.parentPath, entry.name),
        });
      }
    }
  }
  return files;
}

// frontmatter 只做两件事：认 draft、取 title。不引 YAML 库，
// 这两个字段在站点的写作约定里都是单行标量。
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { draft: false, title: '', body: raw };
  const frontmatter = match[1];
  const titleMatch = frontmatter.match(/^title:\s*(.+)\s*$/m);
  return {
    draft: /^draft:\s*true\s*$/m.test(frontmatter),
    title: titleMatch ? titleMatch[1].replace(/^["']|["']$/g, '') : '',
    body: raw.slice(match[0].length),
  };
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

// 实体名来自 LLM，什么都可能出现（「RAG/检索增强」「Node.js」）。
// nameNorm 只负责去重，进不了 URL；路由要另一把安全的钥匙：
// 去掉会把路径切开或让静态产物写歪的字符，中文原样保留（tags 路由早就这么用了）。
function slugifyName(nameNorm) {
  const cleaned = nameNorm
    .replace(/[\s/\\?#%.:<>"'|*]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'concept';
}

// 全量投影 → data/graph.json。按 name_norm 排序后再分配 slug，
// 于是撞名时的 -2 后缀在同一份数据上每次都落到同一个实体，diff 不会无故翻动。
function exportGraph(db) {
  const articles = db
    .prepare('SELECT id, collection, title FROM articles ORDER BY id')
    .all();
  const rows = db
    .prepare('SELECT name, name_norm AS nameNorm, type FROM entities ORDER BY name_norm')
    .all();

  const slugByNorm = new Map();
  const taken = new Set();
  const entities = rows.map((row) => {
    const base = slugifyName(row.nameNorm);
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    slugByNorm.set(row.nameNorm, slug);
    return { name: row.name, slug, type: row.type };
  });

  const links = db
    .prepare(
      `SELECT ae.article_id AS articleId, e.name_norm AS nameNorm, ae.salience
       FROM article_entities ae JOIN entities e ON e.id = ae.entity_id
       ORDER BY ae.article_id, e.name_norm`,
    )
    .all()
    .map((row) => ({
      articleId: row.articleId,
      slug: slugByNorm.get(row.nameNorm),
      salience: row.salience,
    }));

  return { articles, entities, links };
}

function buildPrompt(title, body, errorNote) {
  const system =
    '你是知识图谱的实体抽取器。从给定的中文技术文章里抽取 5 到 15 个最重要的实体，' +
    '只输出严格 JSON，形如 {"entities":[{"name":"...","type":"concept","salience":0.9}]}。' +
    'type 只能是 concept / technology / person / organization；salience 是 0 到 1 的重要度。' +
    '实体名用原文语言，但给规范名（如「大语言模型」统一为 LLM），同一概念只出现一次。';
  const user =
    (errorNote ? `上次你的输出无法解析（${errorNote}），这次只输出合法 JSON。\n\n` : '') +
    `标题：${title}\n\n正文：\n${body.slice(0, 12000)}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

async function callLlm({ baseUrl, apiKey, model }, messages) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`LLM 端点返回 ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// 容忍模型把 JSON 裹进代码栅栏；接受裸数组或 {"entities":[...]}
function parseEntities(content) {
  const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const list = Array.isArray(parsed) ? parsed : parsed.entities;
  if (!Array.isArray(list)) throw new Error('输出里没有 entities 数组');

  const seen = new Set();
  const entities = [];
  for (const item of list) {
    if (typeof item?.name !== 'string' || !item.name.trim()) continue;
    const name = item.name.trim();
    const nameNorm = normalizeName(name);
    if (seen.has(nameNorm)) continue;
    seen.add(nameNorm);
    entities.push({
      name,
      nameNorm,
      type: ENTITY_TYPES.includes(item.type) ? item.type : 'concept',
      salience:
        typeof item.salience === 'number' && item.salience >= 0 && item.salience <= 1
          ? item.salience
          : 0.5,
    });
  }
  if (entities.length === 0) throw new Error('entities 数组为空');
  return entities;
}

async function extractWithRetry(llm, title, body) {
  let error = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callLlm(llm, buildPrompt(title, body, error?.message));
      return parseEntities(content);
    } catch (err) {
      error = err;
    }
  }
  throw error;
}

function openDatabase(dbPath) {
  const db = new Database(dbPath);
  db.exec(SCHEMA);
  return db;
}

function storeArticle(db, { id, collection, title, hash }, entities) {
  const now = new Date().toISOString();
  const upsertEntity = db.prepare(
    `INSERT INTO entities (name, name_norm, type, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(name_norm) DO UPDATE SET name = excluded.name, type = excluded.type`,
  );
  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO articles (id, collection, title, content_hash, extracted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, content_hash = excluded.content_hash, extracted_at = excluded.extracted_at`,
    ).run(id, collection, title, hash, now);
    db.prepare('DELETE FROM article_entities WHERE article_id = ?').run(id);
    for (const entity of entities) {
      upsertEntity.run(entity.name, entity.nameNorm, entity.type, now);
      // upsert 的 lastInsertRowid 在冲突分支不可靠，统一按 name_norm 回查
      const { id: entityId } = db
        .prepare('SELECT id FROM entities WHERE name_norm = ?')
        .get(entity.nameNorm);
      db.prepare(
        'INSERT OR REPLACE INTO article_entities (article_id, entity_id, salience) VALUES (?, ?, ?)',
      ).run(id, entityId, entity.salience);
    }
  });
  transaction();
}

export async function runExtraction({
  contentRoot = path.join(projectRoot, 'src/content'),
  dbPath = path.join(projectRoot, 'data/graph.db'),
  jsonPath,
  force = false,
  env = process.env,
  log = console.log,
}) {
  const exportPath = jsonPath ?? path.join(path.dirname(dbPath), 'graph.json');
  const llm = {
    baseUrl: env.GRAPH_LLM_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: env.GRAPH_LLM_API_KEY,
    model: env.GRAPH_LLM_MODEL ?? 'gpt-4o-mini',
  };
  if (!llm.apiKey) {
    throw new Error('缺少 GRAPH_LLM_API_KEY —— 见 .env.example');
  }

  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  const files = await listMarkdownFiles(contentRoot);

  const stats = { added: 0, skipped: 0, draft: 0, failed: 0, removed: 0 };
  const liveIds = new Set();
  const hashStmt = db.prepare('SELECT content_hash FROM articles WHERE id = ?');

  for (const file of files) {
    const id = `${file.collection}/${file.slug}`;
    const raw = await readFile(file.filePath, 'utf8');
    const { draft, title, body } = parseFrontmatter(raw);
    if (draft) {
      stats.draft += 1;
      continue;
    }
    liveIds.add(id);

    const hash = createHash('sha256').update(body).digest('hex');
    if (!force && hashStmt.get(id)?.content_hash === hash) {
      stats.skipped += 1;
      continue;
    }

    try {
      const entities = await extractWithRetry(llm, title || file.slug, body);
      storeArticle(db, { id, collection: file.collection, title: title || file.slug, hash }, entities);
      stats.added += 1;
      log(`✓ ${id} — ${entities.map((entity) => entity.name).join('、')}`);
    } catch (err) {
      stats.failed += 1;
      log(`✗ ${id} — 抽取失败，跳过（${err.message}）`);
    }
  }

  // 文件没了（或转 draft）的文章从库里清掉，关联跟着走
  const stored = db.prepare('SELECT id FROM articles').all();
  for (const { id } of stored) {
    if (!liveIds.has(id)) {
      db.prepare('DELETE FROM article_entities WHERE article_id = ?').run(id);
      db.prepare('DELETE FROM articles WHERE id = ?').run(id);
      stats.removed += 1;
      log(`- ${id} — 文章已不存在，从图谱移除`);
    }
  }
  // 不再被任何文章引用的实体一并清掉
  db.prepare(
    `DELETE FROM entities WHERE id NOT IN (SELECT DISTINCT entity_id FROM article_entities)`,
  ).run();

  // 每次跑完都重导一遍：即便这轮全跳过，清理也可能改了图，产物要跟库一致
  const graph = exportGraph(db);
  db.close();
  await writeFile(exportPath, `${JSON.stringify(graph, null, 2)}\n`);

  log(
    `完成：新增/更新 ${stats.added}，未变跳过 ${stats.skipped}，draft 跳过 ${stats.draft}，` +
      `失败 ${stats.failed}，移除 ${stats.removed}`,
  );
  log(
    `已导出 ${path.relative(projectRoot, exportPath)}：` +
      `${graph.articles.length} 篇文章 · ${graph.entities.length} 个概念 · ${graph.links.length} 条关联`,
  );
  return stats;
}

// 直接以脚本运行时才进 main；测试 import runExtraction 不带 CLI 副作用
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = { ...process.env };
  await loadDotEnv(env);
  const force = process.argv.includes('--force');
  await runExtraction({
    contentRoot: env.GRAPH_CONTENT_ROOT ?? undefined,
    dbPath: env.GRAPH_DB_PATH ?? undefined,
    force,
    env,
  }).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
