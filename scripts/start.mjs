import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 部署沙箱启动入口：
 * 1. 计算源码指纹（src/、index.html、配置文件的内容哈希）
 * 2. 与 dist/.build-stamp 比对——一致说明源码未变，跳过重建直接服务
 * 3. 不一致或缺少产物时执行 vite build，成功后写入新指纹
 * 4. 交由 server.mjs 提供带压缩与缓存头的静态服务
 *
 * 类型检查（tsc）只在本地 `npm run build` 执行，沙箱内为了启动速度跳过。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const distIndex = path.join(distDir, 'index.html')
const stampPath = path.join(distDir, '.build-stamp')

const INPUTS = [
  'src',
  'content',
  'index.html',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'scripts/content.mjs',
  'scripts/build-content.mjs',
  'scripts/dev-writer.mjs',
  'scripts/blog-data.mjs',
  'scripts/postbuild.mjs',
]

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (full === path.join(root, 'src', 'generated')) continue
    if (entry.isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

function computeSourceStamp() {
  const files = []
  for (const input of INPUTS) {
    const full = path.join(root, input)
    if (!existsSync(full)) continue
    if (statSync(full).isDirectory()) files.push(...walkFiles(full))
    else files.push(full)
  }
  const hash = createHash('sha256')
  const relative = files.map((file) => path.relative(root, file).split(path.sep).join('/')).sort()
  for (const name of relative) {
    hash.update(name)
    hash.update('\0')
    hash.update(readFileSync(path.join(root, name)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const stamp = computeSourceStamp()
let upToDate = false
try {
  upToDate = existsSync(distIndex) && readFileSync(stampPath, 'utf8').trim() === stamp
} catch {
  upToDate = false
}

if (upToDate) {
  console.log('[start] 源码未变化，跳过构建')
} else {
  console.log('[start] 检测到源码变化，开始构建…')
  const runNode = (script) => spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: 'inherit' })
  const contentResult = runNode('scripts/build-content.mjs')
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const result = contentResult.status === 0
    ? spawnSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' })
    : contentResult
  const seoResult = result.status === 0 ? runNode('scripts/postbuild.mjs') : result
  if (seoResult.status === 0) {
    writeFileSync(stampPath, stamp)
    console.log('[start] 构建完成')
  } else if (existsSync(distIndex)) {
    console.warn('[start] 构建失败，继续使用上一次的构建产物')
  } else {
    console.error('[start] 构建失败且没有可用的产物，退出')
    process.exit(1)
  }
}

await import('../server.mjs')
