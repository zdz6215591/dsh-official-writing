import { useEffect } from 'react'

export type ToastState = {
  id: number
  message: string
  type?: 'info' | 'success' | 'error'
} | null

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onDismiss, toast.type === 'error' ? 8000 : 2600)
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])
  if (!toast) return null
  return (
    <div className={`ow-toast type-${toast.type || 'info'}`} role="status">
      {toast.message}
    </div>
  )
}
