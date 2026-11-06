import { ArrowLeft, Download, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Article } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { formatDate } from '../components/ArticleCard'
import { ArticleConnections } from '../components/ArticleConnections'
import { ArticleToc } from '../components/ArticleToc'
import { MarkdownArticle } from '../components/MarkdownArticle'
import { ErrorState, LoadingState } from '../components/States'
import { getArticleBySlug, listPublishedArticles } from '../features/articles/localContent'
import { selectAdjacent, selectRelated } from '../features/articles/articleRelations'

function formatFileSize(size: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function ArticlePage() {
  const { slug = '' } = useParams()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const siblings = listPublishedArticles()
  const { previous, next } = useMemo(() => selectAdjacent(siblings, slug), [siblings, slug])
  const related = useMemo(() => (article ? selectRelated(siblings, article) : []), [siblings, article])

  usePageMeta({
    title: article?.title ?? '正在读取文章',
    description: article?.summary,
    path: `/article/${slug}`,
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getArticleBySlug(slug)
      .then((result) => {
        if (!active) return
        if (result) setArticle(result)
        else setError('没有找到这篇文章，链接可能已经变化。')
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '文章加载失败。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [slug])

  if (loading) return <section className="content-section page-section"><LoadingState label="正在读取文章" /></section>
  if (error || !article) return <section className="content-section page-section"><ErrorState message={error} /></section>

  return (
    <article className="article-page">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> 返回文章列表</Link>
      <header className="article-header">
        <div className="article-kicker">
          <span>{formatDate(article.published_at)}</span>
          <span>{article.read_time} 分钟阅读</span>
        </div>
        <h1>{article.title}</h1>
        {article.summary && <p>{article.summary}</p>}
        <div className="tag-list large-tags">
          {article.tags.map((tag) => <Link key={tag} to={`/tags?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}
        </div>
      </header>

      {article.cover_image && (
        <img className="article-cover" src={article.cover_image} alt={`${article.title}封面`} loading="lazy" decoding="async" />
      )}

      <div className="article-layout">
        <aside className="article-aside">
          <ArticleToc content={article.content} />
          <span>NOTE</span>
          <p>文章使用 Markdown 编写，随仓库一起构建，不依赖任何云端服务。</p>
        </aside>
        <MarkdownArticle content={article.content} />
      </div>

      <ArticleConnections previous={previous} next={next} related={related} />

      {article.attachments.length > 0 && (
        <section className="attachment-section">
          <div className="section-heading mini-heading">
            <div><span className="eyebrow">DOWNLOADS</span><h2>文章附件</h2></div>
          </div>
          <div className="attachment-list">
            {article.attachments.map((item) => (
              <div className="attachment-item" key={item.path}>
                <FileText size={20} />
                <div>
                  <strong>{item.name}</strong>
                  <span>{formatFileSize(item.size)}{item.type ? ` · ${item.type}` : ''}</span>
                </div>
                <a className="icon-button" href={item.path} download={item.name} aria-label={`下载${item.name}`}>
                  <Download size={18} />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
