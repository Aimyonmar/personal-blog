import { Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useReadingPreferences } from '../features/preferences/ReadingPreferencesProvider'
import type { ReadingLeading, ReadingSize, ThemePreference } from '../features/preferences/readingPreferences'

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const SIZE_OPTIONS: Array<{ value: ReadingSize; label: string }> = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '标准' },
  { value: 'lg', label: '大' },
]

const LEADING_OPTIONS: Array<{ value: ReadingLeading; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'normal', label: '标准' },
  { value: 'loose', label: '宽松' },
]

export function ReadingPreferencesPanel() {
  const { preferences, updatePreferences } = useReadingPreferences()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="pref-control" ref={rootRef}>
      <button
        className="icon-button"
        type="button"
        aria-label="阅读偏好"
        aria-expanded={open}
        title="阅读偏好"
        onClick={() => setOpen((value) => !value)}
      >
        <Type size={18} />
      </button>

      {open && (
        <div className="pref-popover" role="dialog" aria-label="阅读偏好设置">
          <div className="pref-group">
            <span className="pref-label">主题</span>
            <div className="pref-options">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferences.theme === option.value ? 'active' : undefined}
                  aria-pressed={preferences.theme === option.value}
                  onClick={() => updatePreferences({ theme: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pref-group">
            <span className="pref-label">正文字号</span>
            <div className="pref-options">
              {SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferences.size === option.value ? 'active' : undefined}
                  aria-pressed={preferences.size === option.value}
                  onClick={() => updatePreferences({ size: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pref-group">
            <span className="pref-label">行距</span>
            <div className="pref-options">
              {LEADING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={preferences.leading === option.value ? 'active' : undefined}
                  aria-pressed={preferences.leading === option.value}
                  onClick={() => updatePreferences({ leading: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <p className="pref-hint">偏好保存在本机浏览器，换设备不会同步。</p>
        </div>
      )}
    </div>
  )
}
