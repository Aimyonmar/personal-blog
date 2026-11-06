import { ArrowDown, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../app/usePageMeta'
import { ArticleCard } from '../components/ArticleCard'
import { EmptyState } from '../components/States'
import { listPublishedArticles } from '../features/articles/localContent'

export function HomePage() {
  const articles = listPublishedArticles()

  usePageMeta({
    title: '微光手记 | 技术与生活随笔',
    description: '记录技术实践、产品思考与日常灵感的个人博客。把复杂的事，写得清楚一点。',
    path: '/',
  })

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

        {articles.length === 0 ? (
          <EmptyState
            title="还没有文章"
            description="在 content/posts/ 下新建一个 Markdown 文件，保存后页面会自动刷新。格式说明见 content/README.md。"
          />
        ) : (
          <div className="article-list">
            {articles.map((article, index) => (
              <ArticleCard key={article.slug} article={article} index={index} featured={index === 0} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
