import { describe, expect, it } from 'vitest'
import { buildSlug, estimateReadTime, sortArticlesByPublishedAtDesc } from './articleMetrics'

describe('estimateReadTime', () => {
  it('空内容按最短 1 分钟计算', () => {
    expect(estimateReadTime('')).toBe(1)
  })

  it('350 个中文字符为 1 分钟，超过后进位', () => {
    expect(estimateReadTime('字'.repeat(350))).toBe(1)
    expect(estimateReadTime('字'.repeat(351))).toBe(2)
  })

  it('220 个英文单词为 1 分钟，超过后进位', () => {
    expect(estimateReadTime(Array.from({ length: 220 }, () => 'word').join(' '))).toBe(1)
    expect(estimateReadTime(Array.from({ length: 221 }, () => 'word').join(' '))).toBe(2)
  })

  it('中英文混排按各自速率累加', () => {
    const markdown = `${'字'.repeat(175)} ${Array.from({ length: 110 }, () => 'word').join(' ')}`
    expect(estimateReadTime(markdown)).toBe(1)
  })

  it('Markdown 标记不计入正文字数', () => {
    expect(estimateReadTime('## 标题\n\n- 列表\n\n**加粗**')).toBe(1)
  })
})

describe('buildSlug', () => {
  it('保留中英文、数字，空格转连字符', () => {
    expect(buildSlug('  你好 World 2026  ', 1000)).toBe('你好-world-2026-rs')
  })

  it('去除标点并压缩连续连字符', () => {
    expect(buildSlug('Hello!!! --- World', 1000)).toBe('hello-world-rs')
  })

  it('标题为空时回退为 article', () => {
    expect(buildSlug('！！！', 1000)).toBe('article-rs')
  })

  it('相同标题不同时间戳可生成不同 slug', () => {
    expect(buildSlug('同名文章', 1000)).not.toBe(buildSlug('同名文章', 2000))
  })
})

describe('sortArticlesByPublishedAtDesc', () => {
  const items = [
    { slug: 'old', published_at: '2026-09-01T00:00:00.000Z' },
    { slug: 'draft', published_at: null },
    { slug: 'new', published_at: '2026-10-01T00:00:00.000Z' },
    { slug: 'middle', published_at: '2026-09-15T00:00:00.000Z' },
  ]

  it('按发布时间倒序，缺失时间排在最后', () => {
    expect(sortArticlesByPublishedAtDesc(items).map((item) => item.slug)).toEqual([
      'new',
      'middle',
      'old',
      'draft',
    ])
  })

  it('不修改原数组', () => {
    const snapshot = items.map((item) => item.slug)
    sortArticlesByPublishedAtDesc(items)
    expect(items.map((item) => item.slug)).toEqual(snapshot)
  })

  it('相同时间保持原有顺序', () => {
    const same = [
      { slug: 'a', published_at: '2026-10-01T00:00:00.000Z' },
      { slug: 'b', published_at: '2026-10-01T00:00:00.000Z' },
    ]
    expect(sortArticlesByPublishedAtDesc(same).map((item) => item.slug)).toEqual(['a', 'b'])
  })
})
