import { Hash, Layers3 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ArticleListItem } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { ArticleCard } from '../components/ArticleCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { listPublishedArticles, readArticleListCache } from '../features/articles/articleService'

export function TagsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTag = searchParams.get('tag') ?? ''
  // 与首页一致：先读本地缓存渲染，再静默刷新
  const [cachedArticles] = useState(() => {
    const cached = readArticleListCache()
    return cached && cached.length > 0 ? cached : null
  })
  const [allArticles, setAllArticles] = useState<ArticleListItem[]>(cachedArticles ?? [])
  const [loading, setLoading] = useState(!cachedArticles)
  const [error, setError] = useState('')

  usePageMeta({
    title: activeTag ? `#${activeTag} 标签下的文章` : '标签分类',
    description: activeTag ? `微光手记中带有「${activeTag}」标签的全部文章。` : '按标签浏览微光手记的全部文章。',
    path: activeTag ? `/tags?tag=${encodeURIComponent(activeTag)}` : '/tags',
  })

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      setAllArticles(await listPublishedArticles())
      setError('')
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : '未知错误')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load(Boolean(cachedArticles)) }, [load, cachedArticles])

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

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && (
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
              {filtered.map((article) => <ArticleCard key={article.id} article={article} />)}
            </div>
          ) : (
            <EmptyState title="这个标签下还没有文章" description="换一个标签看看，或者稍后再来。" />
          )}
        </>
      )}
    </section>
  )
}
