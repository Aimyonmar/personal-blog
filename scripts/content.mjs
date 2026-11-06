/**
 * 本地内容层：读取 content/posts/*.md，解析 frontmatter，供构建、测试与本地服务共用。
 * 零依赖、不访问网络；没有文章时返回空数组。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const SITE = {
  name: '微光手记',
  title: '微光手记 | 技术与生活随笔',
  description: '记录技术实践、产品思考与日常灵感。把复杂的事，写得清楚一点。',
  author: '微光手记',
  language: 'zh-CN',
}

export const DEFAULT_CONTENT_DIR = path.resolve(here, '..', 'content', 'posts')

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
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseScalar(raw) {
  const text = raw.trim()
  if (!text) return ''
  if (text.startsWith('[') && text.endsWith(']')) {
    return text
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean)
  }
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true'
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  return unquote(text)
}

function unquote(text) {
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    const body = text.slice(1, -1)
    return text.startsWith('"') ? body.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : body.replace(/''/g, "'")
  }
  return text
}

/**
 * 解析 Markdown 的 YAML frontmatter 子集：
 * `key: value`、行内数组 `[a, b]`、缩进列表、引号字符串、数字与布尔值。
 */
export function parseFrontmatter(raw) {
  const normalized = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') return { data: {}, body: normalized }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end === -1) return { data: {}, body: normalized }

  const data = {}
  let currentKey = null
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trim().startsWith('#')) continue

    const listItem = /^\s*-\s+(.*)$/.exec(line)
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = []
      data[currentKey].push(parseScalar(listItem[1]))
      continue
    }

    const entry = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!entry) continue
    currentKey = entry[1]
    data[currentKey] = entry[2].trim() === '' ? '' : parseScalar(entry[2])
  }

  return { data, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') }
}

/** 按中文 350 字/分钟、英文 220 词/分钟估算阅读时长，最少 1 分钟。 */
export function estimateReadTime(markdown) {
  const chineseChars = (markdown.match(/[\u3400-\u9fff]/g) ?? []).length
  const latinWords = (markdown.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.ceil(chineseChars / 350 + latinWords / 220))
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value) {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean)
  const text = asString(value)
  return text ? [text] : []
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { name: path.basename(item), path: item, size: 0, type: '' }
      if (!item || typeof item !== 'object') return null
      const raw = item
      const filePath = asString(raw.path) || asString(raw.url)
      if (!filePath) return null
      return {
        name: asString(raw.name) || path.basename(filePath),
        path: filePath,
        size: Number(raw.size) || 0,
        type: asString(raw.type),
      }
    })
    .filter(Boolean)
}

/** 文件名即 slug：只允许字母、数字、连字符（中文会通过 URL 编码正常工作）。 */
export function validateSlug(slug, source) {
  if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) {
    throw new Error(`[content] 文件名不合法：${source}（slug 只允许字母、数字与连字符）`)
  }
}

/**
 * 读取全部文章。
 * - 跳过以 `_` 或 `.` 开头的文件（可作为未发布草稿留在目录里）
 * - 按 published_at 倒序；缺失时间的排在最后
 * - includeContent 控制是否保留正文（前端元数据不需要）
 */
export async function loadPosts({ contentDir = DEFAULT_CONTENT_DIR, includeContent = true } = {}) {
  let entries = []
  try {
    entries = await fs.readdir(contentDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !/^[._]/.test(entry.name))
    .map((entry) => entry.name)

  const posts = []
  for (const name of files) {
    const slug = name.replace(/\.md$/, '')
    validateSlug(slug, name)

    const filePath = path.join(contentDir, name)
    const raw = await fs.readFile(filePath, 'utf8')
    const { data, body } = parseFrontmatter(raw)
    const summary = asString(data.summary) || stripMarkdown(body).slice(0, 120)
    const post = {
      slug,
      file: `content/posts/${name}`,
      title: asString(data.title) || slug,
      summary,
      tags: asStringList(data.tags),
      published_at: asString(data.published_at) || null,
      updated_at: asString(data.updated_at) || asString(data.published_at) || null,
      cover_image: asString(data.cover_image) || null,
      attachments: normalizeAttachments(data.attachments),
      read_time: Number(data.read_time) || estimateReadTime(body),
    }
    if (includeContent) post.content = body
    posts.push(post)
  }

  return posts.sort((a, b) => {
    const left = a.published_at ?? ''
    const right = b.published_at ?? ''
    if (left === right) return a.slug.localeCompare(b.slug)
    if (!left) return 1
    if (!right) return -1
    return right.localeCompare(left)
  })
}

/** 供前端使用的元数据：不含正文，避免列表包体变大。 */
export function toMetadata(post) {
  const { content: _content, ...meta } = post
  return meta
}
