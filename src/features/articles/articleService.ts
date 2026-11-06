import { cloud } from '../../app/cloud'
import type { Article, ArticleDraft, ArticleListItem } from '../../app/types'

const postsTable = () => (cloud.database as any).from('blog_posts')

const LIST_COLUMNS = 'id,owner_id,slug,title,summary,tags,status,cover_image_path,read_time,published_at,created_at,updated_at'

const LIST_CACHE_KEY = 'personal-blog:article-list:v1'

/** 读取本地缓存的文章列表（用于首屏秒开，随后静默刷新） */
export function readArticleListCache(): ArticleListItem[] | null {
  try {
    const raw = window.localStorage.getItem(LIST_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { items?: ArticleListItem[] }
    return Array.isArray(parsed.items) ? parsed.items : null
  } catch {
    return null
  }
}

function writeArticleListCache(items: ArticleListItem[]) {
  try {
    window.localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }))
  } catch {
    /* 存储不可用（隐私模式等）时静默跳过 */
  }
}

function clearArticleListCache() {
  try {
    window.localStorage.removeItem(LIST_CACHE_KEY)
  } catch {
    /* 同上 */
  }
}

function fail(error: unknown, fallback: string): never {
  const candidate = error as { code?: string; message?: string }
  if (candidate.code === '42P01') throw new Error('文章数据表尚未初始化。')
  if (candidate.code === '42501') throw new Error('当前账号没有执行此操作的权限。')
  throw new Error(candidate.message || fallback)
}

export async function listPublishedArticles(tag?: string): Promise<ArticleListItem[]> {
  let query = postsTable()
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (tag) query = query.contains('tags', [tag])
  const { data, error } = await query
  if (error) fail(error, '文章加载失败。')
  const items = (data ?? []) as ArticleListItem[]
  if (!tag) writeArticleListCache(items)
  return items
}

export async function getArticleBySlug(slug: string) {
  const { data, error } = await postsTable()
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) fail(error, '文章加载失败。')
  return (data ?? null) as Article | null
}

function publishedAtFor(draft: ArticleDraft, current?: string | null) {
  if (draft.status !== 'published') return null
  return draft.published_at ?? current ?? new Date().toISOString()
}

export async function createArticle(draft: ArticleDraft) {
  const session = await cloud.auth.getSession()
  if (session.error || !session.data) throw new Error('请先登录后再发布文章。')

  const { data, error } = await postsTable()
    .insert({
      ...draft,
      attachments: draft.attachments ?? [],
      cover_image_path: draft.cover_image_path ?? null,
      published_at: publishedAtFor(draft),
    })
    .select()

  if (error) fail(error, '文章保存失败。')
  const rows = (data ?? []) as Article[]
  if (rows.length === 0) throw new Error('文章未保存，当前账号可能没有写入权限。')
  clearArticleListCache()
  return rows[0]
}

export async function updateArticle(slug: string, draft: ArticleDraft, currentPublishedAt: string | null) {
  const session = await cloud.auth.getSession()
  if (session.error || !session.data) throw new Error('请先登录后再修改文章。')

  const { data, error } = await postsTable()
    .update({
      ...draft,
      attachments: draft.attachments ?? [],
      cover_image_path: draft.cover_image_path ?? null,
      published_at: publishedAtFor(draft, currentPublishedAt),
      updated_at: new Date().toISOString(),
    })
    .eq('slug', slug)
    .select()

  if (error) fail(error, '文章更新失败。')
  const rows = (data ?? []) as Article[]
  if (rows.length === 0) throw new Error('文章未更新，可能不是你的文章或链接已失效。')
  clearArticleListCache()
  return rows[0]
}

export async function deleteArticle(slug: string) {
  const session = await cloud.auth.getSession()
  if (session.error || !session.data) throw new Error('请先登录后再删除文章。')

  const { data, error } = await postsTable().delete().eq('slug', slug).select('id')
  if (error) fail(error, '文章删除失败。')
  const rows = (data ?? []) as Array<{ id: number }>
  if (rows.length === 0) throw new Error('文章未删除，可能不是你的文章或链接已失效。')
  clearArticleListCache()
}

export function buildSlug(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${normalized || 'article'}-${Date.now().toString(36)}`
}

export function estimateReadTime(markdown: string) {
  const chineseChars = (markdown.match(/[\u3400-\u9fff]/g) ?? []).length
  const latinWords = (markdown.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.ceil(chineseChars / 350 + latinWords / 220))
}
