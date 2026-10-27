import { createElement as h, useEffect, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { WritingSidebarPanel } from './components/WritingSidebarPanel.tsx'

export interface NativeTab {
  id: string
  label: string | ReactNode
  order?: number
  matchSession?: (sessionId: string) => boolean
  render: (props: any) => ReactNode
}

export interface NativeTabRegistry {
  version: 1
  officialTree?: any
  sessionFilters?: any[]
  sessionOpeners?: any[]
  getTabs: () => NativeTab[]
  getRevision: () => number
  subscribe: (listener: () => void) => () => void
  insert: (tab: NativeTab) => () => void
}

const TAB_STORAGE_KEY = 'dsh-native-sidebar.tab'
const NOTIFY_EVENT = 'dsh-native-sidebar-change'

export function findNativeTabRegistry(entry: any): NativeTabRegistry | null {
  const target =
    entry && (typeof entry === 'object' || typeof entry === 'function') && 'component' in entry
      ? entry.component
      : entry
  const registry = target?.__dshNativeTabs
  return registry?.version === 1 &&
    typeof registry.getTabs === 'function' &&
    typeof registry.subscribe === 'function' &&
    typeof registry.insert === 'function'
    ? (registry as NativeTabRegistry)
    : null
}

export function attachNativeTabRegistry(target: any, registry: NativeTabRegistry): NativeTabRegistry {
  try {
    target.__dshNativeTabs = registry
  } catch {
    /* ignore */
  }
  return registry
}

export function createNativeTabRegistry(officialTree: any): NativeTabRegistry {
  const tabs = new Map<string, NativeTab>()
  const listeners = new Set<() => void>()
  let cachedTabs: NativeTab[] = []
  let revision = 0

  const rebuild = () => {
    cachedTabs = [...tabs.values()].sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  const emit = () => {
    revision += 1
    for (const listener of listeners) listener()
  }

  return {
    version: 1,
    officialTree,
    sessionFilters: [],
    sessionOpeners: [],
    getTabs() {
      return cachedTabs
    },
    getRevision() {
      return revision
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    insert(tab) {
      if (!tab || !tab.id) return () => {}
      tabs.set(tab.id, tab)
      rebuild()
      emit()
      return () => {
        if (tabs.get(tab.id) !== tab) return
        tabs.delete(tab.id)
        rebuild()
        emit()
      }
    },
  }
}

export function setupOfficialWritingTab(
  ctx: Context,
  options: {
    onOpenWorkbench: (id: string) => void
    onRestyleDoc: (id: string) => void
    isWorkbenchOpen: () => boolean
    onTabChange?: (tab: string) => void
  },
): () => void {
  let disposed = false
  let removeInsertedTab: (() => void) | null = null
  let insertedRegistry: NativeTabRegistry | null = null
  let wrappedEntry: any = null
  let originalComp: any = null
  let ownedWrapper: any = null
  let ownedRegistry: NativeTabRegistry | null = null

  const clearInsertedTab = () => {
    if (removeInsertedTab) {
      removeInsertedTab()
      removeInsertedTab = null
    }
    insertedRegistry = null
  }

  const unwrap = () => {
    clearInsertedTab()
    if (wrappedEntry) {
      if (originalComp && wrappedEntry.component === ownedWrapper) {
        wrappedEntry.component = originalComp
      }
      if (wrappedEntry.__dshNativeTabs === ownedRegistry) {
        delete wrappedEntry.__dshNativeTabs
      }
      queueMicrotask(() => window.dispatchEvent(new Event(NOTIFY_EVENT)))
    }
    wrappedEntry = null
    originalComp = null
    ownedWrapper = null
    ownedRegistry = null
  }

  const insertTab = (registry: NativeTabRegistry) => {
    if (insertedRegistry === registry && registry.getTabs().some((item) => item.id === 'official-writing')) {
      return
    }
    clearInsertedTab()
    insertedRegistry = registry
    removeInsertedTab = registry.insert({
      id: 'official-writing',
      label: '公文',
      order: 30, // 任务是内置，频道是 20，公文 30 排在任务、频道后面
      render: () =>
        h(WritingSidebarPanel, {
          onOpenWorkbench: options.onOpenWorkbench,
          onRestyleDoc: options.onRestyleDoc,
          isOpen: options.isWorkbenchOpen(),
        }),
    })
  }

  const sync = () => {
    if (disposed) return
    try {
      const read = (ctx.slots as any)?.entriesOfSlot || (ctx.slots as any)?.entries
      const entries = (read && read.call(ctx.slots, 'sidebar.workspaces')) || []
      const occupant = entries.find((item: any) => item && item.component)
      if (!occupant) {
        clearInsertedTab()
        return
      }

      // 1. 如果已有 Tab 注册表（例如 dsh-im-connect 已经包裹），直接将公文写作 Tab 注入到其注册表中
      const existingRegistry = findNativeTabRegistry(occupant)
      if (existingRegistry) {
        insertTab(existingRegistry)
        return
      }

      // 2. 如果当前没有被包裹，我们自己创建原生两页签壳（任务 | 公文写作）
      if (occupant.component.__dshNativeTabHost || occupant.component.__imConnectWrapped) {
        return
      }

      originalComp = occupant.component
      const registry = createNativeTabRegistry(originalComp)
      ownedRegistry = registry
      const tree = originalComp

      function DshWritingNativeTabShell(props: any) {
        const [tab, setTab] = useState(() => {
          try {
            return localStorage.getItem(TAB_STORAGE_KEY) || 'tasks'
          } catch {
            return 'tasks'
          }
        })

        useEffect(() => {
          try {
            localStorage.setItem(TAB_STORAGE_KEY, tab)
          } catch {
            /* ignore */
          }
          options.onTabChange?.(tab)
        }, [tab])

        const tabs = registry.getTabs()
        const isOfficialWriting = tab === 'official-writing'
        const currentExtra = tabs.find((t) => t.id === tab)

        return h(
          'div',
          { className: 'ow-tab-wrap' },
          h(
            'div',
            { className: 'ow-tabs-bar', role: 'tablist', 'aria-label': '侧栏分类' },
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                'aria-selected': tab === 'tasks',
                className: `ow-tab-btn${tab === 'tasks' ? ' on' : ''}`,
                onClick: () => setTab('tasks'),
              },
              '任务',
            ),
            ...tabs.map((t) =>
              h(
                'button',
                {
                  key: t.id,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': tab === t.id,
                  className: `ow-tab-btn${tab === t.id ? ' on' : ''}`,
                  onClick: () => setTab(t.id),
                },
                typeof t.label === 'string' ? t.label : t.label,
              ),
            ),
          ),
          tab === 'tasks'
            ? h(tree, props)
            : isOfficialWriting
              ? h(WritingSidebarPanel, {
                  onOpenWorkbench: options.onOpenWorkbench,
                  onRestyleDoc: options.onRestyleDoc,
                  isOpen: options.isWorkbenchOpen(),
                })
              : currentExtra
                ? currentExtra.render(props)
                : null,
        )
      }

      DshWritingNativeTabShell.displayName = 'DshWritingNativeTabShell'
      DshWritingNativeTabShell.__dshNativeTabHost = true
      DshWritingNativeTabShell.__dshWritingWrapped = true
      attachNativeTabRegistry(DshWritingNativeTabShell, registry)
      attachNativeTabRegistry(occupant, registry)

      insertTab(registry)
      occupant.component = DshWritingNativeTabShell
      ownedWrapper = DshWritingNativeTabShell
      wrappedEntry = occupant
      queueMicrotask(() => window.dispatchEvent(new Event(NOTIFY_EVENT)))
    } catch (err) {
      console.warn('[dsh-official-writing] tab sync error', err)
    }
  }

  // 监听 Tab 切换事件：当切到非公文写作标签时，自动收起工作台
  const onGlobalClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const tabBtn = target.closest('[role="tab"], .ima-tab, .ow-tab-btn') as HTMLElement | null
    if (tabBtn) {
      const text = (tabBtn.textContent || '').trim()
      if (/公文/.test(text) || tabBtn.id?.includes('official-writing')) {
        options.onTabChange?.('official-writing')
      } else {
        options.onTabChange?.('other')
      }
    }
  }

  document.addEventListener('click', onGlobalClick, true)
  sync()

  const unsubWorkspaces =
    typeof (ctx.slots as any)?.subscribe === 'function'
      ? (ctx.slots as any).subscribe('sidebar.workspaces', sync)
      : () => {}
  const unsubSidebar =
    typeof (ctx.slots as any)?.subscribe === 'function'
      ? (ctx.slots as any).subscribe('sidebar', sync)
      : () => {}

  window.addEventListener(NOTIFY_EVENT, sync)

  const retryTimer = window.setInterval(sync, 1000)

  return () => {
    disposed = true
    window.clearInterval(retryTimer)
    document.removeEventListener('click', onGlobalClick, true)
    unsubWorkspaces()
    unsubSidebar()
    window.removeEventListener(NOTIFY_EVENT, sync)
    unwrap()
  }
}
