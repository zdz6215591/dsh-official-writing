/** Prefer a true thinking-off level. `low` still enables DeepSeek thinking. */
export function pickOffEffort<T extends { id: string; name?: string }>(
  efforts: readonly T[] | undefined,
): string | undefined {
  if (!efforts?.length) return undefined
  const scored = efforts
    .map((item) => {
      const hay = `${item.id} ${item.name || ''}`.toLowerCase()
      if (/^(off|none|disabled|false)$/i.test(item.id) || /(关闭|不思考|no.?think|disabled|none)/i.test(hay)) {
        return { item, score: 0 }
      }
      if (/\boff\b/.test(hay)) return { item, score: 1 }
      return null
    })
    .filter((row): row is { item: T; score: number } => Boolean(row))
  scored.sort((a, b) => a.score - b.score)
  return scored[0]?.item.id
}

/** Only return an id the model actually advertised. Never invent `off`. */
export function resolveEffort(opts: {
  requested?: string
  efforts?: readonly { id: string; name?: string }[]
  preferOff?: boolean
}): string | undefined {
  const efforts = opts.efforts
  if (!efforts?.length) return undefined
  if (opts.requested && efforts.some((item) => item.id === opts.requested)) return opts.requested
  if (opts.preferOff) return pickOffEffort(efforts)
  return pickOffEffort(efforts) || efforts[0]?.id
}

export type StreamAttempt = { reasoningEffort?: string; purpose?: 'session-title' | 'compaction' }

/** DeepSeek omits thinking ⇒ default high. Prefer advertised `off`, else session-title (forces thinking disabled). */
export function streamAttempts(opts: {
  requested?: string
  efforts?: readonly { id: string; name?: string }[]
  preferOff?: boolean
}): StreamAttempt[] {
  const advertised = resolveEffort(opts)
  const attempts: StreamAttempt[] = []
  const push = (attempt: StreamAttempt) => {
    const key = `${attempt.reasoningEffort || ''}|${attempt.purpose || ''}`
    if (attempts.some((item) => `${item.reasoningEffort || ''}|${item.purpose || ''}` === key)) return
    attempts.push(attempt)
  }
  push({})
  if (advertised) push({ reasoningEffort: advertised })
  if (opts.preferOff) push({ purpose: 'session-title' })
  return attempts
}

export function isUnsupportedEffort(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const row = error as { code?: string; message?: string; cause?: unknown }
  const hay = `${row.code || ''} ${row.message || ''}`
  if (/UNSUPPORTED_REASONING_EFFORT|does not support reasoning effort|不支持.*推理|不支持.*思考/i.test(hay)) {
    return true
  }
  return row.cause ? isUnsupportedEffort(row.cause) : false
}
