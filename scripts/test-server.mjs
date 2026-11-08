/**
 * server.mjs 行为回归测试（零依赖，只用 Node 内置模块）
 *
 * 用途：每次改动 server.mjs 或升级依赖后跑一遍，确认压缩 / 缓存 / 回退 / 安全边界没被弄坏。
 * 运行：npm run test:server      （需先 npm run build 产出 dist/）
 *
 * 退出码：0 = 全部通过；1 = 有断言失败（失败项会逐条打印）
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const distDir = path.join(root, 'dist')
const PORT = Number(process.env.TEST_PORT || 4199)

let pass = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  \u2713 ${name}`)
  } else {
    failures.push(`${name}${detail ? `  [${detail}]` : ''}`)
    console.log(`  \u2717 ${name}${detail ? `  [${detail}]` : ''}`)
  }
}

/** 原始 HTTP 请求：path 原样发送，便于构造穿越路径 */
function raw(pathname, { headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method, headers }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      )
    })
    req.on('error', reject)
    req.end()
  })
}

/** 响应正文按 Content-Encoding 解压后转成字符串 */
function text(res) {
  const body = res.headers['content-encoding'] === 'gzip' ? gunzipSync(res.body) : res.body
  return body.toString('utf8')
}

async function waitForReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await raw('/')
      if (res.status === 200) return true
    } catch {
      /* 还没起来，继续等 */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function main() {
  try {
    await fs.access(path.join(distDir, 'index.html'))
  } catch {
    console.error('dist/index.html 不存在，请先执行：npm run build')
    process.exit(1)
  }

  // 从构建产物里取出真实的入口文件名，避免硬编码哈希
  const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
  const entryJs = /\/(assets\/[^"']+\.js)/.exec(indexHtml)?.[1]
  const entryCss = /\/(assets\/[^"']+\.css)/.exec(indexHtml)?.[1]

  const server = spawn(process.execPath, [path.join(root, 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })

  const stop = () => {
    if (!server.killed) server.kill()
  }
  process.on('exit', stop)

  const ready = await waitForReady()
  if (!ready) {
    console.error(`server.mjs 在 ${PORT} 端口未就绪`)
    stop()
    process.exit(1)
  }

  const gz = { 'Accept-Encoding': 'gzip' }
  const identity = { 'Accept-Encoding': 'identity' }

  console.log('\n[1] 正常路由应全部 200')
  for (const route of ['/', '/tags', '/about', '/article/any-slug', '/unknown-nested/route']) {
    const res = await raw(route, { headers: gz })
    check(`${route} -> 200`, res.status === 200, `实际 ${res.status}`)
  }

  console.log('\n[2] 静态资源应 200 且带强缓存')
  if (!entryJs || !entryCss) {
    check('能从 dist/index.html 解析出入口资源', false, '未匹配到 assets/*.js 或 *.css')
  } else {
    for (const asset of [entryJs, entryCss]) {
      const res = await raw(`/${asset}`, { headers: gz })
      check(`/${asset.slice(0, 40)}… -> 200`, res.status === 200, `实际 ${res.status}`)
      check(
        `/${asset.split('/').pop()} 带 immutable`,
        /max-age=31536000/.test(res.headers['cache-control'] ?? '') &&
          /immutable/.test(res.headers['cache-control'] ?? ''),
        res.headers['cache-control'],
      )
    }
  }

  console.log('\n[3] 安全边界应全部 404（点文件 / 点目录 / 路径穿越 / 后端文件）')
  const forbidden = [
    '/.git/config',
    '/.git',
    '/.env',
    '/.ssh/id_rsa',
    '/.build-stamp',
    '/assets/.hidden.js',
    '/../package.json',
    '/assets/../../package.json',
    '/assets/no-such-file.js',
    '/no-such-file.json',
    '/server.mjs',
    '/package.json',
    '/src/main.tsx',
    '/vite.config.ts',
    '/scripts/start.mjs',
  ]
  for (const route of forbidden) {
    const res = await raw(route, { headers: gz })
    check(`${route} -> 404`, res.status === 404, `实际 ${res.status}`)
  }

  console.log('\n[4] 点目录不得回退成 index.html（历史缺陷回归）')
  const dotDirRes = await raw('/.git/config', { headers: gz })
  const homeRes = await raw('/', { headers: gz })
  check(
    '/.git/config 未返回首页内容',
    dotDirRes.status === 404,
    `状态 ${dotDirRes.status}，长度 ${dotDirRes.body.length}`,
  )
  check(
    '首页本身仍正常',
    homeRes.status === 200 && homeRes.body.length > 0,
    `状态 ${homeRes.status}`,
  )

  console.log('\n[5] gzip 协商')
  const withGzip = await raw('/', { headers: gz })
  const withoutGzip = await raw('/', { headers: identity })
  check(
    '带 gzip 时 Content-Encoding: gzip',
    withGzip.headers['content-encoding'] === 'gzip',
    withGzip.headers['content-encoding'],
  )
  check(
    'gzip 传输体积小于原始',
    withGzip.body.length < withoutGzip.body.length,
    `${withGzip.body.length} vs ${withoutGzip.body.length}`,
  )
  check('响应带 Vary: Accept-Encoding', /accept-encoding/i.test(withGzip.headers.vary ?? ''))
  if (entryJs) {
    const jsGz = await raw(`/${entryJs}`, { headers: gz })
    check('JS 资源被压缩', jsGz.headers['content-encoding'] === 'gzip', jsGz.headers['content-encoding'])
  }

  console.log('\n[6] index.html 不得被长缓存（保证发新版即时生效）')
  check(
    'index.html 为 no-cache',
    (homeRes.headers['cache-control'] ?? '') === 'no-cache',
    homeRes.headers['cache-control'],
  )

  console.log('\n[7] ETag / 304 协商缓存')
  if (entryJs) {
    const first = await raw(`/${entryJs}`, { headers: gz })
    const etag = first.headers.etag
    check('资源返回 ETag', Boolean(etag), String(etag))
    if (etag) {
      const second = await raw(`/${entryJs}`, { headers: { ...gz, 'If-None-Match': etag } })
      check('带 If-None-Match 复验返回 304', second.status === 304, `实际 ${second.status}`)
      check('304 响应无正文', second.body.length === 0, `长度 ${second.body.length}`)
    }
  }

  console.log('\n[8] 请求方法约束')
  const headRes = await raw('/', { method: 'HEAD', headers: gz })
  check('HEAD / -> 200', headRes.status === 200, `实际 ${headRes.status}`)
  const postRes = await raw('/', { method: 'POST' })
  check('POST / -> 405', postRes.status === 405, `实际 ${postRes.status}`)
  check('405 带 Allow 头', /GET/.test(postRes.headers.allow ?? ''), postRes.headers.allow)

  console.log('\n[9] SEO 与分发（sitemap / RSS / robots / 文章级 meta）')
  const origin = `http://127.0.0.1:${PORT}`

  const robots = await raw('/robots.txt', { headers: gz })
  const robotsBody = text(robots)
  check('/robots.txt -> 200', robots.status === 200, `实际 ${robots.status}`)
  check('robots Content-Type 为 text/plain', /text\/plain/.test(robots.headers['content-type'] ?? ''), robots.headers['content-type'])
  check('robots 指向 sitemap', robotsBody.includes(`Sitemap: ${origin}/sitemap.xml`))
  check('robots 不再屏蔽写作路径', !robotsBody.includes('/write') && !robotsBody.includes('/drafts'))

  const sitemap = await raw('/sitemap.xml', { headers: gz })
  const sitemapBody = text(sitemap)
  check('/sitemap.xml -> 200', sitemap.status === 200, `实际 ${sitemap.status}`)
  check('sitemap 为 application/xml', /application\/xml/.test(sitemap.headers['content-type'] ?? ''), sitemap.headers['content-type'])
  check('sitemap 含静态首页与标签页', sitemapBody.includes(`<loc>${origin}/</loc>`) && sitemapBody.includes(`${origin}/tags`))
  check('零文章时 sitemap 仍是合法 XML', sitemapBody.startsWith('<?xml') && sitemapBody.trimEnd().endsWith('</urlset>'))
  check('sitemap 可走 ETag 协商', /W\/"/.test(sitemap.headers.etag ?? ''), sitemap.headers.etag)
  const sitemapCached = await raw('/sitemap.xml', { headers: { ...gz, 'If-None-Match': sitemap.headers.etag } })
  check('sitemap 复验返回 304', sitemapCached.status === 304, `实际 ${sitemapCached.status}`)

  const rss = await raw('/rss.xml', { headers: gz })
  const rssBody = text(rss)
  check('/rss.xml -> 200', rss.status === 200, `实际 ${rss.status}`)
  check('rss 含 channel 与 self 链接', rssBody.includes('<channel>') && rssBody.includes(`${origin}/rss.xml`))
  check('零文章时 rss 仍是合法 XML', rssBody.startsWith('<?xml') && rssBody.trimEnd().endsWith('</rss>'))
  const rssRaw = rss.headers['content-encoding'] === 'gzip' ? gunzipSync(rss.body) : rss.body
  check(
    'rss 达到阈值时被 gzip（小内容可保持原文）',
    rss.headers['content-encoding'] === 'gzip' || rssRaw.length < 1024,
    `${rss.headers['content-encoding'] ?? 'identity'} / ${rssRaw.length}B`,
  )

  const ogImage = await raw('/og-default.png')
  check('/og-default.png -> 200', ogImage.status === 200, `实际 ${ogImage.status}`)
  check('og 图为 image/png', /image\/png/.test(ogImage.headers['content-type'] ?? ''), ogImage.headers['content-type'])

  const articleSlugs = [...sitemapBody.matchAll(/<loc>[^<]*\/article\/([^<]+)<\/loc>/g)].map((match) => match[1])
  if (articleSlugs.length > 0) {
    const article = await raw(`/article/${articleSlugs[0]}`, { headers: gz })
    const html = text(article)
    check('文章页 -> 200', article.status === 200, `实际 ${article.status}`)
    check('文章页 title 为文章级', /<title>(?!微光手记 \| 技术与生活随笔)[^<]+<\/title>/.test(html))
    check('文章页含文章级 og:title', /property="og:title" content="[^"]+"/.test(html))
    check('文章页含 og:image', /property="og:image" content="[^"]*og-default\.png"/.test(html))
    check('文章页含 canonical', /rel="canonical"/.test(html))
    check('文章页含 BlogPosting 结构化数据', /"@type":"BlogPosting"/.test(html))
  } else {
    check('零文章时 sitemap 不含文章地址', articleSlugs.length === 0)
    check('/', true, '当前没有文章，文章级 meta 的注入逻辑由 scripts/blog-data.test.mjs 覆盖')
  }

  const unknownArticle = await raw('/article/__not_exists__', { headers: gz })
  check(
    '未知文章回退到站点级标题',
    text(unknownArticle).includes('<title>微光手记 | 技术与生活随笔</title>'),
  )

  const headSitemap = await raw('/sitemap.xml', { method: 'HEAD', headers: gz })
  check('HEAD /sitemap.xml -> 200', headSitemap.status === 200, `实际 ${headSitemap.status}`)

  console.log('\n[10] 静态入口页（/tags、/about 须为真实 index.html，不靠 404.html 兜底）')
  const assetRefs = (html) =>
    [...html.matchAll(/(?:src|href)="(\/[^"]*assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1])
  const homeAssets = assetRefs(indexHtml)
  const staticPages = [
    { dir: 'tags', title: '标签分类 | 微光手记', description: '按标签浏览微光手记的全部文章。' },
    {
      dir: 'about',
      title: '关于这个博客 | 微光手记',
      description: '微光手记的由来：一个关于技术实践、产品思考和普通生活的个人博客。',
    },
  ]
  for (const page of staticPages) {
    const file = path.join(distDir, page.dir, 'index.html')
    const exists = await fs.access(file).then(() => true, () => false)
    check(`dist/${page.dir}/index.html 存在`, exists)
    if (!exists) continue
    const html = await fs.readFile(file, 'utf8')
    check(`${page.dir} 页 title 与 SPA 一致`, html.includes(`<title>${page.title}</title>`))
    check(`${page.dir} 页 description 与 SPA 一致`, html.includes(`<meta name="description" content="${page.description}" />`))
    check(`${page.dir} 页 og/twitter 标题与 title 一致`, html.includes(`<meta property="og:title" content="${page.title}" />`) && html.includes(`<meta name="twitter:title" content="${page.title}" />`))
    const canonical = /rel="canonical" href="([^"]+)"/.exec(html)?.[1]
    const ogUrl = /property="og:url" content="([^"]+)"/.exec(html)?.[1]
    const ogImage = /property="og:image" content="([^"]+)"/.exec(html)?.[1]
    check(`${page.dir} 页 canonical 指向自身`, Boolean(canonical?.endsWith(`/${page.dir}`)), String(canonical))
    check(`${page.dir} 页 og:url 与 canonical 一致`, canonical === ogUrl, `${canonical} vs ${ogUrl}`)
    check(`${page.dir} 页 og:image 为绝对地址`, /^https?:\/\/[^"]+\/og-default\.png$/.test(ogImage ?? ''), String(ogImage))
    check(
      `${page.dir} 页资源路径与首页一致（子路径不丢前缀）`,
      homeAssets.length > 0 && assetRefs(html).join('|') === homeAssets.join('|'),
      `${assetRefs(html).join(',')} vs ${homeAssets.join(',')}`,
    )
  }

  console.log('\n[11] 本地写作台不得进入生产产物')
  const assetNames = await fs.readdir(path.join(distDir, 'assets'))
  const leaked = []
  for (const name of assetNames) {
    if (!name.endsWith('.js') && !name.endsWith('.css')) continue
    const content = await fs.readFile(path.join(distDir, 'assets', name), 'utf8')
    if (content.includes('__writer')) leaked.push(name)
  }
  check('dist 资源不含写入接口标记', leaked.length === 0, leaked.join(', '))
  check('dist 没有 WriterPage chunk', !assetNames.some((name) => /WriterPage/i.test(name)))
  const writerProbe = await raw('/__writer/api/posts', { headers: gz })
  check(
    '/__writer/api/posts 在生产服务上不是 JSON 接口',
    !/application\/json/.test(writerProbe.headers['content-type'] ?? ''),
    writerProbe.headers['content-type'],
  )

  stop()

  console.log('\n' + '-'.repeat(52))
  console.log(`通过 ${pass} 项，失败 ${failures.length} 项`)
  if (failures.length > 0) {
    console.log('\n失败明细：')
    for (const item of failures) console.log(`  - ${item}`)
    process.exit(1)
  }
  console.log('全部通过')
  process.exit(0)
}

main().catch((error) => {
  console.error('测试执行异常：', error)
  process.exit(1)
})
