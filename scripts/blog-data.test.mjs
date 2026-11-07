import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadPosts, parseFrontmatter } from './content.mjs'
import {
  buildSeries,
  injectArticleMeta,
  injectSeriesMeta,
  renderRss,
  renderRobots,
  renderSitemap,
  stripMarkdown,
  summaryFor,
} from './blog-data.mjs'

const origin = 'https://example.com'
const posts = [
  {
    slug: 'hello-world',
    title: '你好，世界 & <begin>',
    summary: '**摘要** 第一行\n\n第二行',
    published_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-02T08:00:00.000Z',
    cover_image: null,
  },
]

const tempDirs = []
async function makeContentDir(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'glow-content-'))
  tempDirs.push(dir)
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(dir, name), body, 'utf8')
  }
  return dir
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('stripMarkdown / summaryFor', () => {
  it('去掉常见 Markdown 标记', () => {
    expect(stripMarkdown('## 标题\n\n- **重点** 内容')).toBe('标题 重点 内容')
  })

  it('优先使用摘要，空摘要回退到正文', () => {
    expect(summaryFor({ summary: '摘要', content: '正文' })).toBe('摘要')
    expect(summaryFor({ summary: '', content: '# 正文内容' })).toBe('正文内容')
  })

  it('超长内容截断并加省略号', () => {
    const result = summaryFor({ summary: '字'.repeat(200) })
    expect(result).toHaveLength(121)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('parseFrontmatter / loadPosts', () => {
  it('解析标量、行内数组与缩进列表', () => {
    const { data, body } = parseFrontmatter([
      '---',
      'title: "带引号的标题"',
      'tags: [react, css]',
      'published_at: 2026-10-01',
      'read_time: 5',
      'attachments: [/files/附件.pdf]',
      '---',
      '',
      '# 正文',
    ].join('\n'))
    expect(data.title).toBe('带引号的标题')
    expect(data.tags).toEqual(['react', 'css'])
    expect(data.published_at).toBe('2026-10-01')
    expect(data.read_time).toBe(5)
    expect(data.attachments).toEqual(['/files/附件.pdf'])
    expect(body).toBe('# 正文')
  })

  it('按发布时间倒序，跳过下划线开头的草稿', async () => {
    const dir = await makeContentDir({
      'older.md': '---\ntitle: 旧文\npublished_at: 2026-01-01\n---\n旧正文',
      'newer.md': '---\ntitle: 新文\npublished_at: 2026-03-01\n---\n新正文',
      '_draft.md': '---\ntitle: 草稿\n---\n不应出现',
    })
    const loaded = await loadPosts({ contentDir: dir })
    expect(loaded.map((post) => post.slug)).toEqual(['newer', 'older'])
    expect(loaded[0].summary).toBe('新正文')
    expect(loaded[0].read_time).toBeGreaterThanOrEqual(1)
  })

  it('没有文章时返回空数组', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glow-empty-'))
    tempDirs.push(dir)
    expect(await loadPosts({ contentDir: dir })).toEqual([])
  })

  it('目录不存在时返回空数组', async () => {
    expect(await loadPosts({ contentDir: path.join(tmpdir(), 'glow-not-exist-dir') })).toEqual([])
  })

  it('拒绝不合法的文件名', async () => {
    const dir = await makeContentDir({ 'bad slug.md': '---\ntitle: x\n---\n正文' })
    await expect(loadPosts({ contentDir: dir })).rejects.toThrow(/文件名不合法/)
  })
})

describe('renderRobots', () => {
  it('指向 sitemap，且不再屏蔽写作路径', () => {
    const body = renderRobots(origin)
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(body).toContain('Allow: /')
    expect(body).not.toContain('/write')
  })
})

describe('renderSitemap', () => {
  it('包含静态页与文章页，并转义特殊字符', () => {
    const body = renderSitemap(posts, origin)
    expect(body).toContain('<urlset')
    expect(body).toContain('<loc>https://example.com/</loc>')
    expect(body).toContain('<loc>https://example.com/article/hello-world</loc>')
    expect(body).toContain('<lastmod>2026-10-02</lastmod>')
  })

  it('数据为空时仍输出静态页', () => {
    const body = renderSitemap([], origin)
    expect(body).toContain('<loc>https://example.com/tags</loc>')
    expect(body).not.toContain('/article/')
  })
})

describe('renderRss', () => {
  it('输出频道与条目，并转义 HTML', () => {
    const body = renderRss(posts, origin)
    expect(body).toContain('<rss version="2.0"')
    expect(body).toContain('<title>你好，世界 &amp; &lt;begin&gt;</title>')
    expect(body).toContain('<link>https://example.com/article/hello-world</link>')
    expect(body).toContain('<pubDate>Thu, 01 Oct 2026 08:00:00 GMT</pubDate>')
  })

  it('没有文章时仍输出合法频道', () => {
    const body = renderRss([], origin)
    expect(body).toContain('<channel>')
    expect(body).not.toContain('<item>')
    expect(body.trimEnd().endsWith('</rss>')).toBe(true)
  })
})

describe('injectArticleMeta', () => {
  const template = `<!doctype html><html><head>
    <meta name="description" content="旧描述" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="旧标题" />
    <meta property="og:description" content="旧描述" />
    <meta property="og:url" content="https://example.com/" />
    <meta property="og:image" content="https://example.com/old.png" />
    <meta property="og:image:alt" content="旧图" />
    <meta name="twitter:title" content="旧标题" />
    <meta name="twitter:description" content="旧描述" />
    <meta name="twitter:image" content="https://example.com/old.png" />
    <title>旧标题</title>
  </head><body></body></html>`

  it('替换标题、描述与 Open Graph', () => {
    const html = injectArticleMeta(template, posts[0], origin)
    expect(html).toContain('<title>你好，世界 &amp; &lt;begin&gt; | 微光手记</title>')
    expect(html).toContain('content="摘要 第一行 第二行"')
    expect(html).toContain('<meta property="og:type" content="article" />')
    expect(html).toContain('content="https://example.com/article/hello-world"')
    expect(html).toContain('<link rel="canonical" href="https://example.com/article/hello-world" />')
    expect(html).not.toContain('旧标题')
  })

  it('使用本地封面图作为 og:image', () => {
    const html = injectArticleMeta(template, { ...posts[0], cover_image: '/images/cover.png' }, origin)
    expect(html).toContain('content="https://example.com/images/cover.png"')
  })

  it('注入 BlogPosting 结构化数据且不产生脚本闭合风险', () => {
    const html = injectArticleMeta(template, { ...posts[0], title: '标题 </script><script>' }, origin)
    expect(html).toContain('"@type":"BlogPosting"')
    expect(html).not.toContain('</script><script>')
  })
})

describe('buildSeries', () => {
  const seriesPosts = [
    { slug: 'b', title: 'B', series: 'Build  Log', series_order: 2, published_at: '2026-02-01T00:00:00.000Z' },
    { slug: 'a', title: 'A', series: 'build log', series_order: 1, published_at: '2026-03-01T00:00:00.000Z' },
    { slug: 'c', title: 'C', series: 'Build Log', series_order: null, published_at: '2026-01-01T00:00:00.000Z' },
    { slug: 'solo', title: 'Solo', series: '单篇系列', series_order: 1, published_at: '2026-01-01T00:00:00.000Z' },
    { slug: 'plain', title: 'Plain', series: null, series_order: null, published_at: '2026-01-01T00:00:00.000Z' },
  ]

  it('合并大小写/空白差异，并按序号排序、缺序号排最后', () => {
    const [group] = buildSeries(seriesPosts)
    expect(buildSeries(seriesPosts)).toHaveLength(2)
    expect(group.name).toBe('Build Log')
    expect(group.slug).toBe('build-log')
    expect(group.items.map((item) => item.slug)).toEqual(['a', 'b', 'c'])
    expect(group.total).toBe(3)
  })

  it('单篇系列成立，未填系列不参与分组', () => {
    const groups = buildSeries(seriesPosts)
    expect(groups.find((group) => group.slug === '单篇系列')?.total).toBe(1)
    expect(groups.some((group) => group.items.some((item) => item.slug === 'plain'))).toBe(false)
  })
})

describe('renderSitemap 系列页', () => {
  it('为系列输出 /series/ 条目并带 lastmod', () => {
    const body = renderSitemap(
      [{ slug: 'a', series: 'Build Log', series_order: 1, published_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-02-03T00:00:00.000Z' }],
      origin,
    )
    expect(body).toContain('<loc>https://example.com/series/build-log</loc>')
    expect(body).toContain('<lastmod>2026-02-03</lastmod>')
  })

  it('没有系列时不产生系列条目', () => {
    expect(renderSitemap([], origin)).not.toContain('/series/')
  })
})

describe('injectSeriesMeta', () => {
  const template = `<!doctype html><html><head>
    <meta name="description" content="旧描述" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="旧标题" />
    <meta property="og:description" content="旧描述" />
    <meta property="og:url" content="https://example.com/" />
    <meta name="twitter:title" content="旧标题" />
    <meta name="twitter:description" content="旧描述" />
    <title>旧标题</title>
  </head><body></body></html>`

  it('注入系列标题、描述与 canonical', () => {
    const series = { name: 'Build Log', slug: 'build-log', total: 3 }
    const html = injectSeriesMeta(template, series, origin)
    expect(html).toContain('<title>Build Log｜系列 | 微光手记</title>')
    expect(html).toContain('content="「Build Log」系列共 3 篇，按顺序排列。"')
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('content="https://example.com/series/build-log"')
    expect(html).toContain('<link rel="canonical" href="https://example.com/series/build-log" />')
    expect(html).not.toContain('旧标题')
  })
})
