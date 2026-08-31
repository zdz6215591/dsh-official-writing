import type { AuditIssue, AuditType } from './types.ts'

export interface TextRange {
  start: number
  end: number
}

export interface IssueLike {
  type: string
  original?: string
  context?: string
  suggestion?: string
  start?: number
  end?: number
}

/**
 * 在当前正文里实时查找批注位置。
 * 以 context / original 的原文片段为准，start/end 只作参考。
 */
export function locateInText(text: string, issue: IssueLike): TextRange | null {
  const type = issue.type
  const context = issue.context ?? ''
  const original = issue.original ?? ''

  if (type === 'insert') {
    if (context) {
      const idx = indexOfContext(text, context, issue.start)
      if (idx >= 0) return { start: idx, end: idx + context.length }
    }
    return null
  }

  if (!original) return null
  if (context) {
    const ctxIdx = indexOfContext(text, context, issue.start)
    if (ctxIdx >= 0) {
      const rel = context.indexOf(original)
      if (rel >= 0) return { start: ctxIdx + rel, end: ctxIdx + rel + original.length }
      const inner = text.indexOf(original, ctxIdx)
      if (inner >= 0 && inner <= ctxIdx + context.length) {
        return { start: inner, end: inner + original.length }
      }
    }
  }
  const idx = indexOfOriginal(text, original, issue.start)
  if (idx >= 0) return { start: idx, end: idx + original.length }

  return null
}

function indexOfContext(text: string, needle: string, _hint?: number): number {
  if (!needle) return -1
  return text.indexOf(needle)
}

function indexOfOriginal(text: string, needle: string, hint?: number): number {
  if (!needle) return -1
  if (typeof hint !== 'number' || hint < 0) return text.indexOf(needle)
  if (text.slice(hint, hint + needle.length) === needle) return hint
  let idx = text.indexOf(needle)
  if (idx < 0) return -1
  let best = idx
  let bestDist = Math.abs(idx - hint)
  while (idx >= 0) {
    const dist = Math.abs(idx - hint)
    if (dist < bestDist) {
      best = idx
      bestDist = dist
    }
    idx = text.indexOf(needle, idx + 1)
  }
  return best
}

export function locateIssue(text: string, issue: AuditIssue): TextRange | null {
  return locateInText(text, issue)
}

export function relocateIssues(text: string, issues: AuditIssue[]): AuditIssue[] {
  const next: AuditIssue[] = []
  for (const issue of issues) {
    const range = locateInText(text, issue)
    if (!range) continue
    next.push({ ...issue, start: range.start, end: range.end })
  }
  next.sort((a, b) => a.start - b.start || a.end - b.end)
  return next
}

export function applyIssueToText(text: string, issue: IssueLike): { text: string; from: number; to: number } | null {
  const range = locateInText(text, issue)
  if (!range) return null
  const suggestion = issue.suggestion ?? ''
  if (issue.type === 'insert') {
    const from = range.end
    return {
      text: text.slice(0, from) + suggestion + text.slice(from),
      from,
      to: from + suggestion.length,
    }
  }
  return {
    text: text.slice(0, range.start) + suggestion + text.slice(range.end),
    from: range.start,
    to: range.start + suggestion.length,
  }
}

export function normalizeAuditType(value: unknown): AuditType | null {
  if (value === 'typo' || value === 'polish' || value === 'insert') return value
  return null
}
