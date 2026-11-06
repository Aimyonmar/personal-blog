import type { ArticleListItem } from '../../app/types'

function timeOf(post: ArticleListItem) {
  const value = post.published_at ? Date.parse(post.published_at) : Number.NaN
  return Number.isNaN(value) ? 0 : value
}

/** 按发布时间升序排列（不修改入参），用于「上一篇 / 下一篇」。 */
export function byPublishedAtAsc(items: ArticleListItem[]) {
  return [...items].sort((a, b) => timeOf(a) - timeOf(b))
}

/** 找出当前文章的上一篇（更早）与下一篇（更新）；未发布的文章不参与。 */
export function selectAdjacent(items: ArticleListItem[], slug: string) {
  const ordered = byPublishedAtAsc(items.filter((item) => item.published_at))
  const index = ordered.findIndex((item) => item.slug === slug)
  if (index === -1) return { previous: null, next: null }
  return {
    previous: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  }
}

/**
 * 相关文章：按共同标签数量降序，同分时优先较新的文章；
 * 没有共同标签时退化为最近的其它文章，保证区块不空。
 */
export function selectRelated(
  items: ArticleListItem[],
  current: Pick<ArticleListItem, 'slug' | 'tags'>,
  limit = 3,
) {
  const tags = new Set(current.tags ?? [])
  return items
    .filter((item) => item.slug !== current.slug)
    .map((item) => ({
      item,
      shared: (item.tags ?? []).filter((tag) => tags.has(tag)).length,
    }))
    .sort((a, b) => b.shared - a.shared || timeOf(b.item) - timeOf(a.item))
    .slice(0, limit)
    .map((entry) => entry.item)
}
