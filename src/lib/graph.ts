// 知识图谱的构建期查询层：只读 data/graph.db（由 npm run graph:extract 生成）。
// 库不存在时所有函数返回空结构 —— 图谱是文章的增强，不是构建的门槛：
// 没有 LLM 凭证的机器（CI、部署机）照样能 build，只是没有图谱区。
import { existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getAllResearch, getAllTags } from './content';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'article' | 'entity' | 'tag';
  href: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface ConceptRef {
  name: string;
  nameNorm: string;
  type: string;
  salience: number;
  href: string;
}

export interface RelatedArticle {
  id: string;
  title: string;
  sharedCount: number;
  href: string;
}

export interface ConceptSummary {
  name: string;
  nameNorm: string;
  type: string;
  articleCount: number;
}

const articleNodeId = (articleId: string) => `article:${articleId}`;
const entityNodeId = (nameNorm: string) => `entity:${nameNorm}`;
const conceptHref = (nameNorm: string) => `/blog/concepts/${encodeURIComponent(nameNorm)}`;

// 懒开库、进程内复用；readonly，构建期没有任何写操作
let db: Database.Database | null | undefined;

function getDb(): Database.Database | null {
  if (db === undefined) {
    const file = path.join(process.cwd(), 'data', 'graph.db');
    db = existsSync(file) ? new Database(file, { readonly: true }) : null;
  }
  return db;
}

// DB 可能比内容旧（抽完又发了新文章、或文章转 draft 后还没重跑），
// 图谱里只允许出现当前已发布的文章，否则会给构建产物留下死链。
async function publishedArticleIds(): Promise<Set<string>> {
  const all = await getAllResearch();
  return new Set(all.map((entry) => `${entry.collection}/${entry.id}`));
}

export interface ArticleRelations {
  concepts: ConceptRef[];
  related: RelatedArticle[];
  neighbors: { nodes: GraphNode[]; edges: GraphEdge[] };
}

const EMPTY_RELATIONS: ArticleRelations = { concepts: [], related: [], neighbors: { nodes: [], edges: [] } };

// 文章页收尾用：本文涉及的概念、共享实体推断出的相关文章、两跳内的局部图
export async function getArticleRelations(collection: string, slug: string): Promise<ArticleRelations> {
  const database = getDb();
  if (!database) return EMPTY_RELATIONS;

  const articleId = `${collection}/${slug}`;
  const published = await publishedArticleIds();
  if (!published.has(articleId)) return EMPTY_RELATIONS;

  const concepts = database
    .prepare(
      `SELECT e.name, e.name_norm AS nameNorm, e.type, ae.salience
       FROM article_entities ae JOIN entities e ON e.id = ae.entity_id
       WHERE ae.article_id = ? ORDER BY ae.salience DESC, e.name`,
    )
    .all(articleId) as Omit<ConceptRef, 'href'>[];
  if (concepts.length === 0) return EMPTY_RELATIONS;

  // 相关文章 = 共享实体数 ≥1 的其他已发布文章，按共享数排序取前 5
  const related = (
    database
      .prepare(
        `SELECT ae2.article_id AS id, a.title, COUNT(*) AS sharedCount
         FROM article_entities ae1
         JOIN article_entities ae2 ON ae1.entity_id = ae2.entity_id AND ae2.article_id != ae1.article_id
         JOIN articles a ON a.id = ae2.article_id
         WHERE ae1.article_id = ?
         GROUP BY ae2.article_id ORDER BY sharedCount DESC, a.title LIMIT 5`,
      )
      .all(articleId) as RelatedArticle[]
  )
    .filter((row) => published.has(row.id))
    .map((row) => ({ ...row, href: `/blog/${row.id}` }));

  // 局部图：本文 + 本文的实体 + 共享实体的文章，边只画到"共享"的那些实体
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const title =
    (database.prepare('SELECT title FROM articles WHERE id = ?').get(articleId) as { title: string })
      ?.title ?? slug;
  nodes.push({ id: articleNodeId(articleId), label: title, kind: 'article', href: `/blog/${articleId}` });
  for (const concept of concepts) {
    nodes.push({
      id: entityNodeId(concept.nameNorm),
      label: concept.name,
      kind: 'entity',
      href: conceptHref(concept.nameNorm),
    });
    edges.push({ source: articleNodeId(articleId), target: entityNodeId(concept.nameNorm) });
  }
  for (const row of related) {
    nodes.push({ id: articleNodeId(row.id), label: row.title, kind: 'article', href: `/blog/${row.id}` });
    const shared = database
      .prepare(
        `SELECT e.name_norm AS nameNorm FROM article_entities ae1
         JOIN article_entities ae2 ON ae1.entity_id = ae2.entity_id
         JOIN entities e ON e.id = ae2.entity_id
         WHERE ae1.article_id = ? AND ae2.article_id = ?`,
      )
      .all(articleId, row.id) as { nameNorm: string }[];
    for (const { nameNorm } of shared) {
      edges.push({ source: articleNodeId(row.id), target: entityNodeId(nameNorm) });
    }
  }

  return {
    concepts: concepts.map((concept) => ({ ...concept, href: conceptHref(concept.nameNorm) })),
    related,
    neighbors: { nodes, edges },
  };
}

// 全站图：文章（墨）+ 实体（河蓝）+ 标签。共现边不物化，这里只画 文章—实体 与 文章—标签。
export async function getFullGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const database = getDb();
  const published = await publishedArticleIds();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  if (database) {
    const articles = database.prepare('SELECT id, title FROM articles').all() as {
      id: string;
      title: string;
    }[];
    for (const article of articles) {
      if (!published.has(article.id)) continue;
      const nodeId = articleNodeId(article.id);
      seen.add(nodeId);
      nodes.push({ id: nodeId, label: article.title, kind: 'article', href: `/blog/${article.id}` });
    }
    const rows = database
      .prepare(
        `SELECT ae.article_id AS articleId, e.name, e.name_norm AS nameNorm
         FROM article_entities ae JOIN entities e ON e.id = ae.entity_id`,
      )
      .all() as { articleId: string; name: string; nameNorm: string }[];
    for (const row of rows) {
      if (!published.has(row.articleId)) continue;
      const entityId = entityNodeId(row.nameNorm);
      if (!seen.has(entityId)) {
        seen.add(entityId);
        nodes.push({ id: entityId, label: row.name, kind: 'entity', href: conceptHref(row.nameNorm) });
      }
      edges.push({ source: articleNodeId(row.articleId), target: entityId });
    }
  }

  // 标签不是 LLM 抽的，从内容集合现取，并进同一张图
  const all = await getAllResearch();
  const tags = await getAllTags();
  for (const tag of tags) {
    const tagId = `tag:${tag}`;
    nodes.push({ id: tagId, label: `#${tag}`, kind: 'tag', href: `/blog/tags/${encodeURIComponent(tag)}` });
  }
  for (const entry of all) {
    if (!seen.has(articleNodeId(`${entry.collection}/${entry.id}`))) continue;
    for (const tag of entry.data.tags) {
      edges.push({ source: articleNodeId(`${entry.collection}/${entry.id}`), target: `tag:${tag}` });
    }
  }

  return { nodes, edges };
}

// 概念聚合页用：至少出现在一篇已发布文章里的实体
export async function getAllConcepts(): Promise<ConceptSummary[]> {
  const database = getDb();
  if (!database) return [];
  const published = await publishedArticleIds();
  const rows = database
    .prepare(
      `SELECT e.name, e.name_norm AS nameNorm, e.type, ae.article_id AS articleId
       FROM entities e JOIN article_entities ae ON ae.entity_id = e.id`,
    )
    .all() as { name: string; nameNorm: string; type: string; articleId: string }[];

  const byConcept = new Map<string, ConceptSummary & { ids: Set<string> }>();
  for (const row of rows) {
    if (!published.has(row.articleId)) continue;
    let concept = byConcept.get(row.nameNorm);
    if (!concept) {
      concept = { name: row.name, nameNorm: row.nameNorm, type: row.type, articleCount: 0, ids: new Set() };
      byConcept.set(row.nameNorm, concept);
    }
    concept.ids.add(row.articleId);
  }
  return [...byConcept.values()]
    .map(({ ids, ...concept }) => ({ ...concept, articleCount: ids.size }))
    .sort((a, b) => b.articleCount - a.articleCount || a.name.localeCompare(b.name));
}

export interface ConceptArticle {
  id: string;
  title: string;
  salience: number;
}

// 某个概念下的已发布文章，按 salience 排序
export async function getConceptArticles(nameNorm: string): Promise<ConceptArticle[]> {
  const database = getDb();
  if (!database) return [];
  const published = await publishedArticleIds();
  const rows = database
    .prepare(
      `SELECT ae.article_id AS id, a.title, ae.salience
       FROM article_entities ae
       JOIN entities e ON e.id = ae.entity_id
       JOIN articles a ON a.id = ae.article_id
       WHERE e.name_norm = ? ORDER BY ae.salience DESC, a.title`,
    )
    .all(nameNorm) as ConceptArticle[];
  return rows.filter((row) => published.has(row.id));
}

// 统计一行：图谱页头部的 meta
export async function getGraphStats(): Promise<{ articles: number; concepts: number }> {
  const database = getDb();
  if (!database) return { articles: 0, concepts: 0 };
  const concepts = await getAllConcepts();
  const published = await publishedArticleIds();
  const extracted = (
    database.prepare('SELECT id FROM articles').all() as { id: string }[]
  ).filter((row) => published.has(row.id)).length;
  return { articles: extracted, concepts: concepts.length };
}
