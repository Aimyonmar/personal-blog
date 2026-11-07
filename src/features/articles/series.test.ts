import { describe, expect, it } from 'vitest'
import type { ArticleListItem } from '../../app/types'
import { buildSeries, findSeriesBySlug, selectSeriesMembership, seriesSlug } from './series'

function make(slug: string, extra: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    slug,
    title: `标题 ${slug}`,
    summary: '',
    published_at: '2026-01-01',
    updated_at: '2026-01-01',
    tags: [],
    read_time: 1,
    cover_image: null,
    attachments: [],
    series: null,
    series_order: null,
    ...extra,
  } as ArticleListItem
}

describe('seriesSlug', () => {
  it('折叠空白与标点，保留中英文数字', () => {
    expect(seriesSlug('把博客  搬回自己手里')).toBe('把博客-搬回自己手里')
    expect(seriesSlug('Build & Deploy')).toBe('build-deploy')
    expect(seriesSlug('  ---  ')).toBe('series')
  })
})

describe('buildSeries', () => {
  it('大小写与空白差异合并为同一系列，展示名取出现次数最多的写法', () => {
    const items = [
      make('b', { series: 'Build  Log', series_order: 2 }),
      make('a', { series: 'build log', series_order: 1 }),
      make('c', { series: 'Build Log', series_order: 3 }),
    ]
    const groups = buildSeries(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].total).toBe(3)
    expect(groups[0].name).toBe('Build Log')
    expect(groups[0].items.map((item) => item.slug)).toEqual(['a', 'b', 'c'])
  })

  it('展示名票数相同时取排序最靠前的一篇', () => {
    const items = [
      make('b', { series: 'Build Log', series_order: 2 }),
      make('a', { series: 'build log', series_order: 1 }),
    ]
    expect(buildSeries(items)[0].name).toBe('build log')
  })

  it('序号重复时按发布时间升序，再按 slug', () => {
    const items = [
      make('c', { series: 'S', series_order: 1, published_at: '2026-02-01' }),
      make('a', { series: 'S', series_order: 1, published_at: '2026-01-01' }),
      make('b', { series: 'S', series_order: 1, published_at: '2026-01-01' }),
    ]
    expect(buildSeries(items)[0].items.map((item) => item.slug)).toEqual(['a', 'b', 'c'])
  })

  it('缺序号的排在有序号的篇目之后', () => {
    const items = [
      make('no-order', { series: 'S' }),
      make('second', { series: 'S', series_order: 2 }),
      make('first', { series: 'S', series_order: 1 }),
    ]
    expect(buildSeries(items)[0].items.map((item) => item.slug)).toEqual(['first', 'second', 'no-order'])
  })

  it('单篇系列也能成立', () => {
    const groups = buildSeries([make('only', { series: 'S' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].total).toBe(1)
  })

  it('未填 series 的文章不参与分组', () => {
    expect(buildSeries([make('a'), make('b', { series: '   ' })])).toEqual([])
  })

  it('slug 冲突时按系列 key 字典序追加后缀', () => {
    const items = [
      make('a', { series: 'Build/Log' }),
      make('b', { series: 'Build-Log' }),
    ]
    const groups = buildSeries(items)
    expect(groups.map((group) => group.slug)).toEqual(['build-log', 'build-log-2'])
  })
})

describe('selectSeriesMembership', () => {
  it('返回序号、上一篇与下一篇（按序号而非时间）', () => {
    const items = [
      make('late', { series: 'S', series_order: 3, published_at: '2026-01-01' }),
      make('early', { series: 'S', series_order: 1, published_at: '2026-09-01' }),
      make('middle', { series: 'S', series_order: 2, published_at: '2026-05-01' }),
    ]
    const membership = selectSeriesMembership(items, 'middle')
    expect(membership?.position).toBe(2)
    expect(membership?.previous?.slug).toBe('early')
    expect(membership?.next?.slug).toBe('late')
  })

  it('单篇系列没有上一篇/下一篇', () => {
    const membership = selectSeriesMembership([make('only', { series: 'S' })], 'only')
    expect(membership).toMatchObject({ position: 1, previous: null, next: null })
  })

  it('不属于任何系列时返回 null', () => {
    expect(selectSeriesMembership([make('plain')], 'plain')).toBeNull()
    expect(selectSeriesMembership([make('plain')], 'missing')).toBeNull()
  })
})

describe('findSeriesBySlug', () => {
  it('按 slug 找到系列，大小写不敏感', () => {
    const items = [make('a', { series: 'Build Log', series_order: 1 })]
    expect(findSeriesBySlug(items, 'Build-Log')?.name).toBe('Build Log')
    expect(findSeriesBySlug(items, 'build-log')?.total).toBe(1)
  })

  it('空 slug 或不存在的系列返回 null', () => {
    expect(findSeriesBySlug([make('a', { series: 'S' })], '')).toBeNull()
    expect(findSeriesBySlug([make('a', { series: 'S' })], 'nope')).toBeNull()
  })
})
