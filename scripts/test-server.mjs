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
  for (const route of ['/', '/tags', '/about', '/article/any-slug', '/editor', '/unknow-nested/route']) {
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
