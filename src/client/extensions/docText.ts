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
