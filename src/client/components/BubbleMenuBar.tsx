import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { RewriteMode } from '../../shared/types.ts'

const QUICK: { mode: RewriteMode; label: string }[] = [
  { mode: 'expand', label: '扩写' },
  { mode: 'shorten', label: '缩写' },
  { mode: 'abstract', label: '写虚' },
  { mode: 'concrete', label: '写实' },
  { mode: 'professional', label: '专业' },
  { mode: 'plain', label: '通俗' },
  { mode: 'reference', label: '糅入参考' },
  { mode: 'custom', label: '自定义' },
]

export function BubbleMenuBar({
  editor,
  hidden,
  onRewrite,
}: {
  editor: Editor | null
  hidden?: boolean
  onRewrite: (payload: { text: string; from: number; to: number; mode: RewriteMode }) => void
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [sel, setSel] = useState<{ text: string; from: number; to: number } | null>(null)

  useEffect(() => {
    if (!editor) return
    let pointerDown = false
    let timer = 0
    const hide = () => {
      setCoords(null)
      setSel(null)
    }
    const show = () => {
      if (hidden || pointerDown) {
        hide()
        return
      }
      const { from, to, empty } = editor.state.selection
      if (empty) {
        hide()
        return
      }
      const text = editor.state.doc.textBetween(from, to, '\n')
      if (!text.trim()) {
        hide()
        return
      }
      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)
      setCoords({ top: Math.min(start.top, end.top) - 8, left: (start.left + end.left) / 2 })
      setSel({ text, from, to })
    }
    const onPointerDown = () => {
      pointerDown = true
      window.clearTimeout(timer)
      hide()
    }
    const onPointerUp = () => {
      pointerDown = false
      window.clearTimeout(timer)
      timer = window.setTimeout(show, 180)
    }
    const update = () => {
      if (pointerDown) {
        hide()
        return
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(show, 180)
    }
    editor.on('selectionUpdate', update)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('scroll', hide, true)
    return () => {
      editor.off('selectionUpdate', update)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('scroll', hide, true)
      window.clearTimeout(timer)
    }
  }, [editor, hidden])

  if (!coords || !sel || hidden) return null
  return (
    <div className="ow-bubble-menu" style={{ top: coords.top - 40, left: coords.left }}>
      {QUICK.map((q) => (
        <button
          key={q.mode}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onRewrite({ text: sel.text, from: sel.from, to: sel.to, mode: q.mode })
          }}
        >
          {q.label}
        </button>
      ))}
    </div>
  )
}
