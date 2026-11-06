import { useEffect, useState } from 'react'

interface TocItem {
  id: string
  text: string
  level: number
}

/**
 * 文章目录：直接从渲染后的正文里取带 id 的标题，
 * 保证锚点与 rehype-slug 生成的真实 id 一致。
 */
export function ArticleToc({ content }: { content: string }) {
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const root = document.getElementById('article-content')
    if (!root) return
    const headings = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]'))
    const next = headings.map((heading) => ({
      id: heading.id,
      text: (heading.textContent ?? '').replace(/#$/, '').trim(),
      level: Number(heading.tagName.slice(1)),
    }))
    setItems(next)
    if (next.length === 0) return

    let frame = 0
    const update = () => {
      frame = 0
      let current = next[0].id
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 132) current = heading.id
        else break
      }
      setActiveId(current)
    }
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [content])

  if (items.length === 0) return null

  return (
    <nav className="article-toc" aria-label="文章目录">
      <span className="article-toc-kicker">ON THIS PAGE</span>
      <ol>
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'toc-sub' : undefined}>
            <a
              href={`#${item.id}`}
              className={item.id === activeId ? 'active' : undefined}
              aria-current={item.id === activeId ? 'location' : undefined}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
