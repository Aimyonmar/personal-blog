import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** 捕获渲染期异常，避免单页错误导致整站白屏。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染出错：', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="error-boundary" role="alert">
        <p className="error-boundary-kicker">Something went wrong</p>
        <h1>页面出了点问题</h1>
        <p>这一页没能正常渲染。可以先刷新重试，或回到首页继续阅读。</p>
        <div className="error-boundary-actions">
          <button type="button" onClick={() => window.location.reload()}>
            刷新页面
          </button>
          <a href="/">回到首页</a>
        </div>
        {import.meta.env.DEV && <pre>{error.message}</pre>}
      </div>
    )
  }
}
