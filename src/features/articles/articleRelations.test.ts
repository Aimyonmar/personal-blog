import { describe, expect, it } from 'vitest'
import type { ArticleListItem } from '../../app/types'
import { byPublishedAtAsc, selectAdjacent, selectRelated } from './articleRelations'

function post(slug: string, publishedAt: string | null, tags: string[] = []): ArticleListItem {
  return {
    slug,
    file: `content/posts/${slug}.md`,
    title: slug,
    summary: '',
    tags,
    published_at: publishedAt,
    updated_at: publishedAt,
    cover_image: null,
    attachments: [],
    read_time: 1,
  }
}

const postA = post('a', '2026-01-01T00:00:00.000Z', ['react', 'css'])
const postB = post('b', '2026-02-01T00:00:00.000Z', ['react'])
const postC = post('c', '2026-03-01T00:00:00.000Z', ['writing'])
const postD = post('d', '2026-04-01T00:00:00.000Z', ['react', 'css'])

describe('byPublishedAtAsc', () => {
  it('按发布时间升序排列且不修改原数组', () => {
    const input = [postC, postA, postB]
    expect(byPublishedAtAsc(input).map((item) => item.slug)).toEqual(['a', 'b', 'c'])
    expect(input.map((item) => item.slug)).toEqual(['c', 'a', 'b'])
  })
})

describe('selectAdjacent', () => {
  it('返回更早的上一篇与更新的下一篇', () => {
    const { previous, next } = selectAdjacent([postD, postC, postA, postB], 'b')
    expect(previous?.slug).toBe('a')
    expect(next?.slug).toBe('c')
  })

  it('首篇没有上一篇，末篇没有下一篇', () => {
    expect(selectAdjacent([postA, postB, postC], 'a').previous).toBeNull()
    expect(selectAdjacent([postA, postB, postC], 'c').next).toBeNull()
  })

  it('不在列表中时两边都为空', () => {
    expect(selectAdjacent([postA, postB], 'missing')).toEqual({ previous: null, next: null })
  })
})

describe('selectRelated', () => {
  it('共同标签越多越靠前，同分取较新', () => {
    const related = selectRelated([postA, postB, postC, postD], { slug: 'b', tags: ['react', 'css'] })
    expect(related.map((item) => item.slug)).toEqual(['d', 'a', 'c'])
  })

  it('排除当前文章并遵守条数上限', () => {
    const related = selectRelated([postA, postB, postC, postD], { slug: 'a', tags: ['react'] }, 2)
    expect(related.map((item) => item.slug)).toEqual(['d', 'b'])
    expect(related.some((item) => item.slug === 'a')).toBe(false)
  })

  it('没有共同标签时仍返回其它文章', () => {
    const related = selectRelated([postA, postB, postC], { slug: 'c', tags: ['nope'] })
    expect(related.map((item) => item.slug)).toEqual(['b', 'a'])
  })
})
