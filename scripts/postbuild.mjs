/**
 * 构建后生成静态分发文件：sitemap.xml / rss.xml / robots.txt / 文章级 index.html / 404.html。
 * 全部来自本地 Markdown；不访问网络。PUBLIC_ORIGIN 用于生成绝对地址，
 * 不设置时使用占位域名，部署到自有域名时请显式传入。
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPosts } from './content.mjs'
import { injectArticleMeta, renderRobots, renderRss, renderSitemap } from './blog-data.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const origin = (process.env.PUBLIC_ORIGIN || 'https://example.com').replace(/\/$/, '')
const base = process.env.PUBLIC_BASE || '/'
const normalizedBase = base.endsWith('/') ? base : `${base}/`
// PUBLIC_ORIGIN 是站点的完整根地址（部署在子路径时应包含该子路径）
const siteUrl = origin

const posts = await loadPosts()
const template = (await readFile(path.join(distDir, 'index.html'), 'utf8'))
  .replace('content="/"', `content="${siteUrl}/"`)
  .replaceAll(`content="${normalizedBase}og-default.png"`, `content="${siteUrl}/og-default.png"`)
  .replaceAll('content="%BASE_URL%og-default.png"', `content="${siteUrl}/og-default.png"`)

await writeFile(path.join(distDir, 'index.html'), template, 'utf8')
await writeFile(path.join(distDir, 'sitemap.xml'), renderSitemap(posts, siteUrl), 'utf8')
await writeFile(path.join(distDir, 'rss.xml'), renderRss(posts, siteUrl), 'utf8')
await writeFile(path.join(distDir, 'robots.txt'), renderRobots(siteUrl), 'utf8')

for (const post of posts) {
  const dir = path.join(distDir, 'article', post.slug)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'index.html'), injectArticleMeta(template, post, siteUrl), 'utf8')
}

// 静态托管（GitHub Pages / Netlify 等）的 SPA 回退
await cp(path.join(distDir, 'index.html'), path.join(distDir, '404.html'))

console.log(`[seo] 已生成 sitemap/rss/robots 与 ${posts.length} 个文章页（site: ${siteUrl}/）`)
if (!process.env.PUBLIC_ORIGIN) {
  console.log('[seo] 提示：部署到自有域名时用 PUBLIC_ORIGIN=https://your-domain 重新构建，绝对地址才正确')
}
