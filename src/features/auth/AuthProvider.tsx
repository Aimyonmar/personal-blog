import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cloud } from '../../app/cloud'
import type { AuthSession, AuthUser } from '../../app/types'

type PendingOtp = {
  phone: string
  verificationId: string
  isExistingUser: boolean
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  authError: string
  clearAuthError: () => void
  sendPhoneCode: (phone: string) => Promise<boolean>
  verifyPhoneCode: (phone: string, token: string) => Promise<boolean>
  signInWithWechat: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function friendlyAuthError(error: unknown) {
  const candidate = error as { kind?: string; message?: string }
  if (candidate.kind === 'network') return '网络暂时不可用，请稍后再试。'
  if (candidate.kind === 'backend-unavailable') return '登录服务暂时繁忙，请稍后再试。'
  if (candidate.kind === 'invalid_grant') return '验证码无效或已过期，请重新获取。'
  return candidate.message || '登录失败，请稍后重试。'
}

function toUser(session: AuthSession | null | undefined) {
  return session?.user ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const pendingOtp = useRef<PendingOtp | null>(null)

  useEffect(() => {
    let active = true

    const boot = async () => {
      try {
        const callback = await cloud.auth.handleWechatWebCallback()
        if (!active) return
        if (callback.error) {
          setAuthError(friendlyAuthError(callback.error))
        } else if (callback.data) {
          window.history.replaceState(null, '', window.location.pathname + window.location.hash)
          setUser(toUser(callback.data as AuthSession))
        } else {
          const session = await cloud.auth.getSession()
          if (session.error) setAuthError(friendlyAuthError(session.error))
          setUser(toUser(session.data as AuthSession | null))
        }
      } catch (error) {
        if (active) setAuthError(friendlyAuthError(error))
      } finally {
        if (active) setLoading(false)
      }
    }

    void boot()
    const subscription = cloud.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(toUser(session as AuthSession | null))
    })

    return () => {
      active = false
      if (typeof subscription === 'function') subscription()
    }
  }, [])

  const sendPhoneCode = useCallback(async (phone: string) => {
    setAuthError('')
    if (!/^1\d{10}$/.test(phone)) {
      setAuthError('请输入正确的 11 位手机号')
      return false
    }

    const sent = await cloud.auth.sendOtp({ phone })
    if (sent.error) {
      setAuthError(friendlyAuthError(sent.error))
      return false
    }

    pendingOtp.current = {
      phone,
      verificationId: sent.data.verificationId,
      isExistingUser: sent.data.isExistingUser,
    }
    return true
  }, [])

  const verifyPhoneCode = useCallback(async (phone: string, token: string) => {
    setAuthError('')
    const pending = pendingOtp.current
    if (!pending || pending.phone !== phone) {
      setAuthError('请先为当前手机号获取验证码。')
      return false
    }
    if (!/^\d{4,8}$/.test(token)) {
      setAuthError('请输入短信中的验证码。')
      return false
    }

    const completed = await cloud.auth.verifyOtp({
      phone: pending.phone,
      verificationId: pending.verificationId,
      isExistingUser: pending.isExistingUser,
      token,
    })
    if (completed.error) {
      setAuthError(friendlyAuthError(completed.error))
      return false
    }

    pendingOtp.current = null
    setUser(toUser(completed.data as AuthSession))
    return true
  }, [])

  const signInWithWechat = useCallback(async () => {
    setAuthError('')
    const result = await cloud.auth.signInWithOAuth({
      provider: 'wechat',
      redirectTo: window.location.origin,
    })
    if (result.error) {
      setAuthError(friendlyAuthError(result.error))
      return
    }
    window.location.assign(result.data.url)
  }, [])

  const signOut = useCallback(async () => {
    setAuthError('')
    const result = await cloud.auth.signOut()
    if (result.error) {
      setAuthError(friendlyAuthError(result.error))
      return
    }
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    authError,
    clearAuthError: () => setAuthError(''),
    sendPhoneCode,
    verifyPhoneCode,
    signInWithWechat,
    signOut,
  }), [authError, loading, sendPhoneCode, signInWithWechat, signOut, user, verifyPhoneCode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
