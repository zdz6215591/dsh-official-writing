import { createElement, useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Workbench } from './Workbench.tsx'
import { mountWritingRemote } from './remote.ts'
import { STYLES } from './styles.ts'

const RAIL_ATTR = 'data-ow-rail'

function buttonLabel(el: Element): string {
  const button = el as HTMLElement
  return `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`
}

function findLabeledButton(pattern: RegExp): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll('button')).find((button) => pattern.test(buttonLabel(button))) ?? null
  )
}

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
  const toggle = () => {
    open = !open
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
    useEffect(() => subscribe(() => setOpened(open)), [])
    if (!opened) return null
    return createElement(
      'div',
      { style: { pointerEvents: 'auto' } },
      createElement(Workbench, {
        ctx,
        onClose: () => {
          open = false
          notify()
        },
      }),
    )
  }

  function FooterEntry({ wide }: { wide?: boolean }) {
    const [pressed, setPressed] = useState(open)
    useEffect(() => subscribe(() => setPressed(open)), [])
    return createElement(
      'button',
      {
        type: 'button',
        className: `ow-footer-entry${pressed ? ' on' : ''}`,
        title: '公文写作助手',
        'aria-label': '公文写作助手',
        'aria-pressed': pressed,
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          toggle()
        },
      },
      createElement(PenIcon, { size: wide ? 16 : 18 }),
      wide ? createElement('span', null, '公文写作助手') : null,
    )
  }

  slots.inject('shell.overlay', () =>
    slots.register(
      { name: 'shell.overlay', id: 'official-writing', order: 40, label: '公文写作助手' },
      Overlay,
    ),
  )

  slots.inject('sidebar.footer.action', () =>
    slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'official-writing-entry',
        order: 40,
        label: '公文写作助手',
      },
      FooterEntry,
    ),
  )

  ctx.effect(() => {
    const host = document.createElement('div')
    host.setAttribute(RAIL_ATTR, '1')
    host.className = 'ow-rail-host'
    document.body.appendChild(host)

    const paint = () => {
      host.replaceChildren()
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ow-rail-btn'
      button.title = '公文写作助手'
      button.setAttribute('aria-label', '公文写作助手')
      button.setAttribute('aria-pressed', String(open))
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '16')
      svg.setAttribute('height', '16')
      svg.setAttribute('viewBox', '0 0 16 16')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('aria-hidden', 'true')
      const paths: Array<[string, Record<string, string>]> = [
        [
          'path',
          {
            d: 'M4 2.5h5.2L13 6.3V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V4A1.5 1.5 0 0 1 4.5 2.5H4z',
            stroke: 'currentColor',
            'stroke-width': '1.25',
          },
        ],
        ['path', { d: 'M9 2.6V6h3.3', stroke: 'currentColor', 'stroke-width': '1.25' }],
        ['path', { d: 'M6.2 11.6 10.4 7.4l1.2 1.2-4.2 4.2H6.2v-1.2z', fill: 'currentColor' }],
      ]
      for (const [tag, attrs] of paths) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
        svg.appendChild(node)
      }
      button.appendChild(svg)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        toggle()
      })
      host.appendChild(button)
    }

    const place = () => {
      const add = findLabeledButton(/添加工作区|Add workspace/)
      const view = findLabeledButton(/视图选项|View options/)
      const anchor = add || view
      if (!anchor) {
        host.style.display = 'none'
        return
      }
      const rect = anchor.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.top > window.innerHeight) {
        host.style.display = 'none'
        return
      }
      host.style.display = 'block'
      const stacked = view && Math.abs(view.getBoundingClientRect().top - rect.top) > 12
      if (stacked) {
        host.style.left = `${Math.round(rect.left)}px`
        host.style.top = `${Math.round(rect.bottom + 4)}px`
      } else {
        host.style.left = `${Math.round(rect.right + 4)}px`
        host.style.top = `${Math.round(rect.top)}px`
      }
      host.style.width = `${Math.round(rect.width)}px`
      host.style.height = `${Math.round(rect.height)}px`
    }

    paint()
    place()
    const unsub = subscribe(() => {
      paint()
      place()
    })
    const onScroll = () => place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    const mo = new MutationObserver(place)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true })
    const timer = window.setInterval(place, 500)
    return () => {
      unsub()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
      mo.disconnect()
      window.clearInterval(timer)
      host.remove()
    }
  })
}
