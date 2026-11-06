/** 文章相关的纯函数：不依赖云端、DOM 或浏览器存储，便于单元测试与复用。 */

/** 按中文 350 字/分钟、英文 220 词/分钟估算阅读时长，最少 1 分钟。 */
export function estimateReadTime(markdown: string) {
  const chineseChars = (markdown.match(/[\u3400-\u9fff]/g) ?? []).length
  const latinWords = (markdown.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.ceil(chineseChars / 350 + latinWords / 220))
}

/** 由标题生成 slug：保留中英文与数字，追加时间戳保证唯一。 */
export function buildSlug(title: string, now: number = Date.now()) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${normalized || 'article'}-${now.toString(36)}`
}

/** 按发布时间倒序排序；缺失发布时间的条目排在最后，且不修改原数组。 */
export function sortArticlesByPublishedAtDesc<T extends { published_at: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const a = left.published_at ?? ''
    const b = right.published_at ?? ''
    if (a === b) return 0
    if (!a) return 1
    if (!b) return -1
    return b.localeCompare(a)
  })
}
