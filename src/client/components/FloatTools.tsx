import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFloatPos, saveFloatPos } from '../storage.ts'

type Pos = { left: number; top: number }

function defaultPos(elW: number, elH: number): Pos {
  return {
    left: Math.max(12, (window.innerWidth - elW) / 2),
    top: Math.max(12, window.innerHeight - elH - 20),
  }
}

export function FloatTools({
  ghostOn,
  onGhostChange,
  deepOn,
  onDeepChange,
  auditing,
  onAudit,
  onSettings,
  onGuide,
}: {
  ghostOn: boolean
  onGhostChange: (on: boolean) => void
  deepOn: boolean
  onDeepChange: (on: boolean) => void
  auditing: boolean
  onAudit: (depth: 'quick' | 'deep') => void
  onSettings: () => void
  onGuide: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const drag = useRef<{ ox: number; oy: number; sl: number; st: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const saved = loadFloatPos()
    const rect = el.getBoundingClientRect()
    if (saved) {
      setPos({
        left: Math.min(Math.max(8, saved.left), window.innerWidth - rect.width - 8),
        top: Math.min(Math.max(8, saved.top), window.innerHeight - rect.height - 8),
      })
    } else {
      setPos(defaultPos(rect.width, rect.height))
    }
  }, [])

  const clamp = useCallback((left: number, top: number): Pos => {
    const el = ref.current
    const w = el?.offsetWidth || 320
    const h = el?.offsetHeight || 48
    return {
      left: Math.min(Math.max(8, left), window.innerWidth - w - 8),
      top: Math.min(Math.max(8, top), window.innerHeight - h - 8),
    }
  }, [])

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.left, p.top) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('button, label.ow-tool-chip, input, a, .ow-audit-combo')) return
    if (!pos) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { ox: e.clientX, oy: e.clientY, sl: pos.left, st: pos.top, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.ox
    const dy = e.clientY - drag.current.oy
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true
    setPos(clamp(drag.current.sl + dx, drag.current.st + dy))
  }

  const onPointerUp = () => {
    if (drag.current?.moved && pos) saveFloatPos(pos)
    drag.current = null
  }

  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, transform: 'none' }
    : { left: '50%', bottom: 20, top: 'auto', transform: 'translateX(-50%)' }

  return (
    <div
      ref={ref}
      className="ow-float-tools"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="ow-float-drag-handle" title="拖动" aria-hidden>
        ⠿
      </span>
      <button type="button" className="ow-tool-chip" onClick={onSettings}>
        模型设置
      </button>
      <button type="button" className="ow-tool-chip" onClick={onGuide}>
        修改文体
      </button>
      <span className="ow-float-tools-sep" aria-hidden />
      <label className={`ow-tool-chip ow-toggle-chip ${ghostOn ? 'on' : ''}`} title="智能联想（始终不使用深度思考）">
        <input type="checkbox" checked={ghostOn} onChange={(e) => onGhostChange(e.target.checked)} />
        <span className="ow-toggle-track" aria-hidden />
        <span className="ow-tool-chip-label">联想</span>
      </label>
      <div className={`ow-audit-combo ${deepOn ? 'deep' : ''}`} title={deepOn ? '深度校验（开思考）' : '快速校验（关思考）'}>
        <button
          type="button"
          className={`ow-audit-combo-depth ${deepOn ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onDeepChange(!deepOn)
          }}
          disabled={auditing}
        >
          <span className="ow-toggle-track mini" aria-hidden />
          深度
        </button>
        <button
          type="button"
          className="ow-audit-combo-run"
          onClick={() => onAudit(deepOn ? 'deep' : 'quick')}
          disabled={auditing}
        >
          {auditing ? '校验中…' : '校验'}
        </button>
      </div>
    </div>
  )
}
