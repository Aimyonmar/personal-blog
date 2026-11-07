import { ArrowLeft, BookOpen } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePageMeta } from '../app/usePageMeta'
import { ArticleCard } from '../components/ArticleCard'
import { EmptyState } from '../components/States'
import { findSeriesBySlug } from '../features/articles/series'
import { listPublishedArticles } from '../features/articles/localContent'

export function SeriesPage() {
  const { slug = '' } = useParams()
  const allArticles = listPublishedArticles()
  const series = useMemo(() => findSeriesBySlug(allArticles, slug), [allArticles, slug])

  usePageMeta({
    title: series ? `${series.name}｜系列` : '系列',
    description: series
      ? `「${series.name}」系列共 ${series.total} 篇，按序号排列。`
      : '没有找到这个系列。',
    path: `/series/${encodeURIComponent(slug)}`,
  })

  if (!series) {
    return (
      <section className="content-section page-section">
        <Link className="back-link" to="/"><ArrowLeft size={16} /> 返回文章列表</Link>
        <EmptyState
          title="没有找到这个系列"
          description="系列可能已经改名或还没有文章，回到文章列表看看其它内容。"
        />
      </section>
    )
  }

  return (
    <section className="content-section page-section series-page">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> 返回文章列表</Link>
      <div className="page-title-grid">
        <div>
          <span className="eyebrow"><BookOpen size={14} /> SERIES</span>
          <h1>{series.name}</h1>
        </div>
        <p>共 {series.total} 篇，按系列序号排列；序号相同或缺失时，按发布时间排序。</p>
      </div>

      <div className="article-list compact-list">
        {series.items.map((article, index) => (
          <ArticleCard key={article.slug} article={article} index={index} />
        ))}
      </div>
    </section>
  )
}
