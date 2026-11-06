import { Hash, Layers3 } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '../app/usePageMeta'
import { ArticleCard } from '../components/ArticleCard'
import { EmptyState } from '../components/States'
import { listPublishedArticles } from '../features/articles/localContent'

export function TagsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTag = searchParams.get('tag') ?? ''
  const allArticles = listPublishedArticles()

  usePageMeta({
    title: activeTag ? `#${activeTag} 标签下的文章` : '标签分类',
    description: activeTag ? `微光手记中带有「${activeTag}」标签的全部文章。` : '按标签浏览微光手记的全部文章。',
    path: activeTag ? `/tags?tag=${encodeURIComponent(activeTag)}` : '/tags',
  })

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    allArticles.forEach((article) => article.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [allArticles])

  const filtered = activeTag ? allArticles.filter((article) => article.tags.includes(activeTag)) : allArticles

  return (
    <section className="content-section page-section">
      <div className="page-title-grid">
        <div>
          <span className="eyebrow"><Layers3 size={14} /> TOPIC INDEX</span>
          <h1>标签分类</h1>
        </div>
        <p>主题不是边界，而是进入内容的不同入口。选择一个标签，查看相关的全部文章。</p>
      </div>

      {allArticles.length === 0 ? (
        <EmptyState
          title="还没有可以浏览的标签"
          description="文章写好后，frontmatter 里的 tags 会自动出现在这里。"
        />
      ) : (
        <>
          <div className="tag-cloud" aria-label="标签筛选">
            <button className={!activeTag ? 'tag-pill active' : 'tag-pill'} type="button" onClick={() => setSearchParams({})}>
              全部 <span>{allArticles.length}</span>
            </button>
            {tags.map(([tag, count]) => (
              <button key={tag} className={activeTag === tag ? 'tag-pill active' : 'tag-pill'} type="button" onClick={() => setSearchParams({ tag })}>
                <Hash size={14} /> {tag} <span>{count}</span>
              </button>
            ))}
          </div>

          <div className="filter-summary">
            <strong>{activeTag ? `#${activeTag}` : '全部文章'}</strong>
            <span>{filtered.length} 篇</span>
          </div>

          {filtered.length > 0 ? (
            <div className="article-list compact-list">
              {filtered.map((article, index) => <ArticleCard key={article.slug} article={article} index={index} />)}
            </div>
          ) : (
            <EmptyState title="这个标签下还没有文章" description="换一个标签看看，或者稍后再来。" />
          )}
        </>
      )}
    </section>
  )
}
