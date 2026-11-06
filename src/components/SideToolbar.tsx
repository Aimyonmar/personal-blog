import { ArrowUp, Check, Info, Link2, PenLine, Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'

export function SideToolbar() {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      /* 剪贴板 API 不可用时保持原状，不提示 */
    }
  }

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <aside className="side-toolbar" aria-label="快捷工具栏">
      <button className="side-tool" type="button" onClick={toTop} data-tip="回到顶部" aria-label="回到顶部">
        <ArrowUp size={17} />
      </button>
      <button
        className="side-tool"
        type="button"
        onClick={() => void copyLink()}
        data-tip={copied ? '已复制' : '复制本页链接'}
        aria-label="复制本页链接"
      >
        {copied ? <Check size={17} /> : <Link2 size={17} />}
      </button>
      <span className="side-tool-sep" aria-hidden="true" />
      <NavLink className="side-tool" to="/tags" data-tip="标签分类" aria-label="标签分类">
        <Tags size={17} />
      </NavLink>
      <NavLink className="side-tool" to="/about" data-tip="关于本站" aria-label="关于本站">
        <Info size={17} />
      </NavLink>
      {user && (
        <NavLink className="side-tool" to="/write" data-tip="写文章" aria-label="写文章">
          <PenLine size={17} />
        </NavLink>
      )}
    </aside>
  )
}
