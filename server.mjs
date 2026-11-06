import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createPostStore, injectArticleMeta, renderRobots, renderRss, renderSitemap } from './scripts/blog-data.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(here, 'dist')
const port = Number(process.env.PORT || 3000)
const host = '0.0.0.0'

const CLOUD_ENDPOINT = process.env.WB_CLOUD_ENDPOINT || 'https://personal-blog.app.workbuddy.host'
const PUBLISHABLE_KEY =
  process.env.WB_PUBLISHABLE_KEY ||
  'REDACTED'
const postStore = createPostStore({ endpoint: CLOUD_ENDPOINT, publishableKey: PUBLISHABLE_KEY })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

// 构建产物带内容哈希（如 index-BsllTFf0.js），可安全长缓存
const IMMUTABLE_FILE = /-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/
const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest'])
const MIN_GZIP_BYTES = 1024

const gzipCache = new Map()

function etagFor(size, mtimeMs, encoding) {
  const hash = createHash('sha1').update(`${size}:${Math.floor(mtimeMs)}:${encoding ?? 'raw'}`).digest('hex').slice(0, 20)
  return `W/"${hash}"`
}

async function negotiateBody(filePath, ext, stat, acceptEncoding) {
  const acceptsGzip = /\bgzip\b/.test(acceptEncoding)
  if (acceptsGzip && COMPRESSIBLE_EXT.has(ext) && stat.size >= MIN_GZIP_BYTES) {
    const cacheKey = `${filePath}@${stat.size}@${Math.floor(stat.mtimeMs)}`
    let body = gzipCache.get(cacheKey)
    if (!body) {
      body = gzipSync(await fs.readFile(filePath), { level: 6 })
      if (gzipCache.size >= 64) gzipCache.delete(gzipCache.keys().next().value)
      gzipCache.set(cacheKey, body)
    }
    return { body, encoding: 'gzip' }
  }
  return { body: await fs.readFile(filePath), encoding: null }
}

function cacheControlFor(fileName) {
  if (fileName === 'index.html') return 'no-cache'
  if (IMMUTABLE_FILE.test(fileName)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

async function statFile(filePath) {
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) return null
    return stat
  } catch {
    return null
  }
}

function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, '')
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim()
  const hostHeader = forwardedHost || String(req.headers.host || `localhost:${port}`)
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(hostHeader)
  const proto = forwardedProto || (isLocal ? 'http' : 'https')
  return `${proto}://${hostHeader}`
}

const HTML_MIME = 'text/html; charset=utf-8'

/** 动态内容响应：按需 gzip + ETag/304 + 不做长缓存。 */
function sendBuffer(req, res, body, { contentType, cacheControl = 'no-cache' }) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body)
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  const payload = acceptsGzip && raw.length >= MIN_GZIP_BYTES ? gzipSync(raw, { level: 6 }) : raw
  const etag = `W/"${createHash('sha1').update(raw).digest('hex').slice(0, 20)}"`

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    ETag: etag,
    Vary: 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
  }

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }

  if (payload !== raw) headers['Content-Encoding'] = 'gzip'
  headers['Content-Length'] = String(payload.length)
  res.writeHead(200, headers)
  if (req.method === 'HEAD') res.end()
  else res.end(payload)
}

let indexCache = { mtimeMs: 0, html: '' }

async function readIndexHtml() {
  const filePath = path.join(distDir, 'index.html')
  const stat = await fs.stat(filePath)
  if (!indexCache.html || stat.mtimeMs !== indexCache.mtimeMs) {
    indexCache = { mtimeMs: stat.mtimeMs, html: await fs.readFile(filePath, 'utf8') }
  }
  return indexCache.html
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'

    const origin = originFor(req)

    if (pathname === '/robots.txt') {
      sendBuffer(req, res, renderRobots(origin), {
        contentType: 'text/plain; charset=utf-8',
        cacheControl: 'public, max-age=3600',
      })
      return
    }

    if (pathname === '/sitemap.xml' || pathname === '/rss.xml') {
      const posts = await postStore.getPosts()
      const body = pathname === '/sitemap.xml' ? renderSitemap(posts, origin) : renderRss(posts, origin)
      sendBuffer(req, res, body, {
        contentType: 'application/xml; charset=utf-8',
        cacheControl: 'public, max-age=300',
      })
      return
    }

    let filePath = path.resolve(distDir, `.${pathname}`)
    const relPath = path.relative(distDir, filePath)
    if (
      relPath.startsWith('..') ||
      path.isAbsolute(relPath) ||
      relPath.split(/[\\/]/).some((segment) => segment.startsWith('.'))
    ) {
      // 拒绝路径穿越与点文件/点目录（如 /../package.json、/.git/config、/.build-stamp）
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    let stat = await statFile(filePath)
    if (!stat) {
      // SPA 回退：无扩展名的路径交给前端路由；带扩展名的按 404 处理
      if (path.extname(pathname)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }

      const html = await readIndexHtml()
      const match = /^\/article\/([^/]+)$/.exec(pathname)
      const post = match ? await postStore.findBySlug(match[1]) : null
      sendBuffer(req, res, post ? injectArticleMeta(html, post, origin) : html, {
        contentType: HTML_MIME,
        cacheControl: 'no-cache',
      })
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const fileName = path.basename(filePath)
    const { body, encoding } = await negotiateBody(filePath, ext, stat, req.headers['accept-encoding'] ?? '')
    const etag = etagFor(stat.size, stat.mtimeMs, encoding)

    const headers = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': cacheControlFor(fileName),
      'Content-Encoding': encoding ?? 'identity',
      ETag: etag,
      Vary: 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff',
    }

    if (req.headers['if-none-match'] === etag) {
      delete headers['Content-Encoding']
      res.writeHead(304, headers)
      res.end()
      return
    }

    headers['Content-Length'] = String(body.length)
    res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(body)
    }
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Internal Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`[server] 微光手记已启动：http://${host}:${port}`)
})
