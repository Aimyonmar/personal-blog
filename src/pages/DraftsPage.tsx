import { FileText, LockKeyhole, PencilLine, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ArticleListItem } from '../app/types'
import { usePageMeta } from '../app/usePageMeta'
import { formatDate } from '../components/ArticleCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { listDraftArticles } from '../features/articles/articleService'
import { useAuth } from '../features/auth/AuthProvider'

export function DraftsPage() {
  const { user, loading: authLoading } = useAuth()
  const [drafts, setDrafts] = useState<ArticleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  usePageMeta({ title: '草稿箱 | 微光手记', description: '未发布的文章草稿。', path: '/drafts' })

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setDrafts(await listDraftArticles(user.id))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { void load() }, [load])

  return (
    <section className="page-section drafts-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WORK IN PROGRESS</span>
          <h2>草稿<em>箱</em></h2>
        </div>
        <Link className="primary-button" to="/write"><Plus size={17} /> 写新文章</Link>
      </div>

      {authLoading && <LoadingState label="正在确认登录状态" />}

      {!authLoading && !user && (
        <div className="locked-panel">
          <LockKeyhole size={26} />
          <h3>草稿箱需要登录</h3>
          <p>草稿只对自己可见，登录后即可查看未发布的文章。</p>
        </div>
      )}

      {!authLoading && user && loading && <LoadingState label="正在读取草稿" />}
      {!authLoading && user && !loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!authLoading && user && !loading && !error && drafts.length === 0 && (
        <EmptyState title="草稿箱是空的" description="在编辑器里点“存为草稿”，文章就会出现在这里。" />
      )}

      {!authLoading && user && !loading && !error && drafts.length > 0 && (
        <div className="draft-list">
          {drafts.map((draft) => (
            <article className="draft-item" key={draft.id}>
              <div className="draft-item-body">
                <div className="article-meta">
                  <span><FileText size={13} /> 草稿</span>
                  <span>更新于 {formatDate(draft.updated_at)}</span>
                  <span>{draft.read_time} 分钟阅读</span>
                </div>
                <h3>{draft.title || '未命名草稿'}</h3>
                <p>{draft.summary || '还没有写摘要。'}</p>
              </div>
              <Link className="secondary-button small-button" to={`/write/${draft.slug}`}>
                <PencilLine size={16} /> 继续编辑
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
