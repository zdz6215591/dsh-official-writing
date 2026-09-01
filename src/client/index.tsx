import { Component, createElement, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { WritingNav } from './components/WritingNav.tsx'
import { Workbench } from './Workbench.tsx'
import { getLibrary, openDoc, startNewDoc, subscribeLibrary } from './library.ts'
import { mountWritingRemote } from './remote.ts'
import { STYLES } from './styles.ts'

class OverlayGuard extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message || String(error) }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[dsh-official-writing]', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return createElement(
        'div',
        { className: 'ow-crash', role: 'alert' },
        createElement('strong', null, '公文写作助手未能打开'),
        createElement('p', null, this.state.error),
      )
    }
    return this.props.children
  }
}

export const inject = ['slots', 'remote']

export function apply(ctx: Context) {
  const slots = ctx.get('slots') as
    | {
        inject: (name: string, factory: () => unknown) => unknown
        register: (opts: Record<string, unknown>, component: unknown) => unknown
      }
    | undefined
  if (!slots) return

  let open = false
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const EVENT = 'ow-official-writing'
  const setOpen = (next: boolean) => {
    open = next
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
    notify()
  }

  ctx.effect(() => {
    let disposed = false
    let disposeRemote: (() => void) | undefined
    const style = document.createElement('style')
    style.setAttribute('data-ow', '1')
    style.textContent = STYLES
    document.head.appendChild(style)
    const tryMount = () => {
      if (disposed || disposeRemote) return
      void mountWritingRemote(ctx).then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        disposeRemote = dispose
      })
    }
    tryMount()
    const timer = window.setInterval(tryMount, 250)
    const stop = window.setTimeout(() => window.clearInterval(timer), 12_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.clearTimeout(stop)
      disposeRemote?.()
      style.remove()
    }
  })

  function Overlay() {
    const [opened, setOpened] = useState(open)
    const [lib, setLib] = useState(getLibrary())
    useEffect(() => {
      const onEvent = (event: Event) => setOpened(Boolean((event as CustomEvent).detail))
      window.addEventListener(EVENT, onEvent)
      const unsub = subscribe(() => setOpened(open))
      const unsubLib = subscribeLibrary(() => setLib(getLibrary()))
      setOpened(open)
      return () => {
        window.removeEventListener(EVENT, onEvent)
        unsub()
        unsubLib()
      }
    }, [])
    const active = lib.docs.find((item) => item.id === lib.activeId) || null
    return createElement(
      'div',
      null,
      createElement(WritingNav, {
        docs: lib.docs,
        activeId: opened ? lib.activeId : null,
        onOpen: (id: string) => {
          openDoc(id)
          setOpen(true)
        },
        onCreate: () => {
          startNewDoc()
          setOpen(true)
        },
      }),
      opened && active
        ? createElement(
            OverlayGuard,
            null,
            createElement(
              'div',
              { className: 'ow-overlay-host', style: { pointerEvents: 'auto' } },
              createElement(Workbench, {
                key: active.id,
                ctx,
                doc: active,
                onClose: () => setOpen(false),
              }),
            ),
          )
        : null,
    )
  }

  slots.inject('shell.overlay', () =>
    slots.register(
      { name: 'shell.overlay', id: 'official-writing', order: 40, label: '写作助手' },
      Overlay,
    ),
  )

}
