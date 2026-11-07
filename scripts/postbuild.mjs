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
// 需与 vite.config.ts 的归一化保持一致，否则 og:image 的匹配会失效
function normalizeBase(value) {
  const collapsed = (value || '/').replace(/\/{2,}/g, '/')
  const withLeading = collapsed.startsWith('/') ? collapsed : `/${collapsed}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}
const normalizedBase = normalizeBase(process.env.PUBLIC_BASE)
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

// 写作台上传到 content/images 的图片随构建一起发布（dev 下由 writer 插件直接托管）
try {
  await cp(path.join(root, 'content', 'images'), path.join(distDir, 'images'), { recursive: true })
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

// 静态托管（GitHub Pages / Netlify 等）的 SPA 回退
await cp(path.join(distDir, 'index.html'), path.join(distDir, '404.html'))

console.log(`[seo] 已生成 sitemap/rss/robots 与 ${posts.length} 个文章页（site: ${siteUrl}/）`)
if (!process.env.PUBLIC_ORIGIN) {
  console.log('[seo] 提示：部署到自有域名时用 PUBLIC_ORIGIN=https://your-domain 重新构建，绝对地址才正确')
}
