import { describe, expect, it } from 'vitest'
import { searchArticles, toPlainText, type SearchDoc } from './searchIndex'

function doc(partial: Partial<SearchDoc> & { slug: string }): SearchDoc {
  return {
    title: '',
    summary: '',
    tags: [],
    content: '',
    published_at: '2026-01-01T00:00:00.000Z',
    read_time: 1,
    ...partial,
  }
}

const docs: SearchDoc[] = [
  doc({ slug: 'react-rerender', title: 'React 重渲染排查', tags: ['react', '性能'], summary: '从一次卡顿开始。', content: '使用 useMemo 减少重复计算，配合 Profiler 定位。', published_at: '2026-03-01T00:00:00.000Z' }),
  doc({ slug: 'css-grid', title: 'CSS 网格布局笔记', tags: ['css'], summary: 'grid 与 flex 的取舍。', content: 'grid-template-columns 的常见写法。' }),
  doc({ slug: 'writing', title: '把复杂的事写清楚', tags: ['写作'], summary: '技术写作的三个习惯。', content: '先给结论，再补背景，最后给例子。' }),
]

describe('toPlainText', () => {
  it('去掉 Markdown 标记并压缩空白', () => {
    expect(toPlainText('## 标题\n\n- **重点** [链接](https://a.b)\n\n```js\nconst a = 1\n```')).toBe(
      '标题 重点 链接 const a = 1',
    )
  })
})

describe('searchArticles', () => {
  it('空查询返回空数组', () => {
    expect(searchArticles(docs, '   ')).toEqual([])
  })

  it('标题命中优先于正文命中', () => {
    const results = searchArticles(docs, 'react')
    expect(results[0].slug).toBe('react-rerender')
  })

  it('标签、摘要与正文都能搜到', () => {
    expect(searchArticles(docs, '性能')[0].slug).toBe('react-rerender')
    expect(searchArticles(docs, '卡顿')[0].slug).toBe('react-rerender')
    expect(searchArticles(docs, 'Profiler')[0].slug).toBe('react-rerender')
  })

  it('多个关键词需同时命中', () => {
    expect(searchArticles(docs, 'grid flex')[0].slug).toBe('css-grid')
    expect(searchArticles(docs, 'grid react')).toEqual([])
  })

  it('正文命中时返回包含关键词的摘录', () => {
    const [result] = searchArticles(docs, 'Profiler')
    expect(result.snippet).toContain('Profiler')
  })

  it('遵守条数上限', () => {
    expect(searchArticles(docs, '的', 2)).toHaveLength(2)
  })
})
