import { getCloud } from '../../app/cloud'
import type { Attachment } from '../../app/types'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ATTACHMENT_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
]

function safeName(name: string) {
  const extension = name.includes('.') ? `.${name.split('.').pop()?.toLowerCase()}` : ''
  return `${crypto.randomUUID()}${extension}`
}

async function requireSession() {
  const cloud = await getCloud()
  const session = await cloud.auth.getSession()
  if (session.error || !session.data) throw new Error('请先登录后再上传文件。')
  return session.data
}

export async function uploadBlogFile(file: File, kind: 'covers' | 'attachments'): Promise<Attachment> {
  const session = await requireSession()
  const cloud = await getCloud()
  const allowedTypes = kind === 'covers' ? IMAGE_TYPES : ATTACHMENT_TYPES
  const maxSize = kind === 'covers' ? 8 * 1024 * 1024 : 20 * 1024 * 1024

  if (!allowedTypes.includes(file.type)) {
    throw new Error(kind === 'covers' ? '封面仅支持 JPG、PNG、WebP 或 GIF。' : '该附件类型暂不支持。')
  }
  if (file.size > maxSize) {
    throw new Error(kind === 'covers' ? '封面图片不能超过 8MB。' : '附件不能超过 20MB。')
  }

  const path = cloud.storage.sharedPath(session.user.id, `${kind}/${safeName(file.name)}`)
  const uploaded = await cloud.storage.upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
    metadata: { purpose: kind === 'covers' ? 'blog-cover' : 'blog-attachment' },
  })

  if (uploaded.error) throw new Error(uploaded.error.message || '文件上传失败。')
  return { name: file.name, path, size: file.size, type: file.type }
}

export async function createDownloadUrl(path: string) {
  const cloud = await getCloud()
  const session = await cloud.auth.getSession()
  if (session.error || !session.data) throw new Error('请登录后查看云端图片或附件。')

  const result = await cloud.storage.createSignedUrl(path, 600)
  if (result.error) throw new Error(result.error.message || '下载链接生成失败。')
  const value = result.data as unknown as { url?: string; signedUrl?: string } | string
  if (typeof value === 'string') return value
  return value.url ?? value.signedUrl ?? ''
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
