import { Check, Copy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

function collectText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return collectText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function languageOf(children: ReactNode): string {
  const first = Array.isArray(children) ? children[0] : children
  if (!first || typeof first !== 'object' || !('props' in first)) return ''
  const className = (first as { props?: { className?: unknown } }).props?.className
  if (typeof className !== 'string') return ''
  return /language-([\w-]+)/.exec(className)?.[1] ?? ''
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  // 非安全上下文（http 访问）没有 Clipboard API，退回选中复制
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

/** 代码块：语言标签 + 一键复制。children 为 rehype-highlight 处理后的 <code>。 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  const code = useMemo(() => collectText(children).replace(/\n$/, ''), [children])
  const language = useMemo(() => languageOf(children), [children])

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const handleCopy = async () => {
    try {
      await copyText(code)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span className="code-block-lang">{language || 'text'}</span>
        <button
          className={copied ? 'code-copy copied' : 'code-copy'}
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? '已复制代码' : '复制代码'}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}
