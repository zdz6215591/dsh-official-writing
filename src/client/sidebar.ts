/**
 * 精确计算侧栏的右边缘位置（即中间主工作区的起始 left 偏移）。
 * DSH 布局通过 AppFrame 的网格（sidebarCol | centerCol | rightbarCol）实现。
 */
export function measureSidebarLeft(): number {
  // 1. 最精确：中心内容列（centerCol）的左边缘就是工作区的起始位置
  const centerCol = document.querySelector('[class*="centerCol"]') as HTMLElement | null
  if (centerCol) {
    const rect = centerCol.getBoundingClientRect()
    if (rect.left >= 0 && rect.left <= 600) {
      return Math.round(rect.left)
    }
  }

  // 2. 次选：侧栏列（sidebarCol）的宽度或右边缘
  const sidebarCol = document.querySelector('[class*="sidebarCol"]') as HTMLElement | null
  if (sidebarCol) {
    const rect = sidebarCol.getBoundingClientRect()
    if (rect.width > 0 && rect.width <= 600) {
      return Math.round(rect.width)
    }
  }

  // 3. 显式折叠标记（在某些平台下展开时不带此属性，折叠时存在）
  const collapsedEl = document.querySelector('[data-sidebar-collapsed="true"], [data-sidebar-collapsed=""]')
  if (collapsedEl) {
    return 56
  }

  // 4. 根据侧边栏内的树、Tab 栏等核心元素定位其侧栏父容器宽度
  const anchor = document.querySelector(
    '[role="tree"], .ima-wrap, .ow-sidebar-panel, .ow-tab-wrap, [role="tablist"]',
  ) as HTMLElement | null
  if (anchor) {
    let p: HTMLElement | null = anchor
    while (p && p !== document.body) {
      const rect = p.getBoundingClientRect()
      if (rect.height >= window.innerHeight * 0.5 && rect.left <= 10 && rect.width >= 56 && rect.width <= 600) {
        return Math.round(rect.width)
      }
      p = p.parentElement
    }
  }

  // 5. 兜底策略：如果任何常规指标都表明是展开侧栏（例如视口较大），按 DSH 默认的 280px 展开宽度处理，避免遮挡侧栏
  return window.innerWidth > 1024 ? 280 : 56
}

export function applySidebarLeft(): number {
  const width = measureSidebarLeft()
  document.documentElement.style.setProperty('--ow-sidebar-left', `${width}px`)
  return width
}
