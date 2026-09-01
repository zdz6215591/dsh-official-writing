import { useCallback, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { Editor } from '@tiptap/react'
import { EXCLUSIVE_REWRITE_GROUPS, isEncrypted, type DocumentContext, type RewriteMode, type TaskRouting } from '../../shared/types.ts'
import { cleanModelText } from '../../shared/prompts.ts'
import { rewriteMarkKey } from '../extensions/RewriteMark.ts'
import { runStreamingJob } from '../remote.ts'

const MODES: { id: RewriteMode; label: string }[] = [
  { id: 'expand', label: '扩写' },
  { id: 'shorten', label: '缩写' },
  { id: 'abstract', label: '写虚' },
  { id: 'concrete', label: '写实' },
  { id: 'professional', label: '专业' },
  { id: 'plain', label: '通俗' },
  { id: 'reference', label: '糅入参考' },
  { id: 'custom', label: '自定义' },
]

type Phase = 'pick' | 'loading' | 'done' | 'error'

function toggleMode(selected: RewriteMode[], id: RewriteMode): RewriteMode[] {
  if (selected.includes(id)) return selected.filter((m) => m !== id)
  let next = [...selected, id]
  for (const group of EXCLUSIVE_REWRITE_GROUPS) {
    if (group.includes(id)) next = next.filter((m) => m === id || !group.includes(m))
  }
  return next
}

function rangeCoords(editor: Editor, from: number, to: number) {
  try {
    const a = editor.view.coordsAtPos(from)
    const b = editor.view.coordsAtPos(Math.max(from, Math.min(to, editor.state.doc.content.size)))
    return {
      top: Math.max(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      midX: (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2,
    }
  } catch {
    return null
  }
}

export function RewritePanel({
  ctx,
  editor,
  open,
  selectedText,
  from: initialFrom,
  to: initialTo,
  initialMode = 'expand',
  docCtx,
  routing,
  localReady,
  onClose,
  onReplaced,
  onError,
}: {
  ctx: Context
  editor: Editor | null
  open: boolean
  selectedText: string
  from: number
  to: number
  initialMode?: RewriteMode
  docCtx: DocumentContext | null
  routing: TaskRouting
  localReady: boolean
  onClose: () => void
  onReplaced: (from: number, to: number, text: string) => void
  onError: (message: string) => void
}) {
  const [modes, setModes] = useState<RewriteMode[]>([initialMode])
  const [custom, setCustom] = useState('')
  const [reference, setReference] = useState('')
  const [result, setResult] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')
  const [error, setError] = useState('')
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(selectedText)
  const dragRef = useRef<{ ox: number; oy: number; sl: number; st: number } | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const updateBubblePos = useCallback(() => {
    if (!editor || !open) return
    const c = rangeCoords(editor, from, to)
    if (!c) return
    const bubbleW = phase === 'pick' || phase === 'error' ? 340 : 280
    const bubbleH = phase === 'loading' ? 52 : phase === 'done' ? 160 : 220
    let top = c.bottom + 8
    let left = c.midX - bubbleW / 2
    left = Math.min(Math.max(8, left), window.innerWidth - bubbleW - 8)
    const topbar = document.querySelector('.ow-paper-topbar') as HTMLElement | null
    const minTop = topbar ? topbar.getBoundingClientRect().bottom + 8 : 8
    if (top + bubbleH > window.innerHeight - 12) top = Math.max(minTop, c.top - bubbleH - 8)
    if (top < minTop) top = minTop
    setBubblePos({ top, left })
  }, [editor, open, from, to, phase])

  useEffect(() => {
    if (!open || !editor) return
    setModes([initialMode])
    setResult('')
    setError('')
    setCustom('')
    setReference('')
    setPhase('pick')
    setFrom(initialFrom)
    setTo(initialTo)
    setDragOffset({ x: 0, y: 0 })
    selectedRef.current = selectedText
    editor.commands.setRewriteMark(initialFrom, initialTo)
    return () => {
      editor.commands.clearRewriteMark()
      abortRef.current?.abort()
    }
  }, [open, selectedText, initialMode, initialFrom, initialTo, editor])

  useEffect(() => {
    if (!open || !editor) return
    const onTr = ({ transaction }: { transaction: any }) => {
      if (!transaction.docChanged) {
        updateBubblePos()
        return
      }
      const mark = rewriteMarkKey.getState(editor.state)
      if (mark) {
        setFrom(mark.from)
        setTo(mark.to)
      }
      requestAnimationFrame(updateBubblePos)
    }
    editor.on('transaction', onTr)
    window.addEventListener('scroll', updateBubblePos, true)
    window.addEventListener('resize', updateBubblePos)
    updateBubblePos()
    return () => {
      editor.off('transaction', onTr)
      window.removeEventListener('scroll', updateBubblePos, true)
      window.removeEventListener('resize', updateBubblePos)
    }
  }, [open, editor, updateBubblePos])

  if (!open || !bubblePos) return null

  const run = async () => {
    if (modes.length === 0) {
      setError('请至少选择一项')
      return
    }
    if (modes.includes('reference') && !reference.trim()) {
      setError('请填写参考内容')
      return
    }
    if (modes.includes('custom') && !custom.trim()) {
      setError('请填写自定义要求')
      return
    }
    if (isEncrypted(docCtx) && !localReady) {
      onError('加密模式无可用本地模型，已禁用改写')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('loading')
    setResult('')
    setError('')
    const before = editor?.state.doc.textBetween(Math.max(0, from - 400), from, '\n') || ''
    const after =
      editor?.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 400), '\n') || ''
    let raw = ''
    try {
      await runStreamingJob(
        ctx,
        {
          task: 'rewrite',
          text: selectedRef.current,
          contextBefore: before,
          contextAfter: after,
          modes,
          custom,
          reference,
          docType: docCtx?.docType,
          title: docCtx?.title,
          intent: docCtx?.intent,
          encrypted: isEncrypted(docCtx),
          route: routing.rewrite,
          effort: routing.rewriteEffort,
        },
        {
          onDelta: (chunk) => {
            raw += chunk
            setResult(raw)
          },
        },
        ac.signal,
      )
      setResult(cleanModelText(raw))
      setPhase('done')
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setPhase('pick')
        return
      }
      setError(e.message || '改写失败')
      setPhase('error')
    }
  }

  const accept = () => {
    if (!editor || !result) return
    const text = cleanModelText(result)
    editor.chain().focus().insertContentAt({ from, to }, text).run()
    editor.commands.clearRewriteMark()
    onReplaced(from, from + text.length, text)
    onClose()
  }

  const ignore = () => {
    abortRef.current?.abort()
    editor?.commands.clearRewriteMark()
    onClose()
  }

  const needRef = modes.includes('reference')
  const needCustom = modes.includes('custom')
  const bubbleClass =
    phase === 'loading'
      ? 'ow-rewrite-bubble ow-rewrite-bubble-sm'
      : phase === 'done'
        ? 'ow-rewrite-bubble ow-rewrite-bubble-result'
        : 'ow-rewrite-bubble ow-rewrite-bubble-pick'

  const onDragHandle = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { ox: e.clientX, oy: e.clientY, sl: dragOffset.x, st: dragOffset.y }
  }
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setDragOffset({
      x: dragRef.current.sl + e.clientX - dragRef.current.ox,
      y: dragRef.current.st + e.clientY - dragRef.current.oy,
    })
  }
  const onDragEnd = () => {
    dragRef.current = null
  }

  return (
    <div
      className={bubbleClass}
      ref={popRef}
      style={{ top: bubblePos.top + dragOffset.y, left: bubblePos.left + dragOffset.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {phase === 'loading' && (
        <div className="ow-rewrite-bubble-loading">
          <span
            className="ow-rewrite-drag"
            title="拖动"
            onPointerDown={onDragHandle}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            ⠿
          </span>
          <span className="ow-rewrite-bubble-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span>改写中</span>
        </div>
      )}
      {phase === 'done' && (
        <div className="ow-rewrite-bubble-body">
          <div className="ow-rewrite-pop-head">
            <span
              className="ow-rewrite-drag"
              title="拖动"
              onPointerDown={onDragHandle}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
            >
              ⠿
            </span>
            <strong>改写结果</strong>
          </div>
          <div className="ow-rewrite-bubble-text">{result}</div>
          <div className="ow-rewrite-bubble-actions">
            <button type="button" className="ow-btn ghost sm" onClick={ignore}>
              忽略
            </button>
            <button
              type="button"
              className="ow-btn ghost sm"
              onClick={() => {
                void navigator.clipboard.writeText(result)
              }}
            >
              复制
            </button>
            <button type="button" className="ow-btn primary sm" onClick={accept}>
              替换
            </button>
          </div>
        </div>
      )}
      {(phase === 'pick' || phase === 'error') && (
        <div className="ow-rewrite-bubble-body">
          <div className="ow-rewrite-pop-head">
            <span
              className="ow-rewrite-drag"
              title="拖动"
              onPointerDown={onDragHandle}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
            >
              ⠿
            </span>
            <strong>改写</strong>
            <button type="button" className="ow-icon-btn" onClick={ignore} aria-label="关闭">
              ×
            </button>
          </div>
          <div className="ow-rewrite-modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={modes.includes(m.id) ? 'active' : ''}
                onClick={() => setModes((prev) => toggleMode(prev, m.id))}
              >
                {m.label}
              </button>
            ))}
          </div>
          {needRef && (
            <textarea placeholder="粘贴参考内容…" value={reference} onChange={(e) => setReference(e.target.value)} rows={2} />
          )}
          {needCustom && (
            <textarea placeholder="自定义要求…" value={custom} onChange={(e) => setCustom(e.target.value)} rows={2} />
          )}
          {error && <div className="ow-error-text">{error}</div>}
          <div className="ow-rewrite-bubble-actions">
            <button type="button" className="ow-btn ghost sm" onClick={ignore}>
              取消
            </button>
            <button type="button" className="ow-btn primary sm" disabled={modes.length === 0} onClick={() => void run()}>
              开始改写
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
