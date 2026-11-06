import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../app/usePageMeta'

export function NotFoundPage() {
  usePageMeta({
    title: '页面不存在',
    description: '这个地址没有对应的内容，返回首页继续浏览。',
    path: '/404',
  })

  return (
    <section className="not-found-page">
      <span>404</span>
      <h1>这一页还没有被写下。</h1>
      <p>链接可能已经变化，或者内容仍在准备中。</p>
      <Link className="primary-button" to="/"><ArrowLeft size={17} /> 返回首页</Link>
    </section>
  )
}
