import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { SeriesMembership } from '../features/articles/series'

/** 文章页的系列区块：系列名、本篇序号、按序号的上一篇/下一篇、系列全部篇目。 */
export function ArticleSeries({ membership, currentSlug }: { membership: SeriesMembership; currentSlug: string }) {
  const { series, position, previous, next } = membership

  return (
    <section className="article-series" aria-labelledby="article-series-title">
      <div className="article-series-head">
        <div>
          <span className="eyebrow"><BookOpen size={14} /> SERIES</span>
          <h2 id="article-series-title">
            <Link to={`/series/${encodeURIComponent(series.slug)}`}>{series.name}</Link>
          </h2>
        </div>
        <p className="article-series-progress">第 {position} 篇 / 共 {series.total} 篇</p>
      </div>

      <nav className="article-series-nav" aria-label="系列内导航">
        {previous ? (
          <Link to={`/article/${previous.slug}`}><ArrowLeft size={15} /> 上一篇 · {previous.title}</Link>
        ) : (
          <span>已经是系列第一篇</span>
        )}
        {next ? (
          <Link to={`/article/${next.slug}`}>下一篇 · {next.title} <ArrowRight size={15} /></Link>
        ) : (
          <span>系列最后一篇</span>
        )}
      </nav>

      <ol className="article-series-list">
        {series.items.map((item, index) => (
          <li key={item.slug} className={item.slug === currentSlug ? 'current' : undefined}>
            <span className="series-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            {item.slug === currentSlug
              ? <span aria-current="page">{item.title}</span>
              : <Link to={`/article/${item.slug}`}>{item.title}</Link>}
          </li>
        ))}
      </ol>
    </section>
  )
}
