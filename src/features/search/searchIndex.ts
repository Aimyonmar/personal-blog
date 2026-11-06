import { getCloud } from '../../app/cloud'

export interface SearchDoc {
  slug: string
  title: string
  summary: string
  tags: string[]
  content: string
  published_at: string | null
  read_time: number
}

export interface SearchResult extends SearchDoc {
  score: number
  snippet: string
}

const CACHE_KEY = 'personal-blog:search-index:v1'
const CACHE_TTL = 10 * 60 * 1000

let memoryCache: { at: number; docs: SearchDoc[] } | null = null

/** 把 Markdown 洗成可搜索、可截断的纯文本。 */
export function toPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*/g, ' '))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(doc: Record<string, unknown>): SearchDoc {
  return {
    slug: typeof doc.slug === 'string' ? doc.slug : '',
    title: typeof doc.title === 'string' ? doc.title : '',
    summary: typeof doc.summary === 'string' ? doc.summary : '',
    tags: Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    content: typeof doc.content === 'string' ? toPlainText(doc.content) : '',
    published_at: typeof doc.published_at === 'string' ? doc.published_at : null,
    read_time: typeof doc.read_time === 'number' ? doc.read_time : 1,
  }
}

function readCache(): { at: number; docs: SearchDoc[] } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null') as { at?: unknown; docs?: unknown }
    if (!parsed || !Array.isArray(parsed.docs) || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > CACHE_TTL) return null
    return { at: parsed.at, docs: parsed.docs as SearchDoc[] }
  } catch {
    return null
  }
}

function writeCache(docs: SearchDoc[]) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), docs }))
  } catch {
    /* 索引过大或存储不可用时只保留内存缓存 */
  }
}

/** 客户端索引：直接读已发布文章，10 分钟缓存，不新增任何搜索后端。 */
export async function loadSearchIndex({ force = false } = {}): Promise<SearchDoc[]> {
  if (!force && memoryCache && Date.now() - memoryCache.at < CACHE_TTL) return memoryCache.docs
  if (!force) {
    const cached = readCache()
    if (cached) {
      memoryCache = cached
      return cached.docs
    }
  }

  const database = (await getCloud()).database as any
  const { data, error } = await database
    .from('blog_posts')
    .select('slug,title,summary,tags,content,published_at,read_time')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) throw new Error('搜索索引加载失败，请稍后重试。')

  const docs = (data ?? []).map(normalize).filter((doc: SearchDoc) => doc.slug)
  memoryCache = { at: Date.now(), docs }
  writeCache(docs)
  return docs
}

function buildSnippet(text: string, index: number, length: number) {
  const start = Math.max(0, index - 36)
  const end = Math.min(text.length, index + length + 64)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * 关键词搜索：标题 > 标签 > 摘要 > 正文；空格分隔的多个关键词需同时命中。
 */
export function searchArticles(docs: SearchDoc[], rawQuery: string, limit = 8): SearchResult[] {
  const terms = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const results: SearchResult[] = []
  for (const doc of docs) {
    const title = doc.title.toLowerCase()
    const tags = doc.tags.join(' ').toLowerCase()
    const summary = doc.summary.toLowerCase()
    const content = doc.content.toLowerCase()

    let score = 0
    let matched = true
    for (const term of terms) {
      let termScore = 0
      if (title.includes(term)) termScore = 12
      else if (tags.includes(term)) termScore = 8
      else if (summary.includes(term)) termScore = 4
      else if (content.includes(term)) termScore = 2
      if (termScore === 0) {
        matched = false
        break
      }
      score += termScore
    }
    if (!matched) continue

    const first = terms[0]
    const contentIndex = content.indexOf(first)
    const snippet =
      contentIndex >= 0
        ? buildSnippet(doc.content, contentIndex, first.length)
        : doc.summary || doc.content.slice(0, 100)

    results.push({ ...doc, score, snippet })
  }

  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (Date.parse(b.published_at ?? '') || 0) - (Date.parse(a.published_at ?? '') || 0)
    })
    .slice(0, limit)
}
