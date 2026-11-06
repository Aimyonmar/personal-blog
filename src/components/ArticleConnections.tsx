import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ArticleListItem } from '../app/types'
import { formatDate } from './ArticleCard'

export function ArticleConnections({
  previous,
  next,
  related,
}: {
  previous: ArticleListItem | null
  next: ArticleListItem | null
  related: ArticleListItem[]
}) {
  if (!previous && !next && related.length === 0) return null

  return (
    <section className="article-connections" aria-label="继续阅读">
      {(previous || next) && (
        <div className="article-adjacent">
          {previous ? (
            <Link className="adjacent-link" to={`/article/${previous.slug}`}>
              <span className="adjacent-label"><ArrowLeft size={14} /> 上一篇</span>
              <strong>{previous.title}</strong>
              <span className="adjacent-date">{formatDate(previous.published_at)}</span>
            </Link>
          ) : <span className="adjacent-placeholder" />}
          {next ? (
            <Link className="adjacent-link adjacent-next" to={`/article/${next.slug}`}>
              <span className="adjacent-label">下一篇 <ArrowRight size={14} /></span>
              <strong>{next.title}</strong>
              <span className="adjacent-date">{formatDate(next.published_at)}</span>
            </Link>
          ) : <span className="adjacent-placeholder" />}
        </div>
      )}

      {related.length > 0 && (
        <div className="related-articles">
          <div className="section-heading mini-heading">
            <div><span className="eyebrow">KEEP READING</span><h2>相关文章</h2></div>
          </div>
          <div className="related-grid">
            {related.map((item) => (
              <article className="related-card" key={item.slug}>
                <div className="article-meta">
                  <span>{formatDate(item.published_at)}</span>
                  <span>{item.read_time} 分钟阅读</span>
                </div>
                <h3><Link to={`/article/${item.slug}`}>{item.title}</Link></h3>
                <p>{item.summary}</p>
                <div className="tag-list">
                  {item.tags.map((tag) => <Link key={tag} to={`/tags?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
