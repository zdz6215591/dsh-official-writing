import { normalizeDocType } from '../shared/docTypes.ts'
import { coerceAuditType } from '../shared/locate.ts'
import type { AuditIssue, DocumentContext, TaskRouting } from '../shared/types.ts'

const KEY = 'dsh-official-writing/v1'
const POS_KEY = 'dsh-official-writing/float-pos'

export interface PersistedState {
  html: string
  issues: AuditIssue[]
  docCtx: DocumentContext | null
  wizardDone: boolean
  ghostOn: boolean
  deepOn: boolean
  routing: TaskRouting
}

const DEFAULT_ROUTING: TaskRouting = {
  autocomplete: '',
  audit: '',
  rewrite: '',
  auditEffort: '',
  rewriteEffort: '',
}

export const EMPTY_STATE: PersistedState = {
  html: '<h1></h1><p></p>',
  issues: [],
  docCtx: null,
  wizardDone: false,
  ghostOn: true,
  deepOn: false,
  routing: DEFAULT_ROUTING,
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_STATE }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const docCtx = parsed.docCtx
      ? {
          ...parsed.docCtx,
          docType: normalizeDocType(parsed.docCtx.docType),
          title: parsed.docCtx.title || parsed.docCtx.topic || '',
          intent: parsed.docCtx.intent || '',
          topic: parsed.docCtx.topic || parsed.docCtx.intent || parsed.docCtx.title || '',
        }
      : null
    return {
      html: typeof parsed.html === 'string' && parsed.html.trim() ? parsed.html : EMPTY_STATE.html,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((issue) => ({
            ...issue,
            type: coerceAuditType(issue.type, issue.reason || ''),
          }))
        : [],
      docCtx,
      wizardDone: Boolean(parsed.wizardDone && docCtx),
      ghostOn: parsed.ghostOn !== false,
      deepOn: parsed.deepOn === true,
      routing: { ...DEFAULT_ROUTING, ...(parsed.routing || {}) },
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

export function loadFloatPos(): { left: number; top: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { left?: number; top?: number }
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') return parsed as { left: number; top: number }
  } catch {
    /* ignore */
  }
  return null
}

export function saveFloatPos(pos: { left: number; top: number }): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  } catch {
    /* ignore */
  }
}

export function clearState(): void {
  localStorage.removeItem(KEY)
}
