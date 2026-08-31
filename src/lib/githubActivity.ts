// GitHub 活动的构建期读取层：只读 data/github-activity.json
// （由 npm run github:digest 生成，见 scripts/github-digest.mjs）。
//
// 文件不存在时返回空列表 —— 这个板块是页面的增强，不是构建的门槛，
// 道理和 lib/graph.ts 读 data/graph.json 完全一样。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface ActivityItem {
  kind: 'star' | 'fork' | 'own-repo' | 'pr' | 'issue';
  repo: string;
  url: string;
  title: string;
  description: string;
  language: string;
  at: string;
  note: string;
}

interface ActivityData {
  generatedAt: string;
  window: { from: string; to: string };
  items: ActivityItem[];
}

const EMPTY_DATA: ActivityData = {
  generatedAt: '',
  window: { from: '', to: '' },
  items: [],
};

let data: ActivityData | undefined;

function getData(): ActivityData {
  if (data === undefined) {
    const file = path.join(process.cwd(), 'data', 'github-activity.json');
    data = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ActivityData) : EMPTY_DATA;
  }
  return data;
}

const FOLLOWING_KINDS = new Set<ActivityItem['kind']>(['star', 'fork']);
const BUILDING_KINDS = new Set<ActivityItem['kind']>(['own-repo', 'pr', 'issue']);

/** "最近在关注"：star / fork 别人的仓库，已经按 at 倒序 */
export function getRecentlyFollowing(): ActivityItem[] {
  return getData().items.filter((item) => FOLLOWING_KINDS.has(item.kind));
}

/** "最近在做"：自己 push 过的仓库、发的 PR/issue，已经按 at 倒序 */
export function getRecentlyBuilding(): ActivityItem[] {
  return getData().items.filter((item) => BUILDING_KINDS.has(item.kind));
}

export function getActivityGeneratedAt(): string | null {
  return getData().generatedAt || null;
}
