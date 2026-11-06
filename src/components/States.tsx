export function LoadingState({ label = '正在加载内容' }: { label?: string }) {
  return (
    <div className="state-block" aria-live="polite">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block error-state" role="alert">
      <strong>内容暂时没有加载出来</strong>
      <p>{message}</p>
      {onRetry && <button className="secondary-button" type="button" onClick={onRetry}>重新加载</button>}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-block empty-state">
      <span className="empty-symbol" aria-hidden="true">—</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}
