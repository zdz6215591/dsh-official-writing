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
function firstDiffSpan(from: string, to: string): { start: number; end: number; insert: string } | null {
  if (!from || from === to) return null
  let start = 0
  const maxStart = Math.min(from.length, to.length)
  while (start < maxStart && from[start] === to[start]) start += 1
  let fromEnd = from.length
  let toEnd = to.length
  while (fromEnd > start && toEnd > start && from[fromEnd - 1] === to[toEnd - 1]) {
    fromEnd -= 1
    toEnd -= 1
  }
  return { start, end: fromEnd, insert: to.slice(start, toEnd) }
}

export function tightenIssueSpan(issue: IssueLike): IssueLike {
  if (issue.type === 'insert') return issue
  const original = issue.original ?? ''
  const suggestion = issue.suggestion ?? ''
  const span = firstDiffSpan(original, suggestion)
  if (!span || span.end - span.start <= 0) return issue
  if (span.end - span.start >= original.length) return issue
  return {
    ...issue,
    original: original.slice(span.start, span.end),
    suggestion: span.insert,
  }
}

export function locateInText(text: string, issue: IssueLike): TextRange | null {
  const tightened = tightenIssueSpan(issue)
  const type = tightened.type
  const context = tightened.context ?? ''
  const original = tightened.original ?? ''

  if (type === 'insert') {
    if (context) {
      const idx = indexOfContext(text, context, tightened.start)
      if (idx >= 0) return { start: idx, end: idx + context.length }
    }
    return null
  }

  if (!original) return null
  if (context) {
    const ctxIdx = indexOfContext(text, context, tightened.start)
    if (ctxIdx >= 0) {
      const rel = context.indexOf(original)
      if (rel >= 0) return { start: ctxIdx + rel, end: ctxIdx + rel + original.length }
      const inner = text.indexOf(original, ctxIdx)
      if (inner >= 0 && inner <= ctxIdx + context.length) {
        return { start: inner, end: inner + original.length }
      }
    }
  }
  const idx = indexOfOriginal(text, original, tightened.start)
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
    if (issue.type !== 'insert' && issue.original && !text.includes(issue.original)) continue
    if (issue.context && !text.includes(issue.context) && !(issue.original && text.includes(issue.original))) continue
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

/** Spoken/register issues must never be shown as 错别字. */
export function coerceAuditType(type: AuditType, reason: string): AuditType {
  if (type !== 'typo') return type
  if (/口语|正式|公文|用词|表述|礼貌|不得体/.test(reason) && !/错别字|错字|别字|写错/.test(reason)) {
    return 'polish'
  }
  return type
}
