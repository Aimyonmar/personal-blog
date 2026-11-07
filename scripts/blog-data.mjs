/**
 * 博客分发数据层：基于本地 content/posts 的文章数据，生成 sitemap / RSS / robots / 文章级 meta。
 * 零依赖、不访问网络；纯函数，供 server.mjs、构建脚本与单元测试共用。
 */
import { SITE } from './content.mjs'

export { SITE }

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function escapeHtml(value) {
  return escapeXml(value)
}

/** 去掉 Markdown 标记，得到适合放进 meta/摘要的纯文本。 */
export function stripMarkdown(value) {
  return String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summaryFor(post, fallback = SITE.description, maxLength = 120) {
  const source = stripMarkdown(post?.summary) || stripMarkdown(post?.content) || fallback
  return source.length > maxLength ? `${source.slice(0, maxLength)}…` : source
}

function isoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function absoluteUrl(origin, value) {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`
}

export function renderRobots(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

/** 系列名归一：折叠连续空白并去首尾空格；空串视为未填。 */
export function normalizeSeriesName(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/** 系列页路由片段：小写、空白与标点折叠成连字符；归一后为空时退回 `series`。 */
export function seriesSlug(name) {
  const key = normalizeSeriesName(name).toLowerCase()
  const slug = key.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return slug || 'series'
}

function orderOf(post) {
  const raw = post.series_order
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

/** 系列内排序：有序号的按序号升序，缺序号的排最后；同序号/同缺失时按发布时间升序，再按 slug。 */
function compareSeriesPosts(a, b) {
  const left = orderOf(a)
  const right = orderOf(b)
  if (left !== null && right !== null && left !== right) return left - right
  if ((left === null) !== (right === null)) return left === null ? 1 : -1
  const leftTime = Date.parse(a.published_at ?? '') || 0
  const rightTime = Date.parse(b.published_at ?? '') || 0
  if (leftTime !== rightTime) {
    if (!leftTime) return 1
    if (!rightTime) return -1
    return leftTime - rightTime
  }
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
}

/** 展示名：取出现次数最多的写法；票数相同取排序最靠前的一篇，保证结果确定。 */
function displayName(items) {
  const counts = new Map()
  for (const item of items) {
    const spelling = normalizeSeriesName(item.series)
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1)
  }
  let name = normalizeSeriesName(items[0].series)
  let best = counts.get(name) ?? 0
  for (const [spelling, count] of counts) {
    if (count > best) {
      name = spelling
      best = count
    }
  }
  return name
}

/**
 * 按系列聚合并排序。系列名大小写/空白差异视为同一系列，
 * 展示名取出现次数最多的写法；slug 冲突时按系列 key 字典序追加 `-2`、`-3`。
 */
export function buildSeries(posts) {
  const groups = new Map()
  for (const post of posts) {
    const name = normalizeSeriesName(post.series)
    if (!name) continue
    const key = name.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(post)
  }

  const used = new Set()
  return [...groups.keys()].sort().map((key) => {
    const items = [...groups.get(key)].sort(compareSeriesPosts)
    const name = displayName(items)
    let slug = seriesSlug(name)
    if (used.has(slug)) {
      let index = 2
      while (used.has(`${slug}-${index}`)) index += 1
      slug = `${slug}-${index}`
    }
    used.add(slug)
    const lastmod = items
      .map((item) => isoDate(item.updated_at ?? item.published_at))
      .filter(Boolean)
      .sort((a, b) => b - a)[0] ?? null
    return { key, name, slug, items, total: items.length, lastmod }
  })
}

export function renderSitemap(posts, origin) {
  const staticUrls = ['/', '/tags', '/about']
  const staticEntries = staticUrls.map(
    (pathname) => `  <url>\n    <loc>${escapeXml(`${origin}${pathname}`)}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`,
  )
  const postEntries = posts.map((post) => {
    const lastmod = isoDate(post.updated_at ?? post.published_at)
    return [
      '  <url>',
      `    <loc>${escapeXml(`${origin}/article/${encodeURIComponent(post.slug)}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '',
      '    <changefreq>monthly</changefreq>',
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n')
  })
  const seriesEntries = buildSeries(posts).map((series) => {
    const lastmod = series.lastmod
    return [
      '  <url>',
      `    <loc>${escapeXml(`${origin}/series/${encodeURIComponent(series.slug)}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '',
      '    <changefreq>weekly</changefreq>',
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    ...postEntries,
    ...seriesEntries,
    '</urlset>',
    '',
  ].join('\n')
}

export function renderRss(posts, origin) {
  const dates = posts.map((post) => isoDate(post.published_at)).filter(Boolean)
  const latest = dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date()
  const items = posts
    .filter((post) => isoDate(post.published_at))
    .map((post) => {
      const link = `${origin}/article/${encodeURIComponent(post.slug)}`
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${isoDate(post.published_at).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(summaryFor(post))}</description>`,
        '    </item>',
      ].join('\n')
    })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(SITE.name)}</title>`,
    `    <link>${escapeXml(`${origin}/`)}</link>`,
    `    <description>${escapeXml(SITE.description)}</description>`,
    `    <language>${SITE.language}</language>`,
    `    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}

function setMeta(html, key, content) {
  const pattern = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`)
  const tag = `<meta property="${key}" content="${escapeHtml(content)}" />`
  return pattern.test(html) ? html.replace(pattern, `$1${escapeHtml(content)}$2`) : html.replace('</head>', `  ${tag}\n  </head>`)
}

/** 把文章级 title / description / Open Graph / canonical / JSON-LD 注入 SPA 的 index.html。 */
export function injectArticleMeta(template, post, origin) {
  const title = `${post.title} | ${SITE.name}`
  const description = summaryFor(post)
  const canonical = `${origin}/article/${encodeURIComponent(post.slug)}`
  const image = absoluteUrl(origin, post.cover_image) ?? `${origin}/og-default.png`
  const published = isoDate(post.published_at)
  const modified = isoDate(post.updated_at ?? post.published_at)

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)

  html = setMeta(html, 'og:type', 'article')
  html = setMeta(html, 'og:title', title)
  html = setMeta(html, 'og:description', description)
  html = setMeta(html, 'og:url', canonical)
  html = setMeta(html, 'og:image', image)
  html = setMeta(html, 'og:image:alt', post.title)
  html = setMeta(html, 'twitter:title', title)
  html = setMeta(html, 'twitter:description', description)
  html = setMeta(html, 'twitter:image', image)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    url: canonical,
    image,
    datePublished: published?.toISOString(),
    dateModified: modified?.toISOString(),
    author: { '@type': 'Person', name: SITE.author },
    publisher: { '@type': 'Organization', name: SITE.name },
    inLanguage: SITE.language,
  }

  const extra = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    published ? `<meta property="article:published_time" content="${published.toISOString()}" />` : '',
    modified ? `<meta property="article:modified_time" content="${modified.toISOString()}" />` : '',
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ')

  return html.replace('</head>', `  ${extra}\n  </head>`)
}

/** 把系列级 title / description / Open Graph / canonical 注入 SPA 的 index.html。 */
export function injectSeriesMeta(template, series, origin) {
  const title = `${series.name}｜系列 | ${SITE.name}`
  const description = `「${series.name}」系列共 ${series.total} 篇，按顺序排列。`
  const canonical = `${origin}/series/${encodeURIComponent(series.slug)}`

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`)

  html = setMeta(html, 'og:type', 'website')
  html = setMeta(html, 'og:title', title)
  html = setMeta(html, 'og:description', description)
  html = setMeta(html, 'og:url', canonical)
  html = setMeta(html, 'twitter:title', title)
  html = setMeta(html, 'twitter:description', description)

  return html.replace('</head>', `  <link rel="canonical" href="${escapeHtml(canonical)}" />\n  </head>`)
}
