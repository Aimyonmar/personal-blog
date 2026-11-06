import { ArrowLeft, Download, FileText, LockKeyhole, PencilLine, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate, useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import type { Article } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { formatDate } from '../components/ArticleCard'
import { ErrorState, LoadingState } from '../components/States'
import { deleteArticle, getArticleBySlug } from '../features/articles/articleService'
import { useAuth } from '../features/auth/AuthProvider'
import { createDownloadUrl, formatFileSize } from '../features/storage/storageService'

export function ArticlePage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')

  usePageMeta({
    title: article?.title ?? '正在读取文章',
    description: article?.summary,
    path: `/article/${slug}`,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextArticle = await getArticleBySlug(slug)
      if (!nextArticle) throw new Error('没有找到这篇文章，链接可能已经变化。')
      setArticle(nextArticle)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '文章加载失败。')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!article || !user) return
    let active = true
    const resolveFiles = async () => {
      try {
        if (article.cover_image_path) {
          const url = await createDownloadUrl(article.cover_image_path)
          if (active) setCoverUrl(url)
        }
        const pairs = await Promise.all(article.attachments.map(async (item) => [item.path, await createDownloadUrl(item.path)] as const))
        if (active) setAttachmentUrls(Object.fromEntries(pairs))
      } catch {
        if (active) setAttachmentUrls({})
      }
    }
    void resolveFiles()
    return () => { active = false }
  }, [article, user])

  const handleDelete = async () => {
    if (!article) return
    setDeleting(true)
    setActionError('')
    try {
      await deleteArticle(article.slug)
      navigate('/', { replace: true })
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : '文章删除失败。')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (loading) return <section className="content-section page-section"><LoadingState label="正在读取文章" /></section>
  if (error || !article) return <section className="content-section page-section"><ErrorState message={error} onRetry={() => void load()} /></section>

  const isOwner = Boolean(user && article.owner_id && user.id === article.owner_id)

  return (
    <article className="article-page">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> 返回文章列表</Link>
      <header className="article-header">
        <div className="article-kicker">
          <span>{formatDate(article.published_at)}</span>
          <span>{article.read_time} 分钟阅读</span>
          {article.status === 'draft' && <span className="draft-badge">草稿</span>}
        </div>
        <h1>{article.title}</h1>
        <p>{article.summary}</p>
        <div className="tag-list large-tags">
          {article.tags.map((tag) => <Link key={tag} to={`/tags?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}
        </div>

        {isOwner && (
          <div className="author-actions">
            <span className="author-actions-label">你是这篇文章的作者</span>
            <div className="author-actions-buttons">
              <Link className="secondary-button small-button" to={`/write/${article.slug}`}><PencilLine size={16} /> 编辑</Link>
              {confirmingDelete ? (
                <>
                  <button className="danger-button small-button" type="button" onClick={() => void handleDelete()} disabled={deleting}>
                    <Trash2 size={16} /> {deleting ? '正在删除…' : '确认删除'}
                  </button>
                  <button className="text-button-plain" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>取消</button>
                </>
              ) : (
                <button className="secondary-button small-button" type="button" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={16} /> 删除
                </button>
              )}
            </div>
            {confirmingDelete && <p className="action-warning">删除后无法恢复，云端附件不会被自动清理。</p>}
            {actionError && <p className="field-error" role="alert">{actionError}</p>}
          </div>
        )}
      </header>

      {article.cover_image_path && (
        coverUrl ? (
          <img className="article-cover" src={coverUrl} alt={`${article.title}封面`} loading="lazy" decoding="async" />
        ) : (
          <div className="locked-media"><LockKeyhole size={22} /><span>{user ? '云端封面暂时无法加载' : '登录后可查看云端封面'}</span></div>
        )
      )}

      <div className="article-layout">
        <aside className="article-aside">
          <span>NOTE</span>
          <p>文章使用 Markdown 编写，内容从云端数据库实时读取。</p>
        </aside>
        <div className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ img: ({ node, ...props }) => <img {...props} loading="lazy" decoding="async" /> }}
          >
            {article.content}
          </ReactMarkdown>
        </div>
      </div>

      {article.attachments.length > 0 && (
        <section className="attachment-section">
          <div className="section-heading mini-heading">
            <div><span className="eyebrow">DOWNLOADS</span><h2>文章附件</h2></div>
            {!user && <p>登录后可生成有效 10 分钟的安全下载链接。</p>}
          </div>
          <div className="attachment-list">
            {article.attachments.map((item) => (
              <div className="attachment-item" key={item.path}>
                <FileText size={20} />
                <div><strong>{item.name}</strong><span>{formatFileSize(item.size)}</span></div>
                {attachmentUrls[item.path] ? (
                  <a className="icon-button" href={attachmentUrls[item.path]} target="_blank" rel="noreferrer" aria-label={`下载${item.name}`}><Download size={18} /></a>
                ) : <LockKeyhole size={17} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
