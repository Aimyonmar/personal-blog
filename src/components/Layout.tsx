import { LogIn, LogOut, Menu, PenLine, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { AuthDialog } from './AuthDialog'
import { ReadingPreferencesPanel } from './ReadingPreferencesPanel'
import { SearchCommand } from './SearchCommand'
import { SideToolbar } from './SideToolbar'

const navItems = [
  { to: '/', label: '文章' },
  { to: '/tags', label: '标签' },
  { to: '/about', label: '关于' },
]

function userLabel(phone?: string, email?: string) {
  if (phone && phone.length >= 7) return `${phone.slice(0, 3)}****${phone.slice(-4)}`
  if (email) return email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
  return '已登录'
}

export function Layout() {
  const { user, loading, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

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
          {user && (
            <>
              <NavLink to="/write" onClick={() => setMenuOpen(false)}>
                写文章
              </NavLink>
              <NavLink to="/drafts" onClick={() => setMenuOpen(false)}>
                草稿箱
              </NavLink>
            </>
          )}
        </nav>

        <div className="header-actions">
          <SearchCommand />
          <ReadingPreferencesPanel />
          {loading ? (
            <span className="auth-loading">账号加载中</span>
          ) : user ? (
            <div className="user-actions">
              <span className="user-chip">{userLabel(user.phone ?? user.phoneNumber, user.email)}</span>
              <NavLink className="icon-button" to="/write" aria-label="写文章">
                <PenLine size={18} />
              </NavLink>
              <button className="icon-button" type="button" onClick={() => void signOut()} aria-label="退出登录">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button className="login-button" type="button" onClick={() => setAuthOpen(true)}>
              <LogIn size={17} />
              登录
            </button>
          )}
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

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
