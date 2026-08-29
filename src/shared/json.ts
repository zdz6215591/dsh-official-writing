/**
 * 校核 JSON 解析：直接解析 → 抽取 ```json 代码块 → 截取首尾花括号。
 */
export function parseJsonObject(raw: string): unknown {
  const text = (raw || '').trim()
  if (!text) throw new Error('模型未返回内容')

  const attempts = [text, extractFenced(text), extractBraces(text)].filter(
    (item): item is string => Boolean(item),
  )
  const seen = new Set<string>()
  let lastError: Error | null = null
  for (const attempt of attempts) {
    if (seen.has(attempt)) continue
    seen.add(attempt)
    try {
      return JSON.parse(attempt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw lastError ?? new Error('无法解析校核结果')
}

function extractFenced(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match?.[1]?.trim() || null
}

function extractBraces(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1).trim()
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
