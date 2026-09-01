import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { AuditIssue } from '../../shared/types.ts'
import { tightenIssueSpan } from '../../shared/locate.ts'
import { mapPinnedIssue, markSliceValid, pinIssuesToDoc } from './docText.ts'

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
      removeAuditIssue: (id: string) => ReturnType
      applySuggestion: (issue: AuditIssue) => ReturnType
      markApplied: (id: string, from: number, to: number) => ReturnType
      dismissApplied: (id: string) => ReturnType
    }
  }
}

function liveIssue(state: AuditPluginState | undefined, issue: AuditIssue): AuditIssue {
  return state?.issues.find((item) => item.id === issue.id) || issue
}

function markStillValid(doc: { content: { size: number }; textBetween: Function }, issue: AuditIssue): boolean {
  return markSliceValid(doc, issue)
}

function buildDecorations(doc: any, state: AuditPluginState): DecorationSet {
  const decos: ReturnType<typeof Decoration.inline>[] = []
  state.issues.forEach((issue, index) => {
    if (!markStillValid(doc, issue)) return
    const cls =
      issue.type === 'typo' ? 'ow-audit-typo' : issue.type === 'insert' ? 'ow-audit-insert' : 'ow-audit-polish'
    const active = state.activeId === issue.id ? ' ow-audit-active' : ''
    decos.push(
      Decoration.inline(issue.from!, issue.to!, {
        class: `${cls}${active}`,
        'data-issue-id': issue.id,
        'data-issue-n': String(index + 1),
      }),
    )
  })
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
        ({ state, tr, dispatch }) => {
          const pinned = issues.every((item) => typeof item.from === 'number' && typeof item.to === 'number')
            ? issues
            : pinIssuesToDoc(state.doc, issues)
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'setIssues', issues: pinned }))
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
      removeAuditIssue:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(auditPluginKey, { type: 'remove', id }))
          return true
        },
      applySuggestion:
        (issue: AuditIssue) =>
        ({ state, tr, dispatch }) => {
          const live = liveIssue(auditPluginKey.getState(state), issue)
          if (!markStillValid(state.doc, live)) return false
          const from = live.from!
          const to = live.to!
          const replacement =
            live.type === 'insert' ? live.suggestion : String(tightenIssueSpan(live).suggestion ?? live.suggestion)
          if (live.type === 'insert') {
            tr.insertText(replacement, to)
            tr.setMeta(auditPluginKey, {
              type: 'applied',
              issueId: live.id,
              from: to,
              to: to + replacement.length,
            })
          } else {
            tr.insertText(replacement, from, to)
            tr.setMeta(auditPluginKey, {
              type: 'applied',
              issueId: live.id,
              from,
              to: from + replacement.length,
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
              else if (meta.type === 'remove' && meta.id) {
                next = {
                  ...next,
                  issues: next.issues.filter((item) => item.id !== meta.id),
                  activeId: next.activeId === meta.id ? null : next.activeId,
                }
              } else if (meta.type === 'applied' && meta.issueId != null && meta.from != null && meta.to != null) {
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
              next = {
                ...next,
                issues: next.issues.flatMap((issue) => {
                  const pinned = mapPinnedIssue(issue, mapped, tr.doc.content.size)
                  return pinned && markStillValid(tr.doc, pinned) ? [pinned] : []
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
