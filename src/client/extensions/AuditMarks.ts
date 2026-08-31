import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { AuditIssue } from '../../shared/types.ts'
import { locateInText, tightenIssueSpan, visualMarkRange } from '../../shared/locate.ts'
import { getDocPlainText, offsetsToRange } from './docText.ts'

export type AppliedHighlight = { id: string; from: number; to: number }
export type AuditPluginState = {
  issues: AuditIssue[]
  activeId: string | null
  applied: AppliedHighlight[]
}

export const auditPluginKey = new PluginKey<AuditPluginState>('owAuditMarks')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    owAuditMarks: {
      setAuditIssues: (issues: AuditIssue[]) => ReturnType
      setActiveIssue: (id: string | null) => ReturnType
      clearAuditIssues: () => ReturnType
      applySuggestion: (issue: AuditIssue) => ReturnType
      markApplied: (id: string, from: number, to: number) => ReturnType
      dismissApplied: (id: string) => ReturnType
    }
  }
}

function buildDecorations(doc: any, state: AuditPluginState): DecorationSet {
  const decos: ReturnType<typeof Decoration.inline>[] = []
  const { text, map } = getDocPlainText(doc)
  for (const issue of state.issues) {
    const loc = visualMarkRange(text, issue)
    if (!loc) continue
    const range = offsetsToRange(map, loc.start, loc.end, doc.content.size)
    if (!range) continue
    const cls =
      issue.type === 'typo' ? 'ow-audit-typo' : issue.type === 'insert' ? 'ow-audit-insert' : 'ow-audit-polish'
    const active = state.activeId === issue.id ? ' ow-audit-active' : ''
    const index = state.issues.indexOf(issue) + 1
    decos.push(
      Decoration.inline(range.from, range.to, {
        class: `${cls}${active}`,
        'data-issue-id': issue.id,
        'data-issue-n': String(index),
      }),
    )
  }
  for (const applied of state.applied) {
    if (applied.from < applied.to && applied.to <= doc.content.size) {
      decos.push(
        Decoration.inline(applied.from, applied.to, {
          class: 'ow-audit-applied',
          'data-applied-id': applied.id,
        }),
      )
    }
  }
  return DecorationSet.create(doc, decos)
}

export const AuditMarks = Extension.create({
  name: 'owAuditMarks',
  addCommands() {
    return {
      setAuditIssues:
        (issues: AuditIssue[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'setIssues', issues }))
          return true
        },
      setActiveIssue:
        (id: string | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'setActive', id }))
          return true
        },
      clearAuditIssues:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'clear' }))
          return true
        },
      applySuggestion:
        (issue: AuditIssue) =>
        ({ state, tr, dispatch }) => {
          const { text, map } = getDocPlainText(state.doc)
          const loc = visualMarkRange(text, issue)
          if (!loc) return false
          const range = offsetsToRange(map, loc.start, loc.end, state.doc.content.size)
          if (!range) return false
          const replacement =
            issue.type === 'insert' ? issue.suggestion : String(tightenIssueSpan(issue).suggestion ?? issue.suggestion)
          if (issue.type === 'insert') {
            tr.insertText(replacement, range.to)
            tr.setMeta(auditPluginKey, {
              type: 'applied',
              issueId: issue.id,
              from: range.to,
              to: range.to + replacement.length,
            })
          } else {
            tr.insertText(replacement, range.from, range.to)
            tr.setMeta(auditPluginKey, {
              type: 'applied',
              issueId: issue.id,
              from: range.from,
              to: range.from + replacement.length,
            })
          }
          if (dispatch) dispatch(tr)
          return true
        },
      markApplied:
        (id: string, from: number, to: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'applied', issueId: id, from, to }))
          return true
        },
      dismissApplied:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'dismissApplied', id }))
          return true
        },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: auditPluginKey,
        state: {
          init: (): AuditPluginState => ({ issues: [], activeId: null, applied: [] }),
          apply(tr, value) {
            let next = value
            const meta = tr.getMeta(auditPluginKey) as
              | {
                  type: string
                  issues?: AuditIssue[]
                  id?: string | null
                  issueId?: string
                  from?: number
                  to?: number
                }
              | undefined
            if (meta) {
              if (meta.type === 'setIssues') next = { ...next, issues: meta.issues || [], activeId: null }
              else if (meta.type === 'setActive') next = { ...next, activeId: meta.id ?? null }
              else if (meta.type === 'clear') next = { issues: [], activeId: null, applied: next.applied }
              else if (meta.type === 'applied' && meta.issueId != null && meta.from != null && meta.to != null) {
                next = {
                  ...next,
                  issues: next.issues.filter((item) => item.id !== meta.issueId),
                  activeId: next.activeId === meta.issueId ? null : next.activeId,
                  applied: [...next.applied, { id: meta.issueId, from: meta.from, to: meta.to }],
                }
              } else if (meta.type === 'dismissApplied' && meta.id) {
                next = { ...next, applied: next.applied.filter((item) => item.id !== meta.id) }
              }
            }
            if (tr.docChanged) {
              const mapped = tr.mapping
              const { text } = getDocPlainText(tr.doc)
              next = {
                ...next,
                issues: next.issues.flatMap((issue) => {
                  const range = locateInText(text, issue)
                  return range ? [{ ...issue, start: range.start, end: range.end }] : []
                }),
                applied: next.applied
                  .map((item) => ({
                    id: item.id,
                    from: mapped.map(item.from),
                    to: mapped.map(item.to),
                  }))
                  .filter((item) => item.from < item.to),
              }
            }
            return next
          },
        },
        props: {
          decorations(state) {
            const st = auditPluginKey.getState(state)
            if (!st) return null
            return buildDecorations(state.doc, st)
          },
          handleDOMEvents: {
            mouseover(_view, event) {
              const id = (event.target as HTMLElement).closest?.('[data-issue-id]')?.getAttribute('data-issue-id')
              if (!id) return false
              const st = auditPluginKey.getState(_view.state)
              if (st?.activeId === id) return false
              _view.dispatch(_view.state.tr.setMeta(auditPluginKey, { type: 'setActive', id }))
              return false
            },
            mouseout(_view, event) {
              const from = event.target as HTMLElement
              const to = event.relatedTarget as HTMLElement | null
              if (from.closest?.('[data-issue-id]') && to?.closest?.('[data-issue-id]')) return false
              if (from.closest?.('[data-issue-id]')) {
                _view.dispatch(_view.state.tr.setMeta(auditPluginKey, { type: 'setActive', id: null }))
              }
              return false
            },
          },
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement
            const appliedId = target.closest?.('.ow-audit-applied')?.getAttribute('data-applied-id')
            if (appliedId) {
              view.dispatch(view.state.tr.setMeta(auditPluginKey, { type: 'dismissApplied', id: appliedId }))
              return true
            }
            const issueEl = target.closest?.('[data-issue-id]') as HTMLElement | null
            if (issueEl) {
              const id = issueEl.getAttribute('data-issue-id')
              view.dispatch(
                view.state.tr.setMeta(auditPluginKey, { type: 'setActive', id }).setMeta('ow-focus-issue', id),
              )
              return false
            }
            return false
          },
        },
      }),
    ]
  },
})
