import { Component, createElement, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Workbench } from './Workbench.tsx'
import { mountWritingRemote } from './remote.ts'
import { STYLES } from './styles.ts'

const RAIL_ATTR = 'data-ow-rail'
const SETTINGS_MARK = 'data-ow-settings'

function buttonLabel(el: Element): string {
  const button = el as HTMLElement
  return `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`
}

function findSettingsButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
  return (
    buttons.find(
      (button) => button.getAttribute('aria-haspopup') === 'dialog' && /设置|Settings/.test(buttonLabel(button)),
    ) || null
  )
}

function iconSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h5.2L13 6.3V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V4A1.5 1.5 0 0 1 4.5 2.5H4z" stroke="currentColor" stroke-width="1.25"/><path d="M9 2.6V6h3.3" stroke="currentColor" stroke-width="1.25"/><path d="M6.2 11.6 10.4 7.4l1.2 1.2-4.2 4.2H6.2v-1.2z" fill="currentColor"/></svg>`
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

export const inject = ['slots']

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
  const toggle = () => {
    open = !open
    window.dispatchEvent(new CustomEvent(EVENT, { detail: open }))
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
          onClose: () => {
            open = false
            window.dispatchEvent(new CustomEvent(EVENT, { detail: false }))
            notify()
          },
        }),
      ),
    )
  }

  slots.inject('shell.overlay', () =>
    slots.register(
      { name: 'shell.overlay', id: 'official-writing', order: 40, label: '公文写作助手' },
      Overlay,
    ),
  )

  ctx.effect(() => {
    const host = document.createElement('div')
    host.setAttribute(RAIL_ATTR, '1')
    host.className = 'ow-rail-host'
    document.body.appendChild(host)

    const ensureButton = (settings: HTMLButtonElement, wide: boolean) => {
      const existing = host.querySelector('button')
      const pressed = String(open)
      if (existing && host.getAttribute('data-wide') === String(wide) && existing.getAttribute('aria-pressed') === pressed) {
        return
      }
      host.replaceChildren()
      const button = document.createElement('button')
      button.type = 'button'
      button.className = settings.className
      button.title = '公文写作助手'
      button.setAttribute('aria-label', '公文写作助手')
      button.setAttribute('aria-pressed', pressed)
      button.innerHTML = iconSvg(wide ? 16 : 18)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle()
      })
      host.appendChild(button)
      host.setAttribute('data-wide', String(wide))
    }

    const place = () => {
      const settings = findSettingsButton()
      if (!settings) {
        host.style.display = 'none'
        return
      }
      const parent = settings.parentElement
      const rail = settings.offsetWidth <= 48 || /\brail\b/i.test(settings.className)
      if (parent) parent.setAttribute(SETTINGS_MARK, rail ? 'rail' : 'wide')
      const rect = settings.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) {
        host.style.display = 'none'
        return
      }
      ensureButton(settings, !rail)
      host.style.display = 'block'
      const size = Math.round(rect.height)
      if (rail) {
        host.style.left = `${Math.round(rect.left)}px`
        host.style.top = `${Math.round(rect.top - size - 8)}px`
        host.style.width = `${size}px`
        host.style.height = `${size}px`
        return
      }
      host.style.left = `${Math.round(rect.right + 6)}px`
      host.style.top = `${Math.round(rect.top)}px`
      host.style.width = `${size}px`
      host.style.height = `${size}px`
    }

    place()
    const unsub = subscribe(() => place())
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const mo = new MutationObserver((records) => {
      if (records.every((record) => host.contains(record.target) || record.target === host)) return
      place()
    })
    mo.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(place, 500)
    return () => {
      unsub()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      mo.disconnect()
      window.clearInterval(timer)
      document.querySelectorAll(`[${SETTINGS_MARK}]`).forEach((node) => node.removeAttribute(SETTINGS_MARK))
      host.remove()
    }
  })
}
