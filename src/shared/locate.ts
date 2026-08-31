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

/** Display-only: keep the changed fragment. Never use this result to search the document. */
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

/**
 * 在当前正文里实时查找批注位置。
 * 用完整 original / context 锁定句子，不用最短差去全文搜索。
 */
export function locateInText(text: string, issue: IssueLike): TextRange | null {
  const type = issue.type
  const context = issue.context ?? ''
  const original = issue.original ?? ''

  if (type === 'insert') {
    if (context) {
      const idx = indexOfNeedle(text, context, issue.start)
      if (idx >= 0) return { start: idx, end: idx + context.length }
    }
    return null
  }

  if (!original) return null
  if (context) {
    const ctxIdx = indexOfNeedle(text, context, issue.start)
    if (ctxIdx >= 0) {
      const rel = context.indexOf(original)
      if (rel >= 0) return { start: ctxIdx + rel, end: ctxIdx + rel + original.length }
      const inner = text.indexOf(original, ctxIdx)
      if (inner >= 0 && inner <= ctxIdx + context.length) {
        return { start: inner, end: inner + original.length }
      }
    }
  }
  if (original.length < 4) return null
  const idx = indexOfNeedle(text, original, issue.start)
  if (idx >= 0) return { start: idx, end: idx + original.length }
  return null
}

/** Underline only the changed fragment, still inside the located original. */
export function visualMarkRange(text: string, issue: IssueLike): TextRange | null {
  const loc = locateInText(text, issue)
  if (!loc) return null
  if (issue.type === 'insert') return loc
  const original = issue.original ?? ''
  const suggestion = issue.suggestion ?? ''
  const span = firstDiffSpan(original, suggestion)
  if (!span || span.end <= span.start) return loc
  if (span.end - span.start >= original.length) return loc
  return { start: loc.start + span.start, end: loc.start + span.end }
}

function indexOfNeedle(text: string, needle: string, hint?: number): number {
  if (!needle) return -1
  if (typeof hint === 'number' && hint >= 0 && text.slice(hint, hint + needle.length) === needle) {
    return hint
  }
  return text.indexOf(needle)
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
  const range = visualMarkRange(text, issue)
  if (!range) return null
  const tight = tightenIssueSpan(issue)
  const suggestion = issue.type === 'insert' ? (issue.suggestion ?? '') : (tight.suggestion ?? issue.suggestion ?? '')
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
