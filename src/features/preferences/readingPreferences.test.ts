import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  resolveTheme,
} from './readingPreferences'

describe('parsePreferences', () => {
  it('空值与损坏 JSON 返回默认值', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences('{oops')).toEqual(DEFAULT_PREFERENCES)
  })

  it('校验每个字段，非法值单独回退', () => {
    expect(parsePreferences(JSON.stringify({ theme: 'sepia', size: 'xl', leading: 'huge' }))).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences(JSON.stringify({ theme: 'dark', size: 'lg', leading: 'loose' }))).toEqual({
      theme: 'dark',
      size: 'lg',
      leading: 'loose',
    })
    expect(parsePreferences(JSON.stringify({ theme: 'dark', size: 'xl' }))).toEqual({
      theme: 'dark',
      size: 'md',
      leading: 'normal',
    })
  })
})

describe('resolveTheme', () => {
  it('system 跟随系统，显式选择优先', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})
