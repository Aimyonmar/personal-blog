import { describe, expect, it } from 'vitest'
import { imageAltFromName, isSupportedInlineImage, markdownImageSnippet } from './inlineImage'

describe('isSupportedInlineImage', () => {
  it('只接受 jpg/png/webp', () => {
    expect(isSupportedInlineImage(new File([''], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(isSupportedInlineImage(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isSupportedInlineImage(new File([''], 'a.webp', { type: 'image/webp' }))).toBe(true)
    expect(isSupportedInlineImage(new File([''], 'a.gif', { type: 'image/gif' }))).toBe(false)
    expect(isSupportedInlineImage(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})

describe('imageAltFromName', () => {
  it('去掉扩展名与方括号', () => {
    expect(imageAltFromName('截图 2026-11-07.png')).toBe('截图 2026-11-07')
    expect(imageAltFromName('[draft].webp')).toBe('draft')
    expect(imageAltFromName('.png')).toBe('插图')
  })
})

describe('markdownImageSnippet', () => {
  it('生成独立成段的 Markdown 图片语法', () => {
    expect(markdownImageSnippet('demo.png', 'data:image/webp;base64,AAA')).toBe(
      '\n\n![demo](data:image/webp;base64,AAA)\n\n',
    )
  })
})
