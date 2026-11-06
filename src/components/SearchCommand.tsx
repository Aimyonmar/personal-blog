import { ArrowRight, Loader2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate } from './ArticleCard'
import { loadSearchIndex, searchArticles, type SearchDoc } from '../features/search/searchIndex'

export function SearchCommand() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<SearchDoc[] | null>(null)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchArticles(docs ?? [], query), [docs, query])

  const close = () => setOpen(false)

  const go = (slug: string) => {
    close()
    setQuery('')
    navigate(`/article/${slug}`)
  }

  // 全局快捷键：Cmd/Ctrl+K 打开或关闭；Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      } else if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open || docs !== null) return
    let cancelled = false
    setError('')
    void (async () => {
      try {
        const loaded = await loadSearchIndex()
        if (!cancelled) setDocs(loaded)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '搜索索引加载失败。')
      }
    })()
    return () => { cancelled = true }
  }, [open, docs])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const retry = () => {
    setDocs(null)
    setError('')
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = (activeIndex + direction + results.length) % results.length
      setActiveIndex(next)
      const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      const result = results[activeIndex]
      if (result) go(result.slug)
    }
  }

  const showLoading = open && docs === null && !error
  const showNoArticles = open && !showLoading && !error && docs !== null && docs.length === 0
  const showEmpty = open && !showLoading && !error && !showNoArticles && query.trim() !== '' && results.length === 0
  const showIdle = open && !showLoading && !error && !showNoArticles && query.trim() === ''

  return (
    <>
      <button
        className="icon-button search-trigger"
        type="button"
        aria-label="搜索文章"
        title="搜索文章（Ctrl / ⌘ + K）"
        onClick={() => setOpen(true)}
      >
        <Search size={18} />
      </button>

      {open && (
        <div
          className="search-overlay"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
        >
          <div className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索文章">
            <div className="search-input-row">
              <Search size={19} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="搜索标题、标签、摘要或正文…"
                aria-label="搜索关键词"
                autoComplete="off"
              />
              <button className="search-close" type="button" onClick={close} aria-label="关闭搜索">
                <X size={17} />
              </button>
            </div>

            <div className="search-body" ref={listRef}>
              {showLoading && (
                <div className="search-state" aria-live="polite">
                  <Loader2 size={18} className="search-spinner" />
                  <span>正在建立搜索索引…</span>
                </div>
              )}

              {error && (
                <div className="search-state search-error" role="alert">
                  <span>{error}</span>
                  <button type="button" className="text-button" onClick={retry}>重试</button>
                </div>
              )}

              {showNoArticles && (
                <div className="search-state">
                  <span>还没有文章可以搜索。</span>
                  <span className="search-hint">在 content/posts/ 添加 Markdown 文件后，搜索索引会自动更新。</span>
                </div>
              )}

              {showIdle && (
                <div className="search-state">
                  <span>输入关键词即可搜索全部已发布文章。</span>
                  <span className="search-hint"><kbd>↑</kbd><kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭</span>
                </div>
              )}

              {showEmpty && (
                <div className="search-state">
                  <span>没有找到「{query.trim()}」相关的文章。</span>
                  <span className="search-hint">试试更短的关键词，或从标签页浏览。</span>
                </div>
              )}

              {!showLoading && !error && results.length > 0 && (
                <div className="search-results" role="listbox" aria-label="搜索结果">
                  {results.map((result, index) => (
                    <button
                      key={result.slug}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      data-index={index}
                      className={index === activeIndex ? 'search-result active' : 'search-result'}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(result.slug)}
                    >
                      <span className="search-result-main">
                        <strong>{result.title}</strong>
                        <span className="search-snippet">{result.snippet}</span>
                        <span className="search-result-meta">
                          {formatDate(result.published_at)} · {result.read_time} 分钟阅读
                          {result.tags.length > 0 && ` · ${result.tags.map((tag) => `#${tag}`).join(' ')}`}
                        </span>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="search-footer">
              <span>{results.length > 0 ? `${results.length} 条结果` : '站内搜索'}</span>
              <span>索引来自本地 Markdown 内容</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
