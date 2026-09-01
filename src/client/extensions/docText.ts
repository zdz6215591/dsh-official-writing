import type { AuditIssue } from '../../shared/types.ts'
import { tightenIssueSpan } from '../../shared/locate.ts'

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

/** Find `needle` inside a single textblock. Never crosses a paragraph/heading boundary. */
export function findNeedleInDoc(
  doc: { descendants: Function; content: { size: number }; textBetween?: Function },
  needle: string,
  hintFrom?: number,
): { from: number; to: number } | null {
  if (!needle) return null
  let best: { from: number; to: number; dist: number } | null = null
  doc.descendants((node: { isTextblock?: boolean; textContent?: string }, pos: number) => {
    if (!node.isTextblock) return true
    const text = node.textContent || ''
    let idx = text.indexOf(needle)
    while (idx >= 0) {
      const from = pos + 1 + idx
      const to = from + needle.length
      const dist = typeof hintFrom === 'number' ? Math.abs(from - hintFrom) : 0
      if (!best || dist < best.dist) best = { from, to, dist }
      if (typeof hintFrom !== 'number') break
      idx = text.indexOf(needle, idx + 1)
    }
    return false
  })
  return best ? { from: best.from, to: best.to } : null
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

function pinOne(
  doc: { descendants: Function; content: { size: number }; textBetween: Function },
  issue: AuditIssue,
): AuditIssue | null {
  if (issue.type === 'insert') {
    const found = findNeedleInDoc(doc, issue.context || '')
    if (!found) return null
    return { ...issue, from: found.to, to: found.to }
  }
  const original = issue.original || ''
  if (!original) return null
  const full = findNeedleInDoc(doc, original)
  if (!full) return null
  const tight = tightenIssueSpan(issue)
  const fragment = String(tight.original || '')
  if (fragment && fragment !== original) {
    const inner = original.indexOf(fragment)
    if (inner >= 0) {
      const from = full.from + inner
      const to = from + fragment.length
      const probe = { ...issue, from, to }
      if (markSliceValid(doc, probe)) return { ...issue, from, to }
    }
  }
  return { ...issue, from: full.from, to: full.to }
}

/** Locate once at audit time by real textblock strings. Later edits only map `from`/`to`. */
export function pinIssuesToDoc(
  doc: { descendants: Function; content: { size: number }; textBetween: Function },
  issues: AuditIssue[],
): AuditIssue[] {
  const next: AuditIssue[] = []
  for (const issue of issues) {
    const pinned = pinOne(doc, { ...issue, from: undefined, to: undefined } as AuditIssue)
    if (pinned) next.push(pinned)
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
