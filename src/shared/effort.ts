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

export function pickRequestedEffort<T extends { id: string; name?: string }>(
  requested: string | undefined,
  efforts: readonly T[] | undefined,
): string | undefined {
  if (!efforts?.length) return undefined
  if (requested && efforts.some((item) => item.id === requested)) return requested
  return pickOffEffort(efforts) || efforts[0]?.id
}
