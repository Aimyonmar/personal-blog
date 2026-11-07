import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ReadingPreferencesPanel } from './ReadingPreferencesPanel'
import { SearchCommand } from './SearchCommand'
import { SideToolbar } from './SideToolbar'

const navItems = [
  { to: '/', label: '文章' },
  { to: '/tags', label: '标签' },
  { to: '/about', label: '关于' },
  ...(import.meta.env.DEV ? [{ to: '/write', label: '写作' }] : []),
]

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="微光手记首页">
          <span>
            <strong>微光手记</strong>
            <small>GLOW NOTES</small>
          </span>
        </NavLink>

        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="主导航">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setMenuOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <SearchCommand />
          <ReadingPreferencesPanel />
          <button className="menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? '关闭菜单' : '打开菜单'}>
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <SideToolbar />

      <main id="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div>
          <span className="footer-wordmark" aria-hidden="true">微光手记</span>
          <p>在代码、产品与生活之间，记录值得复访的微小发现。</p>
        </div>
        <div className="footer-meta">
          <span>TECH · LIFE · NOTES</span>
          <span>© {new Date().getFullYear()} GLOW NOTES</span>
        </div>
      </footer>
    </div>
  )
}
