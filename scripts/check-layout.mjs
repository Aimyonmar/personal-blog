/**
 * 布局回归测试：多视口宽度扫描横向溢出。
 *
 * 背景：曾出现一次真实缺陷 —— `.site-shell` 只声明了 `grid-template-rows`，
 * 隐式列是 `auto` 轨道（最大尺寸函数为 max-content），被跑马灯里 `width:max-content`
 * 的轨道撑到 2487px，进而把 body / main / 页头一起拉宽，导致整页横向溢出、
 * 内容被裁切、出现横向滚动条。该缺陷在窄屏访客（绝大多数笔记本）上都会出现。
 *
 * 本脚本用 Chrome DevTools Protocol 在多个视口下断言文档不产生横向溢出，
 * 防止同类问题再次混入。
 *
 * 运行：npm run test:layout        （需先 npm run build）
 * 退出码：0 = 正常；1 = 存在横向溢出；0 且提示跳过 = 未找到 Chrome
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const distDir = path.join(root, 'dist')

const SERVER_PORT = Number(process.env.LAYOUT_SERVER_PORT || 4210)
const DEBUG_PORT = Number(process.env.LAYOUT_DEBUG_PORT || 9336)
const WIDTHS = (process.env.LAYOUT_WIDTHS || '1920,1536,1440,1280,1024,900,768,540,375')
  .split(',')
  .map(Number)
const PATHS = (process.env.LAYOUT_PATHS || '/')
  .split(/[,\s]+/)
  .map((item) => item.trim())
  .filter(Boolean)

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.log('未找到 Chrome / Edge，跳过布局回归测试（设置 CHROME_PATH 可指定路径）')
  process.exit(0)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      /* 还没起来 */
    }
    await sleep(300)
  }
  return null
}

async function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return true
    } catch {
      /* 还没起来 */
    }
    await sleep(250)
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

  const server = spawn(process.execPath, [path.join(root, 'server.mjs')], {
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'ignore',
  })

  let chrome = null
  const cleanup = () => {
    if (chrome && !chrome.killed) chrome.kill()
    if (!server.killed) server.kill()
  }
  process.on('exit', cleanup)

  if (!(await waitForServer(SERVER_PORT))) {
    console.error(`本地服务未在 ${SERVER_PORT} 端口就绪`)
    cleanup()
    process.exit(1)
  }

  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const target = await waitForPort(DEBUG_PORT)
  if (!target) {
    console.error('Chrome 调试端口未就绪')
    cleanup()
    process.exit(1)
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let msgId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++msgId
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')

  const failures = []
  for (const routePath of PATHS) {
    await send('Page.navigate', { url: `http://127.0.0.1:${SERVER_PORT}${routePath}` })
    await sleep(6000) // 等 SPA 渲染与数据加载

    console.log(`\n路径 ${routePath}`)
    console.log('视口宽 | 文档宽 | 溢出 | 页头 left/宽 | 内容宽 | 结论')
    console.log('-------|--------|------|-------------|--------|------')

    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await sleep(600)

      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const de = document.documentElement;
          const g = (s) => { const e = document.querySelector(s); if (!e) return null;
            const b = e.getBoundingClientRect(); return { l: Math.round(b.left), w: Math.round(b.width) }; };
          return { iw: window.innerWidth, sw: de.scrollWidth, ov: de.scrollWidth - de.clientWidth,
            header: g('.site-header'), content: g('.article-main, .hero-section') };
        })()`,
        returnByValue: true,
      })
      const v = res.result.result.value
      const ok = v.ov <= 0 && (!v.header || v.header.l >= -1)
      if (!ok) failures.push(`${routePath} ${v.iw}px 视口横向溢出 ${v.ov}px`)

      console.log(
        `${String(v.iw).padStart(6)} | ${String(v.sw).padStart(6)} | ${String(v.ov).padStart(4)} | ` +
          `${String(v.header?.l).padStart(6)} /${String(v.header?.w).padStart(5)} | ` +
          `${String(v.content?.w).padStart(6)} | ${ok ? '正常' : '**溢出**'}`,
      )
    }
  }

  ws.close()
  cleanup()

  console.log('')
  if (failures.length > 0) {
    console.log(`失败：${failures.length} 个视口存在横向溢出`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`全部 ${WIDTHS.length} 个视口均无横向溢出`)
  process.exit(0)
}

main().catch((error) => {
  console.error('布局测试执行异常：', error)
  process.exit(1)
})
