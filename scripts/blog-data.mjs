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

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    ...postEntries,
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
