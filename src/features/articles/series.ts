import type { ArticleListItem } from '../../app/types'

/** 与 scripts/blog-data.mjs 保持一致的系列名归一规则。 */
export function normalizeSeriesName(value: string | null | undefined) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

export function seriesSlug(name: string) {
  const key = normalizeSeriesName(name).toLowerCase()
  const slug = key.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return slug || 'series'
}

export interface SeriesGroup {
  /** 归一后的小写系列名，用于分组比较 */
  key: string
  /** 展示用系列名：取出现次数最多的写法；票数相同取排序最靠前的一篇 */
  name: string
  slug: string
  items: ArticleListItem[]
  total: number
}

export interface SeriesMembership {
  series: SeriesGroup
  /** 本篇在系列中的 1-based 序号 */
  position: number
  previous: ArticleListItem | null
  next: ArticleListItem | null
}

function orderOf(post: ArticleListItem) {
  const raw = post.series_order
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

function timeOf(post: ArticleListItem) {
  const value = post.published_at ? Date.parse(post.published_at) : Number.NaN
  return Number.isNaN(value) ? 0 : value
}

/** 系列内排序：有序号按序号升序，缺序号排最后；同序号按发布时间升序，再按 slug。 */
export function compareSeriesPosts(a: ArticleListItem, b: ArticleListItem) {
  const left = orderOf(a)
  const right = orderOf(b)
  if (left !== null && right !== null && left !== right) return left - right
  if ((left === null) !== (right === null)) return left === null ? 1 : -1
  const leftTime = timeOf(a)
  const rightTime = timeOf(b)
  if (leftTime !== rightTime) {
    if (!leftTime) return 1
    if (!rightTime) return -1
    return leftTime - rightTime
  }
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
}

/** 展示名：取出现次数最多的写法；票数相同取排序最靠前的一篇，保证结果确定。 */
function displayName(items: ArticleListItem[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const spelling = normalizeSeriesName(item.series)
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1)
  }
  let name = normalizeSeriesName(items[0].series)
  let best = counts.get(name) ?? 0
  for (const [spelling, count] of counts) {
    if (count > best) {
      name = spelling
      best = count
    }
  }
  return name
}

/** 按系列聚合，返回按系列名 key 字典序排列的系列列表；slug 冲突时追加 -2、-3。 */
export function buildSeries(items: ArticleListItem[]): SeriesGroup[] {
  const groups = new Map<string, ArticleListItem[]>()
  for (const item of items) {
    const name = normalizeSeriesName(item.series)
    if (!name) continue
    const key = name.toLowerCase()
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }

  const used = new Set<string>()
  return [...groups.keys()].sort().map((key) => {
    const grouped = [...(groups.get(key) ?? [])].sort(compareSeriesPosts)
    const name = displayName(grouped)
    let slug = seriesSlug(name)
    if (used.has(slug)) {
      let index = 2
      while (used.has(`${slug}-${index}`)) index += 1
      slug = `${slug}-${index}`
    }
    used.add(slug)
    return { key, name, slug, items: grouped, total: grouped.length }
  })
}

/** 当前文章的系列信息；不属于任何系列时返回 null。 */
export function selectSeriesMembership(items: ArticleListItem[], slug: string): SeriesMembership | null {
  const current = items.find((item) => item.slug === slug)
  if (!current || !normalizeSeriesName(current.series)) return null

  const key = normalizeSeriesName(current.series).toLowerCase()
  const series = buildSeries(items).find((group) => group.key === key)
  if (!series) return null
  const index = series.items.findIndex((item) => item.slug === slug)
  if (index === -1) return null

  return {
    series,
    position: index + 1,
    previous: series.items[index - 1] ?? null,
    next: series.items[index + 1] ?? null,
  }
}

/** 按系列页的 slug 查找；找不到或 slug 为空时返回 null。slug 已由路由解码。 */
export function findSeriesBySlug(items: ArticleListItem[], slug: string): SeriesGroup | null {
  const target = normalizeSeriesName(slug).toLowerCase()
  if (!target) return null
  return buildSeries(items).find((group) => group.slug === target) ?? null
}
