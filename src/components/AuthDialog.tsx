import { useEffect, useState } from 'react'
import { MessageCircle, Phone, X } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { authError, clearAuthError, sendPhoneCode, verifyPhoneCode, signInWithWechat } = useAuth()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  if (!open) return null

  const requestCode = async () => {
    setBusy(true)
    const sent = await sendPhoneCode(phone)
    setBusy(false)
    if (sent) setCountdown(60)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const signedIn = await verifyPhoneCode(phone, code)
    setBusy(false)
    if (signedIn) onClose()
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="关闭登录窗口">
          <X size={18} />
        </button>
        <span className="eyebrow">MEMBER ACCESS</span>
        <h2 id="auth-title">登录微光手记</h2>
        <p className="dialog-intro">登录后可撰写文章，并查看云端图片与附件。</p>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>手机号</span>
            <div className="input-with-icon">
              <Phone size={17} />
              <input
                inputMode="numeric"
                autoComplete="tel"
                maxLength={11}
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value.replace(/\D/g, ''))
                  clearAuthError()
                }}
                placeholder="11 位中国大陆手机号"
              />
            </div>
          </label>
          <label className="field">
            <span>短信验证码</span>
            <div className="code-row">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''))
                  clearAuthError()
                }}
                placeholder="输入验证码"
              />
              <button className="text-button" type="button" onClick={requestCode} disabled={busy || countdown > 0}>
                {countdown > 0 ? `${countdown} 秒` : '获取验证码'}
              </button>
            </div>
          </label>
          {authError && <p className="field-error" role="alert">{authError}</p>}
          <button className="primary-button full-button" type="submit" disabled={busy}>
            {busy ? '正在验证…' : '登录 / 注册'}
          </button>
        </form>

        <div className="auth-divider"><span>或</span></div>
        <button className="secondary-button full-button" type="button" onClick={() => void signInWithWechat()}>
          <MessageCircle size={18} />
          微信快捷登录
        </button>
        <p className="auth-footnote">继续即表示你同意仅将账号用于本站内容管理和文件访问。</p>
      </section>
    </div>
  )
}
