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
        map.push(pos)
        text += '\n'
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
  const from = map[start]
  const toIdx = Math.min(end - 1, map.length - 1)
  if (from == null || map[toIdx] == null) return null
  const to = map[toIdx]! + 1
  if (from < 1 || to > docSize) return null
  return { from, to }
}

export function countDocChars(text: string): number {
  return text.replace(/\s/g, '').length
}
