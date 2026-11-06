import { ArrowUpRight, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ArticleListItem } from '../app/types'

export function formatDate(value: string | null | undefined) {
  if (!value) return '尚未发布'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
}

export function ArticleCard({ article, index = 0, featured = false }: { article: ArticleListItem; index?: number; featured?: boolean }) {
  return (
    <article className={featured ? 'article-card featured-card' : 'article-card'}>
      <div className="article-card-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
      <div className="article-card-body">
        <div className="article-meta">
          <span>{formatDate(article.published_at)}</span>
          <span><Clock3 size={14} /> {article.read_time} 分钟阅读</span>
        </div>
        <h2><Link to={`/article/${article.slug}`}>{article.title}</Link></h2>
        <p>{article.summary}</p>
        <div className="article-card-bottom">
          <div className="tag-list" aria-label="文章标签">
            {article.tags.map((tag) => <Link key={tag} to={`/tags?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}
          </div>
          <Link className="read-link" to={`/article/${article.slug}`} aria-label={`阅读${article.title}`}>
            阅读全文 <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  )
}
