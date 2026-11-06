import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyPreferences,
  readPreferences,
  resolveTheme,
  writePreferences,
  type ReadingPreferences,
} from './readingPreferences'

interface ReadingPreferencesContextValue {
  preferences: ReadingPreferences
  resolvedTheme: 'light' | 'dark'
  updatePreferences: (patch: Partial<ReadingPreferences>) => void
}

const ReadingPreferencesContext = createContext<ReadingPreferencesContextValue | null>(null)

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ReadingPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ReadingPreferences>(readPreferences)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // 在浏览器绘制前同步根节点属性，避免切主题时闪白
  useLayoutEffect(() => {
    applyPreferences(preferences, systemDark)
  }, [preferences, systemDark])

  const updatePreferences = useCallback((patch: Partial<ReadingPreferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...patch }
      writePreferences(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      preferences,
      resolvedTheme: resolveTheme(preferences.theme, systemDark),
      updatePreferences,
    }),
    [preferences, systemDark, updatePreferences],
  )

  return <ReadingPreferencesContext.Provider value={value}>{children}</ReadingPreferencesContext.Provider>
}

export function useReadingPreferences() {
  const value = useContext(ReadingPreferencesContext)
  if (!value) throw new Error('useReadingPreferences 必须在 ReadingPreferencesProvider 内使用')
  return value
}
