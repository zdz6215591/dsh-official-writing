/** Visible left-column width. Collapsed rail is 56px. */
export function measureSidebarLeft(): number {
  if (document.querySelector('[data-sidebar-collapsed]')) return 56
  const buttons = Array.from(document.querySelectorAll('button'))
  const settings = buttons.find((button) => {
    const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`
    return button.getAttribute('aria-haspopup') === 'dialog' && /设置|Settings/.test(label)
  })
  if (!settings) return 56
  let width = 56
  let el: HTMLElement | null = settings
  while (el && el !== document.body) {
    const rect = el.getBoundingClientRect()
    const fullHeight = rect.height >= window.innerHeight * 0.7
    const leftEdge = rect.left <= 12
    if (fullHeight && leftEdge && rect.width >= 56 && rect.width <= 430) {
      width = Math.round(rect.width)
    }
    el = el.parentElement
  }
  return width
}

export function applySidebarLeft(): number {
  const width = measureSidebarLeft()
  document.documentElement.style.setProperty('--ow-sidebar-left', `${width}px`)
  return width
}
