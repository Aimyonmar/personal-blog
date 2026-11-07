/**
 * 本地写作台（仅开发环境）：
 * - 由 vite.config.ts 以 `apply: 'serve'` 注册，`vite build` / 生产产物里不会包含任何写文件接口
 * - 读写范围被钉死在 content/posts 与 content/images，文件名全部由服务端重新拼装并校验
 * - 零依赖，不联网，不引入登录或第三方服务
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { estimateReadTime, parseFrontmatter } from './content.mjs'

const execFileAsync = promisify(execFile)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const POSTS_DIR = path.join(root, 'content', 'posts')
// 图片随正文一起放在 content 下；postbuild 会把它们复制到 dist/images
const IMAGES_DIR = path.join(root, 'content', 'images')
const API_PREFIX = '/__writer/api'
const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_BODY_CHARS = 500_000
const SLUG_RE = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u
const FILE_RE = /^([._]?)([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)\.md$/u
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
}

// 写作台保存后，watcher 不应把正在编辑的页面整个刷新掉
const WRITE_QUIET_MS = 3000
let lastWriteAt = 0

export function wasJustWritten() {
  return Date.now() - lastWriteAt < WRITE_QUIET_MS
}

function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_JSON_BYTES) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return reject(fail('请求体过大', 413))
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(fail('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** 只允许单层文件名：拒绝分隔符、`..`、NUL 与空值。 */
function assertSimpleName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..') {
    throw fail('文件名不合法')
  }
  if (name.includes('\0') || name.includes('/') || name.includes('\\')) {
    throw fail('文件名不合法')
  }
  if (path.basename(name) !== name) throw fail('文件名不合法')
}

/** 解析并校验落盘路径，确保结果仍在目标目录内。 */
function resolveInside(baseDir, name) {
  assertSimpleName(name)
  const full = path.resolve(baseDir, name)
  const relative = path.relative(baseDir, full)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw fail('路径越界：只允许写入 content 目录内的文件')
  }
  return full
}

function resolvePostFile(name) {
  assertSimpleName(name)
  const match = FILE_RE.exec(name)
  if (!match) throw fail('文章文件名不合法：只允许 [字母/数字/连字符].md 或以 _ 开头的草稿')
  const full = resolveInside(POSTS_DIR, name)
  return { full, slug: match[2], draft: match[1] === '_' }
}

function samePath(left, right) {
  if (!left || !right) return false
  if (process.platform === 'win32') return left.toLowerCase() === right.toLowerCase()
  return left === right
}

async function exists(full) {
  try {
    await fs.access(full)
    return true
  } catch {
    return false
  }
}

/** 拒绝写入符号链接，避免借链接把内容写到仓库外。 */
async function assertNotSymlink(full) {
  try {
    const stat = await fs.lstat(full)
    if (stat.isSymbolicLink()) throw fail('拒绝写入符号链接')
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
}

async function assertRegularFile(full) {
  try {
    const stat = await fs.lstat(full)
    if (stat.isSymbolicLink() || !stat.isFile()) throw fail('只允许发布普通文件')
  } catch (error) {
    if (error.code === 'ENOENT') throw fail('文件不存在，请先保存后再发布', 404)
    throw error
  }
}

function todayLocal() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function collapsedText(value, label, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) value = ''
  if (typeof value !== 'string') throw fail(`${label}格式不正确`)
  const text = value.replace(/\s+/g, ' ').trim()
  if (required && !text) throw fail(`请填写${label}`)
  if (text.length > maxLength) throw fail(`${label}过长（最多 ${maxLength} 字）`)
  return text
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function normalizeTags(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw fail('标签格式不正确')
  const tags = value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
  if (tags.length > 20) throw fail('标签最多 20 个')
  for (const tag of tags) {
    if (tag.length > 40) throw fail('单个标签最多 40 字')
  }
  return [...new Set(tags)]
}

/** 以魔数判断图片类型；客户端传来的 MIME 只作参考，扩展名由服务端决定。 */
function detectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('latin1')
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif'
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp'
  }
  if (buffer.length >= 12 && buffer.subarray(4, 12).toString('latin1').startsWith('ftypavif')) return 'avif'
  return null
}

async function listPosts() {
  let entries = []
  try {
    entries = await fs.readdir(POSTS_DIR, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const posts = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const match = FILE_RE.exec(entry.name)
    if (!match) continue

    const full = path.join(POSTS_DIR, entry.name)
    const [raw, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
    const { data } = parseFrontmatter(raw)
    posts.push({
      file: entry.name,
      slug: match[2],
      draft: match[1] === '_',
      title: typeof data.title === 'string' && data.title ? data.title : match[2],
      published_at: typeof data.published_at === 'string' ? data.published_at : '',
      updated_at: typeof data.updated_at === 'string' ? data.updated_at : '',
      bytes: stat.size,
      modifiedAt: stat.mtimeMs,
    })
  }

  return posts.sort((a, b) => {
    if (a.draft !== b.draft) return a.draft ? -1 : 1
    return b.modifiedAt - a.modifiedAt
  })
}

async function readPost(name) {
  const { full, slug, draft } = resolvePostFile(name)
  let raw
  try {
    raw = await fs.readFile(full, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') throw fail('文章不存在', 404)
    throw error
  }
  const { data, body } = parseFrontmatter(raw)
  const tags = Array.isArray(data.tags)
    ? data.tags.map((item) => String(item))
    : typeof data.tags === 'string' && data.tags
      ? [data.tags]
      : []
  return {
    file: name,
    slug,
    draft,
    title: typeof data.title === 'string' ? data.title : '',
    summary: typeof data.summary === 'string' ? data.summary : '',
    tags,
    publishedAt: typeof data.published_at === 'string' ? data.published_at : '',
    body,
  }
}

async function savePost(payload) {
  if (!payload || typeof payload !== 'object') throw fail('请求体格式不正确')

  const title = collapsedText(payload.title, '标题', 200, { required: true })
  const summary = collapsedText(payload.summary, '摘要', 600)
  const slug = collapsedText(payload.slug, 'Slug', 64, { required: true })
  if (!SLUG_RE.test(slug)) throw fail('Slug 只允许字母、数字与连字符（中文也可，但会被 URL 编码）')

  const tags = normalizeTags(payload.tags)
  const publish = payload.publish === true

  let publishedAt = collapsedText(payload.publishedAt, '发布时间', 10)
  if (publishedAt) {
    if (!DATE_RE.test(publishedAt) || Number.isNaN(new Date(`${publishedAt}T00:00:00`).getTime())) {
      throw fail('发布时间需为 YYYY-MM-DD')
    }
  } else {
    publishedAt = todayLocal()
  }

  if (typeof payload.body !== 'string') throw fail('正文格式不正确')
  const body = payload.body.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '')
  if (!body) throw fail('正文不能为空')
  if (body.length > MAX_BODY_CHARS) throw fail('正文过长（最多 50 万字）')

  const originalName = typeof payload.file === 'string' && payload.file ? payload.file : null
  let originalFull = null
  if (originalName) {
    const original = resolvePostFile(originalName)
    originalFull = original.full
    if (!(await exists(originalFull))) throw fail('要编辑的文章已不存在，请刷新列表', 404)
    await assertNotSymlink(originalFull)
  }

  const targetName = `${publish ? '' : '_'}${slug}.md`
  const targetFull = resolvePostFile(targetName).full

  if (!samePath(targetFull, originalFull)) {
    await assertNotSymlink(targetFull)
    if (await exists(targetFull)) throw fail('同名文章已存在，请换一个 Slug 或打开它继续编辑', 409)
  }

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    ...(summary ? [`summary: ${yamlString(summary)}`] : []),
    ...(tags.length ? [`tags: [${tags.map(yamlString).join(', ')}]`] : []),
    `published_at: ${publishedAt}`,
    `updated_at: ${todayLocal()}`,
    `read_time: ${estimateReadTime(body)}`,
    '---',
    '',
  ].join('\n')

  await fs.mkdir(POSTS_DIR, { recursive: true })
  const tempFull = `${targetFull}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(tempFull, `${frontmatter}${body}\n`, 'utf8')
    await fs.rename(tempFull, targetFull)
  } catch (error) {
    await fs.rm(tempFull, { force: true })
    throw error
  }

  // 草稿转发布（或反向改名）后，删掉旧文件；不删刚写入的新文件
  if (originalFull && !samePath(originalFull, targetFull)) {
    await fs.rm(originalFull, { force: true })
  }

  lastWriteAt = Date.now()
  return {
    file: targetName,
    slug,
    draft: !publish,
    // 草稿转发布 / 改 slug 时旧文件已删除，发布时要把这个删除一起提交
    previousFile: originalName && !samePath(originalFull, targetFull) ? originalName : null,
  }
}

async function saveImage(payload) {
  if (!payload || typeof payload !== 'object') throw fail('请求体格式不正确')
  const dataUrl = payload.dataUrl
  if (typeof dataUrl !== 'string') throw fail('图片数据格式不正确')

  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
  if (!match) throw fail('只接受 base64 编码的图片')

  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) throw fail('图片内容为空')
  if (buffer.length > MAX_IMAGE_BYTES) throw fail('图片过大（最多 6 MB）')

  const ext = detectImage(buffer)
  if (!ext) throw fail('只支持 PNG / JPG / GIF / WebP / AVIF 图片')

  await fs.mkdir(IMAGES_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const random = Math.random().toString(16).slice(2, 8)
  const name = `img-${stamp}-${random}.${ext}`
  const full = resolveInside(IMAGES_DIR, name)
  await fs.writeFile(full, buffer, { flag: 'wx' })

  return { path: `/images/${name}`, mime: MIME_BY_EXT[ext], bytes: buffer.length }
}

/* ---------- 一键发布：只提交本文与本次图片，再 push origin main ---------- */

const GIT_TIMEOUT_MS = 60_000

/** 过滤 git 输出：不把带凭据的远端 URL 或 token 回传给前端。 */
function sanitizeGitText(text) {
  return String(text ?? '')
    .replace(/https?:\/\/[^\s@]+@/gi, 'https://***@')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{10,}\b/g, '***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

async function git(args, { allowFailure = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: root,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    })
    // 不裁剪 stdout：porcelain 状态码以空格开头（如 " M path"），裁剪会破坏解析
    return { ok: true, stdout: String(stdout), stderr: String(stderr).trim() }
  } catch (error) {
    if (error.code === 'ENOENT') throw fail('未找到 git 命令，请安装 Git 并确保在 PATH 中', 500)
    if (error.killed) throw fail('git 操作超时，请检查网络后重试', 504)
    const stdout = String(error.stdout ?? '').trim()
    const stderr = String(error.stderr ?? error.message ?? '').trim()
    if (allowFailure) return { ok: false, stdout, stderr }
    throw fail(`git 操作失败：${sanitizeGitText(stderr || stdout) || '未知错误'}`, 500)
  }
}

async function assertGitContext() {
  const top = await git(['rev-parse', '--show-toplevel'])
  const actualRoot = process.platform === 'win32' ? path.resolve(top.stdout.trim()).toLowerCase() : path.resolve(top.stdout.trim())
  const expectedRoot = process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root)
  if (actualRoot !== expectedRoot) throw fail('当前目录不是 Git 仓库根目录，已阻止发布', 500)

  const branch = await git(['symbolic-ref', '--short', '-q', 'HEAD'], { allowFailure: true })
  const branchName = branch.stdout.trim()
  if (!branch.ok || !branchName) throw fail('当前处于 detached HEAD，无法安全发布', 400)
  if (branchName !== 'main') throw fail(`当前分支是 ${branchName}，只会推送到 main`, 400)

  const conflicts = await git(['ls-files', '-u'])
  if (conflicts.stdout.trim()) throw fail('仓库存在未解决的合并冲突，请先处理后再发布', 409)

  const staged = await git(['diff', '--cached', '--name-only'])
  if (staged.stdout.trim()) {
    throw fail('暂存区已有其他改动，为避免误提交请先在终端提交或取消暂存（本工具不会 reset）', 409)
  }

  const remote = await git(['remote', 'get-url', 'origin'], { allowFailure: true })
  if (!remote.ok) throw fail('未配置 origin 远端，无法推送', 400)

  return branchName
}

function imageRelPath(ref) {
  if (typeof ref !== 'string') throw fail('图片路径格式不正确')
  const match = /^\/images\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(ref.trim())
  if (!match) throw fail('图片路径不合法：只允许 /images/<文件名> 的形式')
  const name = match[1]
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!MIME_BY_EXT[ext]) throw fail('不支持的图片类型')
  return { rel: `content/images/${name}`, full: resolveInside(IMAGES_DIR, name) }
}

function describeStatus(code) {
  if (code === '??') return '新增'
  if (code.includes('D')) return '删除'
  if (code.includes('A') || code.includes('R')) return '新增'
  return '修改'
}

function parseStatus(raw) {
  return raw
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const code = entry.slice(0, 2)
      return { code, path: entry.slice(3).trim().replace(/\\/g, '/'), status: describeStatus(code) }
    })
    .filter((entry) => entry.path)
}

/** 校验发布范围，返回本次真正有变化的文件（不包含工作区其他改动）。 */
async function buildPublishContext(payload) {
  if (!payload || typeof payload !== 'object') throw fail('请求体格式不正确')
  if (typeof payload.file !== 'string' || !payload.file) throw fail('缺少要发布的文章文件')

  const post = resolvePostFile(payload.file)
  if (post.draft) throw fail('草稿不入库：请先点「发布」转为正式文章后再推送', 400)
  await assertRegularFile(post.full)

  const raw = await fs.readFile(post.full, 'utf8')
  const { data } = parseFrontmatter(raw)
  const title = typeof data.title === 'string' && data.title ? data.title : post.slug
  const postRel = `content/posts/${payload.file}`

  if (payload.images !== undefined && !Array.isArray(payload.images)) throw fail('图片列表格式不正确')
  const images = payload.images ?? []
  if (images.length > 30) throw fail('单次最多提交 30 张图片')
  const imageRels = []
  for (const ref of images) {
    const image = imageRelPath(ref)
    await assertRegularFile(image.full)
    imageRels.push(image.rel)
  }

  if (payload.removed !== undefined && !Array.isArray(payload.removed)) throw fail('删除列表格式不正确')
  const removed = payload.removed ?? []
  if (removed.length > 30) throw fail('单次删除的文件过多')
  const removedRels = []
  for (const name of removed) {
    if (typeof name !== 'string' || !name) continue
    const parsed = resolvePostFile(name)
    if (samePath(parsed.full, post.full)) continue
    removedRels.push(`content/posts/${name}`)
  }

  const candidates = [...new Set([postRel, ...imageRels, ...removedRels])]
  const changes = parseStatus((await git(['status', '--porcelain=v1', '-z', '--', ...candidates])).stdout)
  if (changes.length === 0) throw fail('没有需要提交的改动：内容与上一次提交一致', 400)

  // git status 已按 pathspec 过滤，这里再按白名单核对一次，防止任何范围外文件混入
  const allowed = new Set(candidates)
  for (const change of changes) {
    if (!allowed.has(change.path)) throw fail(`检测到范围外的改动：${change.path}`, 500)
  }

  const postTracked = (await git(['ls-files', '--error-unmatch', '--', postRel], { allowFailure: true })).ok
  let removedTracked = false
  for (const rel of removedRels) {
    if ((await git(['ls-files', '--error-unmatch', '--', rel], { allowFailure: true })).ok) removedTracked = true
  }
  const isNew = !postTracked && !removedTracked

  return {
    allowed,
    paths: changes.map((change) => change.path),
    files: changes.map((change) => ({ path: change.path, status: change.status })),
    commitMessage: `post: ${isNew ? '发布' : '更新'}《${title.replace(/\s+/g, ' ').trim().slice(0, 60)}》`,
  }
}

async function planPublish(payload) {
  const branch = await assertGitContext()
  const context = await buildPublishContext(payload)
  return { branch, commitMessage: context.commitMessage, files: context.files }
}

async function executePublish(payload) {
  await assertGitContext()
  const context = await buildPublishContext(payload)

  await git(['add', '-A', '--', ...context.paths])

  const staged = (await git(['diff', '--cached', '--name-only', '-z'])).stdout
    .split('\0')
    .filter(Boolean)
    .map((item) => item.replace(/\\/g, '/'))
  if (staged.length === 0) throw fail('暂存后没有可提交的改动，请刷新后重试', 409)

  const outside = staged.filter((item) => !context.allowed.has(item))
  if (outside.length) throw fail(`检测到范围外的暂存文件，已停止提交：${outside.join(', ')}`, 500)

  await git(['commit', '-m', context.commitMessage])
  const commit = (await git(['rev-parse', '--short', 'HEAD'])).stdout.trim()

  const pushed = await git(['push', 'origin', 'main'], { allowFailure: true })
  if (!pushed.ok) {
    const detail = sanitizeGitText(pushed.stderr || pushed.stdout) || '未知错误'
    const hint = /non-fast-forward|rejected|fetch first/i.test(detail)
      ? '远端已有新提交，请先在终端执行 git pull --rebase 后重试。'
      : '请检查网络、GitHub 凭据与仓库权限。'
    // 提交已生成但推送失败：明确告知，绝不 force-push 或撤销本地提交
    throw fail(`本地提交 ${commit} 已生成，但推送失败：${detail} ${hint}本工具不会强制推送。`, 502)
  }

  return { ok: true, branch: 'main', commit, files: context.files, pushed: true }
}

async function serveImage(req, res, url, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  let name
  try {
    name = decodeURIComponent(url.pathname.slice('/images/'.length))
  } catch {
    return next()
  }
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0') || name === '.' || name === '..') {
    return next()
  }
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!MIME_BY_EXT[ext]) return next()

  const full = path.resolve(IMAGES_DIR, name)
  if (!full.startsWith(IMAGES_DIR + path.sep)) return next()

  try {
    const data = await fs.readFile(full)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME_BY_EXT[ext])
    res.setHeader('Content-Length', String(data.length))
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch (error) {
    if (error.code === 'ENOENT') return next()
    next(error)
  }
}

async function handleApi(req, res, url) {
  const route = url.pathname.slice(API_PREFIX.length).replace(/\/$/, '')

  if (route === '/posts' && req.method === 'GET') {
    sendJson(res, 200, { posts: await listPosts() })
    return
  }

  if (route === '/post' && req.method === 'GET') {
    const file = url.searchParams.get('file') ?? ''
    sendJson(res, 200, await readPost(file))
    return
  }

  if (route === '/save' && req.method === 'POST') {
    if (!/json/i.test(req.headers['content-type'] ?? '')) throw fail('Content-Type 需为 application/json', 415)
    sendJson(res, 200, await savePost(await readJson(req)))
    return
  }

  if (route === '/image' && req.method === 'POST') {
    if (!/json/i.test(req.headers['content-type'] ?? '')) throw fail('Content-Type 需为 application/json', 415)
    sendJson(res, 200, await saveImage(await readJson(req)))
    return
  }

  if (route === '/publish' && req.method === 'POST') {
    if (!/json/i.test(req.headers['content-type'] ?? '')) throw fail('Content-Type 需为 application/json', 415)
    const payload = await readJson(req)
    sendJson(res, 200, payload.dryRun === true ? await planPublish(payload) : await executePublish(payload))
    return
  }

  if (['/posts', '/post', '/save', '/image', '/publish'].includes(route)) throw fail('请求方法不支持', 405)
  throw fail('接口不存在', 404)
}

/** Vite 插件：只在 dev server 生效（apply: 'serve'）。 */
export function writerPlugin() {
  return {
    name: 'local-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        if (url.pathname.startsWith(`${API_PREFIX}/`) || url.pathname === API_PREFIX) {
          void handleApi(req, res, url).catch((error) => {
            const status = Number(error?.status) || 500
            if (status >= 500) console.error('[writer]', error)
            if (!res.headersSent) sendJson(res, status, { error: error?.message || '写入失败' })
          })
          return
        }

        // dev 下把 /images/* 指向 content/images；找不到再交给 public/ 的静态服务
        if (url.pathname.startsWith('/images/')) {
          void serveImage(req, res, url, next)
          return
        }

        next()
      })
    },
  }
}
