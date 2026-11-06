/**
 * 正文插图：在浏览器内压缩后转成 data URL 写入 Markdown。
 * 云文件存储对未登录访客不可读，直接内嵌可保证公开读者也能看到图片。
 */

const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_EMBED_BYTES = 700 * 1024
const MAX_EDGE = 1400

export function isSupportedInlineImage(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
}

/** 去掉方括号等会破坏 Markdown 语法的字符，得到可用的 alt 文本。 */
export function imageAltFromName(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, ' ').trim()
  return base || '插图'
}

export function markdownImageSnippet(alt: string, dataUrl: string) {
  return `\n\n![${imageAltFromName(alt)}](${dataUrl})\n\n`
}

export async function imageToMarkdownDataUrl(file: File) {
  if (!isSupportedInlineImage(file)) throw new Error('正文插图支持 JPG、PNG 或 WebP。')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('图片不能超过 8MB。')

  const bitmap = await createImageBitmap(file)
  try {
    let quality = 0.82
    let edge = MAX_EDGE

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器不支持图片处理。')
      context.drawImage(bitmap, 0, 0, width, height)

      const dataUrl = canvas.toDataURL('image/webp', quality)
      const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const bytes = Math.round(encoded.length * 0.75)
      if (bytes <= MAX_EMBED_BYTES) return { dataUrl, bytes, width, height }

      quality = Math.max(0.45, quality - 0.15)
      edge = Math.round(edge * 0.85)
    }

    throw new Error('图片压缩后仍然过大，请换一张更小的图片。')
  } finally {
    bitmap.close()
  }
}
