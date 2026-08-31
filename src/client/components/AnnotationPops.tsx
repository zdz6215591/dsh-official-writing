import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { AuditIssue } from '../../shared/types.ts'
import { locateInText } from '../../shared/locate.ts'
import { getDocPlainText, offsetsToRange } from '../extensions/docText.ts'

const TYPE_LABEL: Record<string, string> = {
  typo: '错别字',
  polish: '润色',
  insert: '补充',
}

function colorOf(type: string) {
  if (type === 'typo') return '#dc2626'
  if (type === 'insert') return '#16a34a'
  return '#d97706'
}

type Pop = { id: string; top: number; left: number; issue: AuditIssue }

export function AnnotationPops({
  editor,
  issues,
  activeId,
  paperRef,
  onHover,
  onAccept,
  onDismiss,
  onFocusIssue,
}: {
  editor: Editor | null
  issues: AuditIssue[]
  activeId: string | null
  paperRef: React.RefObject<HTMLElement | null>
  onHover: (id: string | null) => void
  onAccept: (issue: AuditIssue) => void
  onDismiss: (id: string) => void
  onFocusIssue: (id: string) => void
}) {
  const [pops, setPops] = useState<Pop[]>([])

  const paint = useMemo(
    () => () => {
      const paper = paperRef.current
      if (!editor || !paper || !issues.length) {
        setPops([])
        return
      }
      const paperRect = paper.getBoundingClientRect()
      const { text, map } = getDocPlainText(editor.state.doc)
      const next: Pop[] = []
      const used: number[] = []
      for (const issue of issues) {
        const loc = locateInText(text, issue)
        if (!loc) continue
        const range = offsetsToRange(map, loc.start, loc.end, editor.state.doc.content.size)
        if (!range) continue
        let top = 0
        try {
          const coords = editor.view.coordsAtPos(range.from)
          top = coords.top - paperRect.top + paper.scrollTop
        } catch {
          continue
        }
        for (const prev of used) {
          if (Math.abs(top - prev) < 56) top = prev + 56
        }
        used.push(top)
        next.push({
          id: issue.id,
          top,
          left: Math.max(12, paper.clientWidth - 228),
          issue,
        })
      }
      setPops(next)
    },
    [editor, issues, paperRef],
  )

  useEffect(() => {
    paint()
    const paper = paperRef.current
    paper?.addEventListener('scroll', paint, true)
    window.addEventListener('resize', paint)
    const timer = window.setInterval(paint, 500)
    return () => {
      paper?.removeEventListener('scroll', paint, true)
      window.removeEventListener('resize', paint)
      window.clearInterval(timer)
    }
  }, [paint, paperRef])

  if (!pops.length) return null
  return (
    <div className="ow-anno-layer" aria-live="polite">
      {pops.map((pop) => (
        <article
          key={pop.id}
          data-anno-id={pop.id}
          className={`ow-anno-pop type-${pop.issue.type}${activeId === pop.id ? ' active' : ''}`}
          style={{ top: pop.top, left: pop.left }}
          onMouseEnter={() => onHover(pop.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onFocusIssue(pop.id)}
        >
          <div className="ow-anno-kicker" style={{ color: colorOf(pop.issue.type) }}>
            {TYPE_LABEL[pop.issue.type] || pop.issue.type}
          </div>
          <p className="ow-anno-change">
            <span className="ow-anno-orig">{pop.issue.original || '（插入）'}</span>
            <span className="ow-anno-arrow"> → </span>
            <span className="ow-anno-sug">{pop.issue.suggestion}</span>
          </p>
          {pop.issue.reason ? <p className="ow-anno-reason">{pop.issue.reason}</p> : null}
          <div className="ow-anno-actions">
            <button
              type="button"
              className="ow-linkish"
              onClick={(e) => {
                e.stopPropagation()
                onAccept(pop.issue)
              }}
            >
              采纳
            </button>
            <button
              type="button"
              className="ow-linkish muted"
              onClick={(e) => {
                e.stopPropagation()
                onDismiss(pop.id)
              }}
            >
              忽略
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
