import { ArrowUpRight, BookOpen, Braces, Coffee, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../app/usePageMeta'

const principles = [
  { icon: Braces, title: '保持工程感', text: '不只展示结论，也记录约束、权衡和验证过程。' },
  { icon: Compass, title: '保持方向感', text: '技术最终服务于真实的人、问题与长期目标。' },
  { icon: Coffee, title: '保持生活感', text: '允许停顿、绕路和那些看似没有产出的时刻。' },
]

export function AboutPage() {
  usePageMeta({
    title: '关于这个博客',
    description: '微光手记的由来：一个关于技术实践、产品思考和普通生活的个人博客。',
    path: '/about',
  })

  return (
    <section className="about-page">
      <div className="about-hero">
        <div>
          <span className="eyebrow"><BookOpen size={14} /> ABOUT THIS BLOG</span>
          <h1>你好，这里是<br />微光手记。</h1>
        </div>
        <div className="about-intro">
          <p className="lead">一个关于技术实践、产品思考和普通生活的个人博客。</p>
          <p>我相信高质量的记录能够延长经验的有效期。把模糊的问题写清楚，把做过的决策留下来，也把那些让人重新获得能量的瞬间保存下来。</p>
          <p>这里没有追逐热点的流水线，更像一间持续整理中的工作室：有代码、有草图、有读书笔记，也有一些仍在生长的想法。</p>
        </div>
      </div>

      <div className="principle-grid">
        {principles.map(({ icon: Icon, title, text }, index) => (
          <article key={title} className="principle-item">
            <span className="principle-number">0{index + 1}</span>
            <Icon size={24} />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <div className="about-cta">
        <div>
          <span className="eyebrow">START READING</span>
          <h2>从一篇文章开始。</h2>
        </div>
        <Link className="primary-button" to="/">查看最近更新 <ArrowUpRight size={17} /></Link>
      </div>
    </section>
  )
}
