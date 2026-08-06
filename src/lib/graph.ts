// 知识图谱的构建期查询层：只读 data/graph.json（由 npm run graph:extract 导出）。
// 文件不存在时所有函数返回空结构 —— 图谱是文章的增强，不是构建的门槛：
// 没有图谱产物的机器照样能 build，只是没有图谱区。
//
// 读 JSON 而不是 SQLite：抽取产物要进 git 才能到达生产（CI 从干净 checkout 构建），
// 二进制库不适合入库，也不该让构建期背上 better-sqlite3 这个原生依赖。
// 规模是几十篇文章、几百条关联，全量载进内存后在内存里查就够，不需要索引结构。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
  slug: string;
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
  slug: string;
  type: string;
  articleCount: number;
}

// data/graph.json 的形状，与 scripts/extract-entities.mjs 的 exportGraph 对齐
interface GraphData {
  articles: { id: string; collection: string; title: string }[];
  entities: { name: string; slug: string; type: string }[];
  links: { articleId: string; slug: string; salience: number }[];
}

const EMPTY_DATA: GraphData = { articles: [], entities: [], links: [] };

const articleNodeId = (articleId: string) => `article:${articleId}`;
const entityNodeId = (slug: string) => `entity:${slug}`;
const conceptHref = (slug: string) => `/blog/concepts/${encodeURIComponent(slug)}`;

// 懒读、进程内复用；构建期只读，没有任何写操作
let data: GraphData | undefined;

function getData(): GraphData {
  if (data === undefined) {
    const file = path.join(process.cwd(), 'data', 'graph.json');
    data = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as GraphData) : EMPTY_DATA;
  }
  return data;
}

// 产物可能比内容旧（抽完又发了新文章、或文章转 draft 后还没重跑），
// 图谱里只允许出现当前已发布的文章，否则会给构建产物留下死链。
async function publishedArticleIds(): Promise<Set<string>> {
  const all = await getAllResearch();
  return new Set(all.map((entry) => `${entry.collection}/${entry.id}`));
}

// 只保留指向已发布文章的关联，后面所有查询都从这里出发
async function livelinks(): Promise<{
  graph: GraphData;
  links: GraphData['links'];
  titleOf: Map<string, string>;
  entityOf: Map<string, GraphData['entities'][number]>;
}> {
  const graph = getData();
  const published = await publishedArticleIds();
  const titleOf = new Map(
    graph.articles.filter((a) => published.has(a.id)).map((a) => [a.id, a.title]),
  );
  const entityOf = new Map(graph.entities.map((entity) => [entity.slug, entity]));
  const links = graph.links.filter((link) => titleOf.has(link.articleId) && entityOf.has(link.slug));
  return { graph, links, titleOf, entityOf };
}

export interface ArticleRelations {
  concepts: ConceptRef[];
  related: RelatedArticle[];
  neighbors: { nodes: GraphNode[]; edges: GraphEdge[] };
}

const EMPTY_RELATIONS: ArticleRelations = {
  concepts: [],
  related: [],
  neighbors: { nodes: [], edges: [] },
};

// 文章页收尾用：本文涉及的概念、共享实体推断出的相关文章、两跳内的局部图
export async function getArticleRelations(
  collection: string,
  slug: string,
): Promise<ArticleRelations> {
  const articleId = `${collection}/${slug}`;
  const { links, titleOf, entityOf } = await livelinks();
  if (!titleOf.has(articleId)) return EMPTY_RELATIONS;

  const own = links.filter((link) => link.articleId === articleId);
  if (own.length === 0) return EMPTY_RELATIONS;

  const concepts: ConceptRef[] = own
    .map((link) => {
      const entity = entityOf.get(link.slug)!;
      return {
        name: entity.name,
        slug: entity.slug,
        type: entity.type,
        salience: link.salience,
        href: conceptHref(entity.slug),
      };
    })
    .sort((a, b) => b.salience - a.salience || a.name.localeCompare(b.name));

  // 相关文章 = 共享实体数 ≥1 的其他已发布文章，按共享数排序取前 5
  const ownSlugs = new Set(own.map((link) => link.slug));
  const sharedBy = new Map<string, string[]>();
  for (const link of links) {
    if (link.articleId === articleId || !ownSlugs.has(link.slug)) continue;
    const shared = sharedBy.get(link.articleId);
    if (shared) shared.push(link.slug);
    else sharedBy.set(link.articleId, [link.slug]);
  }

  const related: RelatedArticle[] = [...sharedBy.entries()]
    .map(([id, shared]) => ({
      id,
      title: titleOf.get(id)!,
      sharedCount: shared.length,
      href: `/blog/${id}`,
    }))
    .sort((a, b) => b.sharedCount - a.sharedCount || a.title.localeCompare(b.title))
    .slice(0, 5);

  // 局部图：本文 + 本文的实体 + 共享实体的文章，边只画到「共享」的那些实体
  const nodes: GraphNode[] = [
    {
      id: articleNodeId(articleId),
      label: titleOf.get(articleId)!,
      kind: 'article',
      href: `/blog/${articleId}`,
    },
  ];
  const edges: GraphEdge[] = [];
  for (const concept of concepts) {
    nodes.push({
      id: entityNodeId(concept.slug),
      label: concept.name,
      kind: 'entity',
      href: concept.href,
    });
    edges.push({ source: articleNodeId(articleId), target: entityNodeId(concept.slug) });
  }
  for (const article of related) {
    nodes.push({
      id: articleNodeId(article.id),
      label: article.title,
      kind: 'article',
      href: article.href,
    });
    for (const shared of sharedBy.get(article.id)!) {
      edges.push({ source: articleNodeId(article.id), target: entityNodeId(shared) });
    }
  }

  return { concepts, related, neighbors: { nodes, edges } };
}

// 全站图：文章（墨）+ 实体（河蓝）+ 标签。共现边不物化，这里只画 文章—实体 与 文章—标签。
export async function getFullGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const { links, titleOf, entityOf } = await livelinks();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const [id, title] of titleOf) {
    const nodeId = articleNodeId(id);
    seen.add(nodeId);
    nodes.push({ id: nodeId, label: title, kind: 'article', href: `/blog/${id}` });
  }
  for (const link of links) {
    const entity = entityOf.get(link.slug)!;
    const entityId = entityNodeId(entity.slug);
    if (!seen.has(entityId)) {
      seen.add(entityId);
      nodes.push({
        id: entityId,
        label: entity.name,
        kind: 'entity',
        href: conceptHref(entity.slug),
      });
    }
    edges.push({ source: articleNodeId(link.articleId), target: entityId });
  }

  // 标签不是 LLM 抽的，从内容集合现取，并进同一张图
  const all = await getAllResearch();
  const tags = await getAllTags();
  for (const tag of tags) {
    nodes.push({
      id: `tag:${tag}`,
      label: `#${tag}`,
      kind: 'tag',
      href: `/blog/tags/${encodeURIComponent(tag)}`,
    });
  }
  for (const entry of all) {
    const articleId = `${entry.collection}/${entry.id}`;
    if (!seen.has(articleNodeId(articleId))) continue;
    for (const tag of entry.data.tags) {
      edges.push({ source: articleNodeId(articleId), target: `tag:${tag}` });
    }
  }

  return { nodes, edges };
}

// 概念聚合页用：至少出现在一篇已发布文章里的实体
export async function getAllConcepts(): Promise<ConceptSummary[]> {
  const { links, entityOf } = await livelinks();

  const counts = new Map<string, Set<string>>();
  for (const link of links) {
    const ids = counts.get(link.slug);
    if (ids) ids.add(link.articleId);
    else counts.set(link.slug, new Set([link.articleId]));
  }

  return [...counts.entries()]
    .map(([slug, ids]) => {
      const entity = entityOf.get(slug)!;
      return { name: entity.name, slug, type: entity.type, articleCount: ids.size };
    })
    .sort((a, b) => b.articleCount - a.articleCount || a.name.localeCompare(b.name));
}

export interface ConceptArticle {
  id: string;
  title: string;
  salience: number;
}

// 某个概念下的已发布文章，按 salience 排序
export async function getConceptArticles(slug: string): Promise<ConceptArticle[]> {
  const { links, titleOf } = await livelinks();
  return links
    .filter((link) => link.slug === slug)
    .map((link) => ({
      id: link.articleId,
      title: titleOf.get(link.articleId)!,
      salience: link.salience,
    }))
    .sort((a, b) => b.salience - a.salience || a.title.localeCompare(b.title));
}

// 统计一行：图谱页头部的 meta
export async function getGraphStats(): Promise<{ articles: number; concepts: number }> {
  const { links } = await livelinks();
  return {
    articles: new Set(links.map((link) => link.articleId)).size,
    concepts: new Set(links.map((link) => link.slug)).size,
  };
}
