import generated from '../../generated/posts.json'
import type { Article, ArticleListItem } from '../../app/types'

export type { Article, ArticleListItem }

const posts = generated as ArticleListItem[]

/**
 * 正文按需加载：Vite 在构建时收集 content/posts 下的 Markdown，
 * 生成按文件路径索引的动态 import，文章页打开时才拉取对应正文。
 */
const rawModules = import.meta.glob('/content/posts/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/** 去掉 frontmatter，只保留正文。 */
export function stripFrontmatter(raw: string) {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return normalized
  return normalized.slice(end + 4).replace(/^\n+/, '')
}

/** 首页 / 标签页直接同步读取元数据，无需请求。 */
export function listPublishedArticles(): ArticleListItem[] {
  return posts
}

export function findArticleMeta(slug: string): ArticleListItem | null {
  return posts.find((post) => post.slug === slug) ?? null
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const meta = findArticleMeta(slug)
  if (!meta) return null

  const loader = rawModules[`/${meta.file}`]
  if (!loader) return null

  const raw = await loader()
  return { ...meta, content: stripFrontmatter(raw) }
}

/** 搜索索引需要全部正文；文章数量有限，打开搜索时并行加载一次即可。 */
export async function loadAllArticleBodies(): Promise<Article[]> {
  const articles = await Promise.all(
    posts.map(async (meta) => {
      const loader = rawModules[`/${meta.file}`]
      if (!loader) return null
      return { ...meta, content: stripFrontmatter(await loader()) }
    }),
  )
  return articles.filter((article): article is Article => article !== null)
}
