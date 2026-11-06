import { describe, expect, it, vi } from 'vitest'
import {
  createPostStore,
  injectArticleMeta,
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
  },
]

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

describe('renderRobots', () => {
  it('指向 sitemap 并屏蔽写作页', () => {
    const body = renderRobots(origin)
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(body).toContain('Disallow: /write')
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

  it('注入 BlogPosting 结构化数据且不产生脚本闭合风险', () => {
    const html = injectArticleMeta(template, { ...posts[0], title: '标题 </script><script>' }, origin)
    expect(html).toContain('"@type":"BlogPosting"')
    expect(html).not.toContain('</script><script>')
  })
})

describe('createPostStore', () => {
  it('在 TTL 内复用缓存，只请求一次', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      return { ok: true, json: async () => posts }
    })
    const store = createPostStore({ endpoint: 'https://example.com', publishableKey: 'k', ttlMs: 60_000, fetchImpl })
    await store.getPosts()
    await store.getPosts()
    expect(calls).toBe(1)
  })

  it('拉取失败时回退到上一次成功的数据', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      if (calls === 1) return { ok: true, json: async () => posts }
      throw new Error('network down')
    })
    const store = createPostStore({ endpoint: 'https://example.com', publishableKey: 'k', ttlMs: 0, fetchImpl })
    await store.getPosts()
    const result = await store.findBySlug('hello-world')
    expect(result?.title).toBe(posts[0].title)
  })
})
