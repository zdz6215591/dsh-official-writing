import { useEffect } from 'react'

export type ToastState = {
  id: number
  message: string
  type?: 'info' | 'success' | 'error'
} | null

export function Toast({
  toast,
  onDismiss,
  duration = 2600,
}: {
  toast: ToastState
  onDismiss: () => void
  duration?: number
}) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(timer)
  }, [toast, duration, onDismiss])
  if (!toast) return null
  return (
    <div className={`ow-toast type-${toast.type || 'info'}`} role="status">
      {toast.message}
    </div>
  )
}
