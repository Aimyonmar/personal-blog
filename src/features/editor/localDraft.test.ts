import { describe, expect, it } from 'vitest'
import { editorDraftKey, formatSavedAt, parseLocalDraft } from './localDraft'

describe('editorDraftKey', () => {
  it('新文章与编辑文章使用不同键', () => {
    expect(editorDraftKey()).toBe('personal-blog:editor-draft:new')
    expect(editorDraftKey('abc')).toBe('personal-blog:editor-draft:edit:abc')
  })
})

describe('parseLocalDraft', () => {
  it('空值与损坏 JSON 返回 null', () => {
    expect(parseLocalDraft(null)).toBeNull()
    expect(parseLocalDraft('{oops')).toBeNull()
    expect(parseLocalDraft('null')).toBeNull()
  })

  it('缺少正文视为无效草稿', () => {
    expect(parseLocalDraft(JSON.stringify({ title: '只有标题' }))).toBeNull()
  })

  it('补全缺失字段并校正状态', () => {
    const parsed = parseLocalDraft(JSON.stringify({ content: '# hi', status: 'weird', savedAt: 123 }))
    expect(parsed).toEqual({
      title: '',
      summary: '',
      tags: '',
      content: '# hi',
      status: 'published',
      savedAt: 123,
    })
  })

  it('保留合法草稿字段', () => {
    const draft = { title: '标题', summary: '摘要', tags: 'a, b', content: '正文', status: 'draft', savedAt: 42 }
    expect(parseLocalDraft(JSON.stringify(draft))).toEqual(draft)
  })
})

describe('formatSavedAt', () => {
  const now = Date.parse('2026-11-07T12:00:00.000Z')

  it('按时间差输出中文描述', () => {
    expect(formatSavedAt(now - 20 * 1000, now)).toBe('刚刚')
    expect(formatSavedAt(now - 12 * 60 * 1000, now)).toBe('12 分钟前')
    expect(formatSavedAt(now - 3 * 60 * 60 * 1000, now)).toBe('3 小时前')
  })

  it('超过一天显示日期，缺失时间给出兜底文案', () => {
    expect(formatSavedAt(now - 3 * 24 * 60 * 60 * 1000, now)).toContain('月')
    expect(formatSavedAt(0, now)).toBe('未知时间')
  })
})
