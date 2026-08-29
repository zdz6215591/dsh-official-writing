import { Component, createElement, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Workbench } from './Workbench.tsx'
import { mountWritingRemote } from './remote.ts'
import { STYLES } from './styles.ts'

function PenIcon({ size = 16 }: { size?: number }) {
  return createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
    createElement('path', {
      d: 'M4 2.5h5.2L13 6.3V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V4A1.5 1.5 0 0 1 4.5 2.5H4z',
      stroke: 'currentColor',
      strokeWidth: '1.25',
    }),
    createElement('path', { d: 'M9 2.6V6h3.3', stroke: 'currentColor', strokeWidth: '1.25' }),
    createElement('path', { d: 'M6.2 11.6 10.4 7.4l1.2 1.2-4.2 4.2H6.2v-1.2z', fill: 'currentColor' }),
  )
}

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
  const toggle = () => setOpen(!open)

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
    useEffect(() => {
      const onEvent = (event: Event) => setOpened(Boolean((event as CustomEvent).detail))
      window.addEventListener(EVENT, onEvent)
      const unsub = subscribe(() => setOpened(open))
      setOpened(open)
      return () => {
        window.removeEventListener(EVENT, onEvent)
        unsub()
      }
    }, [])
    if (!opened) return null
    return createElement(
      'div',
      { className: 'ow-overlay-host', style: { pointerEvents: 'auto' } },
      createElement(
        OverlayGuard,
        null,
        createElement(Workbench, {
          ctx,
          onClose: () => setOpen(false),
        }),
      ),
    )
  }

  function FooterEntry({ wide }: { wide?: boolean }) {
    const [pressed, setPressed] = useState(open)
    useEffect(() => subscribe(() => setPressed(open)), [])
    return createElement(
      'button',
      {
        type: 'button',
        className: `ow-settings-twin${wide ? '' : ' rail'}${pressed ? ' on' : ''}`,
        title: '写作助手',
        'aria-label': '写作助手',
        'aria-pressed': pressed,
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          toggle()
        },
      },
      createElement(PenIcon, { size: wide ? 16 : 18 }),
      wide ? createElement('span', null, '写作助手') : null,
    )
  }

  slots.inject('shell.overlay', () =>
    slots.register(
      { name: 'shell.overlay', id: 'official-writing', order: 40, label: '写作助手' },
      Overlay,
    ),
  )

  slots.inject('sidebar.footer.action', () =>
    slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'official-writing-entry',
        order: 20,
        label: '写作助手',
      },
      FooterEntry,
    ),
  )
}
