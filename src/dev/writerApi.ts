/**
 * 写作台 API 客户端。只在 dev 下被 WriterPage 引用，
 * 生产构建不会打包这些请求逻辑。
 */

export interface WriterPostSummary {
  file: string
  slug: string
  draft: boolean
  title: string
  published_at: string
  updated_at: string
  bytes: number
  modifiedAt: number
}

export interface WriterPost {
  file: string
  slug: string
  draft: boolean
  title: string
  summary: string
  tags: string[]
  publishedAt: string
  body: string
}

export interface SavePayload {
  file: string | null
  slug: string
  title: string
  summary: string
  tags: string[]
  publishedAt: string
  body: string
  publish: boolean
}

export interface SaveResult {
  file: string
  slug: string
  draft: boolean
  previousFile: string | null
}

export interface ImageResult {
  path: string
  mime: string
  bytes: number
}

export interface PublishRequest {
  file: string
  images: string[]
  removed: string[]
}

export interface PublishFile {
  path: string
  status: string
}

export interface PublishPlan {
  branch: string
  commitMessage: string
  files: PublishFile[]
}

export interface PublishResult {
  ok: true
  branch: string
  commit: string
  files: PublishFile[]
  pushed: true
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const payload = (await response.json().catch(() => null)) as { error?: string } | T | null
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? payload.error : ''
    throw new Error(message || `请求失败（${response.status}）`)
  }
  return payload as T
}

function postJson<T>(url: string, body: unknown) {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const writerApi = {
  list: () => request<{ posts: WriterPostSummary[] }>('/__writer/api/posts'),
  read: (file: string) => request<WriterPost>(`/__writer/api/post?file=${encodeURIComponent(file)}`),
  save: (payload: SavePayload) => postJson<SaveResult>('/__writer/api/save', payload),
  upload: (dataUrl: string) => postJson<ImageResult>('/__writer/api/image', { dataUrl }),
  planPublish: (payload: PublishRequest) =>
    postJson<PublishPlan>('/__writer/api/publish', { ...payload, dryRun: true }),
  publish: (payload: PublishRequest) =>
    postJson<PublishResult>('/__writer/api/publish', { ...payload, dryRun: false }),
}
