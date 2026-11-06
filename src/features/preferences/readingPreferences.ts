export type ThemePreference = 'light' | 'dark' | 'system'
export type ReadingSize = 'sm' | 'md' | 'lg'
export type ReadingLeading = 'compact' | 'normal' | 'loose'

export interface ReadingPreferences {
  theme: ThemePreference
  size: ReadingSize
  leading: ReadingLeading
}

export const READING_PREFERENCES_KEY = 'personal-blog:reading-preferences:v1'

export const DEFAULT_PREFERENCES: ReadingPreferences = {
  theme: 'system',
  size: 'md',
  leading: 'normal',
}

const THEMES: ThemePreference[] = ['light', 'dark', 'system']
const SIZES: ReadingSize[] = ['sm', 'md', 'lg']
const LEADINGS: ReadingLeading[] = ['compact', 'normal', 'loose']

/** 解析 localStorage 中的原始值，非法字段回退到默认值。 */
export function parsePreferences(raw: string | null): ReadingPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES }
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ReadingPreferences, unknown>>
    if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES }
    return {
      theme: THEMES.includes(value.theme as ThemePreference) ? (value.theme as ThemePreference) : DEFAULT_PREFERENCES.theme,
      size: SIZES.includes(value.size as ReadingSize) ? (value.size as ReadingSize) : DEFAULT_PREFERENCES.size,
      leading: LEADINGS.includes(value.leading as ReadingLeading) ? (value.leading as ReadingLeading) : DEFAULT_PREFERENCES.leading,
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function readPreferences(): ReadingPreferences {
  try {
    return parsePreferences(window.localStorage.getItem(READING_PREFERENCES_KEY))
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function writePreferences(preferences: ReadingPreferences) {
  try {
    window.localStorage.setItem(READING_PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    /* 隐私模式或配额不足时忽略，内存状态仍然生效 */
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/** 只改根节点上的 data-* 与 CSS 变量，避免各组件硬编码颜色。 */
export function applyPreferences(preferences: ReadingPreferences, systemPrefersDark: boolean) {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(preferences.theme, systemPrefersDark)
  root.dataset.readingSize = preferences.size
  root.dataset.readingLeading = preferences.leading
}
