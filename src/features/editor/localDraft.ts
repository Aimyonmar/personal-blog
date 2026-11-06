/** 编辑器本地草稿：刷新/崩溃后可从 localStorage 恢复。 */

export interface LocalDraft {
  title: string
  summary: string
  tags: string
  content: string
  status: 'draft' | 'published'
  savedAt: number
}

const KEY_PREFIX = 'personal-blog:editor-draft:'

export function editorDraftKey(slug?: string) {
  return `${KEY_PREFIX}${slug ? `edit:${slug}` : 'new'}`
}

/** 解析 localStorage 中的原始字符串，任何异常或旧格式都返回 null。 */
export function parseLocalDraft(raw: string | null): LocalDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object') return null
    if (typeof value.content !== 'string') return null
    return {
      title: typeof value.title === 'string' ? value.title : '',
      summary: typeof value.summary === 'string' ? value.summary : '',
      tags: typeof value.tags === 'string' ? value.tags : '',
      content: value.content,
      status: value.status === 'draft' ? 'draft' : 'published',
      savedAt: typeof value.savedAt === 'number' && Number.isFinite(value.savedAt) ? value.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function readLocalDraft(key: string): LocalDraft | null {
  try {
    return parseLocalDraft(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

/** 写入成功返回 true；存储不可用或超出配额时返回 false。 */
export function writeLocalDraft(key: string, draft: Omit<LocalDraft, 'savedAt'>): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }))
    return true
  } catch {
    return false
  }
}

export function clearLocalDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* 存储不可用时忽略 */
  }
}

/** 把时间戳描述成「刚刚 / 12 分钟前 / 3 小时前 / 具体日期」。 */
export function formatSavedAt(savedAt: number, now = Date.now()) {
  if (!savedAt) return '未知时间'
  const diff = Math.max(0, now - savedAt)
  const minute = 60 * 1000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(savedAt))
}
