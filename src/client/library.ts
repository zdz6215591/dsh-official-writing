import { normalizeDocType } from '../shared/docTypes.ts'
import { coerceAuditType } from '../shared/locate.ts'
import type { AuditIssue, DocumentContext, TaskRouting } from '../shared/types.ts'

const V1_KEY = 'dsh-official-writing/v1'
const KEY = 'dsh-official-writing/v2'
const POS_KEY = 'dsh-official-writing/float-pos'

export interface WritingDoc {
  id: string
  title: string
  html: string
  issues: AuditIssue[]
  docCtx: DocumentContext | null
  wizardDone: boolean
  updatedAt: number
}

export interface LibraryState {
  docs: WritingDoc[]
  activeId: string | null
  ghostAuto: boolean
  deepOn: boolean
  routing: TaskRouting
}

export const DEFAULT_ROUTING: TaskRouting = {
  autocomplete: '',
  audit: '',
  rewrite: '',
  auditEffort: '',
  rewriteEffort: '',
}

export const EMPTY_HTML = '<h1></h1><p></p>'

function newId() {
  return `ow-doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createDoc(partial?: Partial<WritingDoc>): WritingDoc {
  return {
    id: partial?.id || newId(),
    title: partial?.title || '未命名公文',
    html: partial?.html || EMPTY_HTML,
    issues: partial?.issues || [],
    docCtx: partial?.docCtx || null,
    wizardDone: Boolean(partial?.wizardDone && partial?.docCtx),
    updatedAt: partial?.updatedAt || Date.now(),
  }
}

function normalizeDoc(raw: Partial<WritingDoc>): WritingDoc {
  const docCtx = raw.docCtx
    ? {
        ...raw.docCtx,
        docType: normalizeDocType(raw.docCtx.docType),
        title: raw.docCtx.title || raw.docCtx.topic || '',
        intent: raw.docCtx.intent || '',
        topic: raw.docCtx.topic || raw.docCtx.intent || raw.docCtx.title || '',
      }
    : null
  return {
    id: raw.id || newId(),
    title: raw.title || docCtx?.title || '未命名公文',
    html: typeof raw.html === 'string' && raw.html.trim() ? raw.html : EMPTY_HTML,
    issues: Array.isArray(raw.issues)
      ? raw.issues.map((issue) => ({
          ...issue,
          type: coerceAuditType(issue.type, issue.reason || ''),
        }))
      : [],
    docCtx,
    wizardDone: Boolean(raw.wizardDone && docCtx),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

function migrateV1(): LibraryState | null {
  try {
    const raw = localStorage.getItem(V1_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      html?: string
      issues?: AuditIssue[]
      docCtx?: DocumentContext | null
      wizardDone?: boolean
      ghostOn?: boolean
      deepOn?: boolean
      routing?: TaskRouting
    }
    const doc = createDoc({
      title: parsed.docCtx?.title || '未命名公文',
      html: parsed.html,
      issues: parsed.issues,
      docCtx: parsed.docCtx,
      wizardDone: parsed.wizardDone,
    })
    return {
      docs: [doc],
      activeId: doc.id,
      ghostAuto: parsed.ghostOn !== false,
      deepOn: parsed.deepOn === true,
      routing: { ...DEFAULT_ROUTING, ...(parsed.routing || {}) },
    }
  } catch {
    return null
  }
}

export function loadLibrary(): LibraryState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LibraryState>
      const docs = Array.isArray(parsed.docs) ? parsed.docs.map(normalizeDoc) : []
      return {
        docs,
        activeId: parsed.activeId && docs.some((item) => item.id === parsed.activeId) ? parsed.activeId : docs[0]?.id || null,
        ghostAuto: parsed.ghostAuto !== false,
        deepOn: parsed.deepOn === true,
        routing: { ...DEFAULT_ROUTING, ...(parsed.routing || {}) },
      }
    }
  } catch {
    /* ignore */
  }
  const migrated = migrateV1()
  if (migrated) {
    saveLibrary(migrated)
    return migrated
  }
  return {
    docs: [],
    activeId: null,
    ghostAuto: true,
    deepOn: false,
    routing: DEFAULT_ROUTING,
  }
}

export function saveLibrary(state: LibraryState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

export function upsertDoc(state: LibraryState, doc: WritingDoc): LibraryState {
  const next = { ...doc, updatedAt: Date.now() }
  const index = state.docs.findIndex((item) => item.id === next.id)
  const docs = index >= 0 ? state.docs.map((item, i) => (i === index ? next : item)) : [next, ...state.docs]
  return { ...state, docs, activeId: next.id }
}

export function removeDoc(state: LibraryState, id: string): LibraryState {
  const docs = state.docs.filter((item) => item.id !== id)
  return {
    ...state,
    docs,
    activeId: state.activeId === id ? docs[0]?.id || null : state.activeId,
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

let live = loadLibrary()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function getLibrary(): LibraryState {
  return live
}

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setLibrary(next: LibraryState): LibraryState {
  live = next
  saveLibrary(live)
  emit()
  return live
}

export function patchLibrary(patch: Partial<LibraryState>): LibraryState {
  return setLibrary({ ...live, ...patch })
}

export function writeDoc(doc: WritingDoc): LibraryState {
  return setLibrary(upsertDoc(live, doc))
}

export function deleteDoc(id: string): LibraryState {
  return setLibrary(removeDoc(live, id))
}

export function openDoc(id: string | null): LibraryState {
  return patchLibrary({ activeId: id })
}

export function startNewDoc(): WritingDoc {
  const doc = createDoc()
  setLibrary({ ...live, docs: [doc, ...live.docs], activeId: doc.id })
  return doc
}
