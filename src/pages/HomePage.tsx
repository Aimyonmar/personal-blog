import { ArrowDown, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ArticleListItem } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { ArticleCard } from '../components/ArticleCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { listPublishedArticles, readArticleListCache } from '../features/articles/articleService'

export function HomePage() {
  // 首屏先用本地缓存的列表渲染（若有），随后静默刷新，避免白屏等待
  const [cachedArticles] = useState(() => {
    const cached = readArticleListCache()
    return cached && cached.length > 0 ? cached : null
  })
  const [articles, setArticles] = useState<ArticleListItem[]>(cachedArticles ?? [])
  const [loading, setLoading] = useState(!cachedArticles)
  const [error, setError] = useState('')

  usePageMeta({
    title: '微光手记 | 技术与生活随笔',
    description: '记录技术实践、产品思考与日常灵感的个人博客。把复杂的事，写得清楚一点。',
    path: '/',
  })

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      setArticles(await listPublishedArticles())
      setError('')
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : '未知错误')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load(Boolean(cachedArticles)) }, [load, cachedArticles])

  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> TECH · LIFE · NOTES</span>
          <h1 className="hero-slogan">这里记录工程实践、产品思考与日常灵感。<br /><em>不是标准答案，只是把走过的路整理成可以再次出发的坐标。</em></h1>
          <p className="hero-tagline">把复杂的事，写得清楚一点。</p>
          <div className="hero-actions">
            <a className="primary-button" href="#latest">阅读最新文章 <ArrowDown size={17} /></a>
            <Link className="text-link" to="/about">认识作者</Link>
          </div>
        </div>
        <aside className="hero-note" aria-label="站点介绍">
          <span className="note-number">01</span>
          <div>
            <span className="note-kicker">FIELD NOTES</span>
            <p>保持好奇，持续构建。<br />认真对待每一个微小问题。</p>
          </div>
          <div className="orbit-mark" aria-hidden="true"><span /></div>
        </aside>
      </section>

      <div className="marquee-band" aria-hidden="true">
        <div className="marquee-track">
          <span className="marquee-group">GLOW NOTES · 微光手记 · ENGINEERING · 工程实践 · PRODUCT · 产品思考 · DAILY LIFE · 日常灵感 · FIELD NOTES · 保持好奇 ·&nbsp;</span>
          <span className="marquee-group">GLOW NOTES · 微光手记 · ENGINEERING · 工程实践 · PRODUCT · 产品思考 · DAILY LIFE · 日常灵感 · FIELD NOTES · 保持好奇 ·&nbsp;</span>
        </div>
      </div>

      <section className="content-section" id="latest">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LATEST WRITING</span>
            <h2>最近<em>更新</em></h2>
          </div>
          <p>从技术实现到生活观察，每篇文章都尽量留下可复用的思考过程。</p>
        </div>

        {loading && <LoadingState label="正在从云端读取文章" />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
        {!loading && !error && articles.length === 0 && (
          <EmptyState title="还没有已发布的文章" description="登录后前往“写文章”，发布第一篇 Markdown 内容。" />
        )}
        {!loading && !error && articles.length > 0 && (
          <div className="article-list">
            {articles.map((article, index) => <ArticleCard key={article.id} article={article} featured={index === 0} />)}
          </div>
        )}
      </section>
    </>
  )
}
