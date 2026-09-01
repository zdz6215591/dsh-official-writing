import type { AuditIssue } from '../../shared/types.ts'
import { tightenIssueSpan, visualMarkRange } from '../../shared/locate.ts'

export function getDocPlainText(doc: { descendants: Function; content: { size: number } }): {
  text: string
  map: number[]
} {
  const map: number[] = []
  let text = ''
  let first = true
  doc.descendants((node: { isBlock?: boolean; isTextblock?: boolean; isText?: boolean; text?: string }, pos: number) => {
    if (node.isBlock && node.isTextblock) {
      if (!first) {
        text += '\n'
        map.push(-1)
      }
      first = false
    }
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        map.push(pos + i)
        text += node.text[i]
      }
    }
    return true
  })
  return { text, map }
}

/** Caret in `doc.textBetween(0, size, '\n')` → ProseMirror position. */
export function plainCaretToPos(
  doc: { descendants: Function; content: { size: number } },
  caret: number,
): number {
  let i = 0
  let found = 1
  let first = true
  let done = false
  doc.descendants((node: { isBlock?: boolean; isTextblock?: boolean; isText?: boolean; text?: string }, pos: number) => {
    if (done) return false
    if (node.isBlock && node.isTextblock) {
      if (!first) {
        if (caret <= i) {
          found = pos
          done = true
          return false
        }
        i += 1
      }
      first = false
    }
    if (node.isText && node.text) {
      const len = node.text.length
      if (caret <= i + len) {
        found = pos + (caret - i)
        done = true
        return false
      }
      i += len
    }
    return true
  })
  if (!done) found = Math.max(1, Math.min(doc.content.size, found))
  return found
}

export function offsetsToRange(
  map: number[],
  start: number,
  end: number,
  docSize: number,
): { from: number; to: number } | null {
  if (start < 0 || end <= start) return null
  let from = -1
  let to = -1
  for (let i = start; i < end && i < map.length; i++) {
    const pos = map[i]
    if (pos == null || pos < 0) continue
    if (from < 0) from = pos
    to = pos + 1
  }
  if (from < 1 || to < 0 || to > docSize || from >= to) return null
  return { from, to }
}

export function countDocChars(text: string): number {
  return text.replace(/\s/g, '').length
}

export function markSliceValid(
  doc: { textBetween: Function; content: { size: number } },
  issue: AuditIssue,
): boolean {
  if (typeof issue.from !== 'number' || typeof issue.to !== 'number') return false
  if (issue.from < 1 || issue.to > doc.content.size || issue.from >= issue.to) return false
  if (issue.type === 'insert') return true
  const slice = String(doc.textBetween(issue.from, issue.to, '\n', '') || '')
  if (!slice) return false
  const original = issue.original || ''
  const expected = String(tightenIssueSpan(issue).original || original)
  return slice === expected || slice === original
}

/** Locate once at audit time. Later edits must map `from`/`to`, never search again. */
export function pinIssuesToDoc(
  doc: { descendants: Function; content: { size: number }; textBetween: Function },
  issues: AuditIssue[],
): AuditIssue[] {
  const { text } = getDocPlainText(doc)
  const next: AuditIssue[] = []
  for (const issue of issues) {
    if (typeof issue.from === 'number' && typeof issue.to === 'number' && markSliceValid(doc, issue)) {
      next.push(issue)
      continue
    }
    const loc = visualMarkRange(text, issue)
    if (!loc) continue
    const from = plainCaretToPos(doc, loc.start)
    const to = plainCaretToPos(doc, loc.end)
    if (from < 1 || to > doc.content.size || from >= to) continue
    const probe = { ...issue, from, to }
    if (!markSliceValid(doc, probe)) continue
    next.push({ ...issue, start: loc.start, end: loc.end, from, to })
  }
  return next
}

export function mapPinnedIssue(
  issue: AuditIssue,
  mapping: { map: (pos: number, assoc?: number) => number },
  docSize: number,
): AuditIssue | null {
  if (typeof issue.from !== 'number' || typeof issue.to !== 'number') return null
  const from = mapping.map(issue.from, 1)
  const to = mapping.map(issue.to, -1)
  if (from < 1 || to > docSize || from >= to) return null
  return { ...issue, from, to }
}
