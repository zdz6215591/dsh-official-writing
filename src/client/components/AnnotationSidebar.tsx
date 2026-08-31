import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import type { AuditIssue } from '../../shared/types.ts'
import { locateInText, tightenIssueSpan } from '../../shared/locate.ts'
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

export function AnnotationSidebar({
  editor,
  issues,
  activeId,
  auditing,
  paperRef,
  onHover,
  onAccept,
  onDismiss,
  onDismissAll,
  onFocusIssue,
}: {
  editor: Editor | null
  issues: AuditIssue[]
  activeId: string | null
  auditing: boolean
  paperRef?: React.RefObject<HTMLElement | null>
  onHover: (id: string | null) => void
  onAccept: (issue: AuditIssue) => void
  onDismiss: (id: string) => void
  onDismissAll: () => void
  onFocusIssue: (id: string) => void
}) {
  const paneRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})

  const scrollCardIntoView = useCallback((id: string) => {
    const el = cardRefs.current[id]
    const pane = scrollRef.current
    if (!el || !pane) return
    const pad = 12
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top >= pane.scrollTop + pad && bottom <= pane.scrollTop + pane.clientHeight - pad) return
    pane.scrollTo({ top: Math.max(0, top - pane.clientHeight * 0.28), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const dom = editor?.view?.dom
    if (!dom) return
    const onClick = (event: Event) => {
      const id = (event.target as HTMLElement).closest?.('[data-issue-id]')?.getAttribute('data-issue-id')
      if (id) scrollCardIntoView(id)
    }
    dom.addEventListener('click', onClick)
    return () => dom.removeEventListener('click', onClick)
  }, [editor, scrollCardIntoView])

  return (
    <aside className="ow-comment-pane" ref={paneRef as React.RefObject<HTMLElement>}>
      <div className="ow-comment-pane-head">
        <div className="ow-comment-head-left">
          <h3>批注</h3>
          {issues.length > 0 && <span className="ow-comment-count">{issues.length}</span>}
        </div>
        {auditing ? (
          <span className="ow-comment-busy">校验中</span>
        ) : issues.length > 0 ? (
          <button type="button" className="ow-btn ghost sm" onClick={onDismissAll}>
            全部忽略
          </button>
        ) : null}
      </div>
      <div className="ow-comment-scroll" ref={scrollRef}>
        {issues.length === 0 ? (
          <div className="ow-comment-empty">{auditing ? '正在审阅全文…' : '校验后显示批注。可独立滚动本栏。'}</div>
        ) : (
          issues.map((issue, index) => (
            <article
              key={issue.id}
              data-anno-id={issue.id}
              ref={(el) => {
                cardRefs.current[issue.id] = el
              }}
              className={`ow-anno-card type-${issue.type} ${activeId === issue.id ? 'active' : ''}`}
              onMouseEnter={() => onHover(issue.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => {
                onFocusIssue(issue.id)
                scrollCardIntoView(issue.id)
              }}
            >
              <div className="ow-anno-kicker" style={{ color: colorOf(issue.type) }}>
                <span className="ow-anno-n">{index + 1}</span>
                {TYPE_LABEL[issue.type] || issue.type}
              </div>
              <p className="ow-anno-change">
                {(() => {
                  const tight = tightenIssueSpan(issue)
                  return (
                    <>
                      <span className="ow-anno-orig">{tight.original || issue.original || '（插入）'}</span>
                      <span className="ow-anno-arrow"> → </span>
                      <span className="ow-anno-sug">{tight.suggestion ?? issue.suggestion}</span>
                    </>
                  )
                })()}
              </p>
              {issue.reason ? <p className="ow-anno-reason">{issue.reason}</p> : null}
              <div className="ow-anno-actions">
                <button
                  type="button"
                  className="ow-linkish"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAccept(issue)
                  }}
                >
                  采纳
                </button>
                <button
                  type="button"
                  className="ow-linkish muted"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDismiss(issue.id)
                  }}
                >
                  忽略
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  )
}

export function focusIssueInDoc(
  editor: Editor,
  issue: AuditIssue,
  docScrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const { text, map } = getDocPlainText(editor.state.doc)
  const loc = locateInText(text, issue)
  if (!loc) return
  const range = offsetsToRange(map, loc.start, loc.end, editor.state.doc.content.size)
  if (!range) return
  try {
    const coords = editor.view.coordsAtPos(range.from)
    const docEl = docScrollRef.current
    if (!docEl) return
    const docRect = docEl.getBoundingClientRect()
    const maxScroll = Math.max(0, docEl.scrollHeight - docEl.clientHeight)
    const target = coords.top - docRect.top + docEl.scrollTop - docEl.clientHeight * 0.28
    docEl.scrollTo({ top: Math.max(0, Math.min(maxScroll, target)), behavior: 'smooth' })
  } catch {
    /* ignore */
  }
}
