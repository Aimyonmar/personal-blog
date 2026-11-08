import { ArrowLeft, CalendarDays, Clock3, Download, FileText, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Article } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { formatDate } from '../components/ArticleCard'
import { ArticleConnections } from '../components/ArticleConnections'
import { ArticleSeries } from '../components/ArticleSeries'
import { ArticleToc } from '../components/ArticleToc'
import { MarkdownArticle } from '../components/MarkdownArticle'
import { ErrorState, LoadingState } from '../components/States'
import { getArticleBySlug, listPublishedArticles } from '../features/articles/localContent'
import { selectAdjacent, selectRelated } from '../features/articles/articleRelations'
import { selectSeriesMembership } from '../features/articles/series'

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
  const membership = useMemo(() => selectSeriesMembership(siblings, slug), [siblings, slug])
  const recent = useMemo(() => siblings.filter((item) => item.slug !== slug).slice(0, 4), [siblings, slug])

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
      <header className="article-hero">
        <div className="article-hero-inner">
          <Link className="back-link" to="/"><ArrowLeft size={16} /> 返回文章列表</Link>
          <div className="hero-tag-list">
            {article.tags.map((tag) => (
              <Link key={tag} to={`/tags?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>
            ))}
          </div>
          <h1>{article.title}</h1>
          {article.summary && <p className="article-hero-summary">{article.summary}</p>}
          <div className="article-hero-meta">
            <span><UserRound size={14} /> 微光手记</span>
            <span><CalendarDays size={14} /> {formatDate(article.published_at)}</span>
            <span><Clock3 size={14} /> {article.read_time} 分钟阅读</span>
            {membership && <span>系列 · {membership.series.name}</span>}
          </div>
        </div>
      </header>

      <div className="article-shell">
        <div className="article-main">
          {article.cover_image && (
            <img className="article-cover" src={article.cover_image} alt={`${article.title}封面`} loading="lazy" decoding="async" />
          )}

          <MarkdownArticle content={article.content} />

          {membership && <ArticleSeries membership={membership} currentSlug={slug} />}

          <section className="article-info-card" aria-label="文章信息">
            <h2>ARTICLE INFO</h2>
            <dl>
              <div><dt>作者</dt><dd>微光手记</dd></div>
              <div><dt>发布</dt><dd>{formatDate(article.published_at)}</dd></div>
              <div><dt>阅读</dt><dd>约 {article.read_time} 分钟</dd></div>
              <div><dt>标签</dt><dd>{article.tags.join(' · ')}</dd></div>
            </dl>
          </section>

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
        </div>

        <aside className="article-sidebar">
          <ArticleToc content={article.content} />
          <div className="sidebar-card sidebar-note">
            <h2>ABOUT</h2>
            <p>文章使用 Markdown 编写，随仓库一起构建，不依赖任何云端服务。</p>
            <p><Link to="/about">了解作者与站点 →</Link></p>
          </div>
          {recent.length > 0 && (
            <div className="sidebar-card sidebar-recent">
              <h2>RECENT POSTS</h2>
              <ol>
                {recent.map((item) => (
                  <li key={item.slug}>
                    <Link to={`/article/${item.slug}`}>{item.title}</Link>
                    <time dateTime={item.published_at ?? undefined}>{formatDate(item.published_at)}</time>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </article>
  )
}
