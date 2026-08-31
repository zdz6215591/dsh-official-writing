import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { AuditIssue } from '../../shared/types.ts'
import { locateInText } from '../../shared/locate.ts'
import { getDocPlainText, offsetsToRange } from '../extensions/docText.ts'

type Line = { id: string; x1: number; y1: number; x2: number; y2: number; active: boolean }

export function CommentConnectors({
  editor,
  issues,
  activeId,
  stageRef,
}: {
  editor: Editor | null
  issues: AuditIssue[]
  activeId: string | null
  stageRef: React.RefObject<HTMLElement | null>
}) {
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    const paint = () => {
      const stage = stageRef.current
      if (!editor || !stage || !issues.length) {
        setLines([])
        return
      }
      const stageRect = stage.getBoundingClientRect()
      const { text, map } = getDocPlainText(editor.state.doc)
      const next: Line[] = []
      for (const issue of issues) {
        const loc = locateInText(text, issue)
        if (!loc) continue
        const range = offsetsToRange(map, loc.start, loc.end, editor.state.doc.content.size)
        if (!range) continue
        let mark: DOMRect
        try {
          const start = editor.view.coordsAtPos(range.from)
          const end = editor.view.coordsAtPos(Math.max(range.from, range.to - 1))
          mark = new DOMRect(
            Math.min(start.left, end.left),
            Math.min(start.top, end.top),
            Math.abs(end.right - start.left) || 8,
            Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top),
          )
        } catch {
          continue
        }
        const card = stage.querySelector(`[data-anno-id="${issue.id}"]`) as HTMLElement | null
        if (!card) continue
        const cardRect = card.getBoundingClientRect()
        next.push({
          id: issue.id,
          x1: mark.right - stageRect.left,
          y1: mark.top + mark.height / 2 - stageRect.top,
          x2: cardRect.left - stageRect.left,
          y2: cardRect.top + Math.min(28, cardRect.height / 2) - stageRect.top,
          active: activeId === issue.id,
        })
      }
      setLines(next)
    }
    paint()
    const stage = stageRef.current
    stage?.addEventListener('scroll', paint, true)
    window.addEventListener('resize', paint)
    const timer = window.setInterval(paint, 400)
    return () => {
      stage?.removeEventListener('scroll', paint, true)
      window.removeEventListener('resize', paint)
      window.clearInterval(timer)
    }
  }, [editor, issues, activeId, stageRef])

  if (!lines.length) return null
  return (
    <svg className="ow-connectors" aria-hidden>
      {lines.map((line) => (
        <path
          key={line.id}
          d={`M ${line.x1} ${line.y1} C ${line.x1 + 36} ${line.y1}, ${line.x2 - 36} ${line.y2}, ${line.x2} ${line.y2}`}
          className={line.active ? 'on' : ''}
        />
      ))}
    </svg>
  )
}
