import { createElement, useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Workbench } from './Workbench.tsx'
import { mountWritingRemote } from './remote.ts'
import { STYLES } from './styles.ts'

const RAIL_ATTR = 'data-ow-rail'

function findWorkspaceActionRow(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll('button'))
  const add = buttons.find((button) => {
    const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`
    return /添加工作区|Add workspace/.test(label)
  })
  if (add?.parentElement) return add.parentElement
  const view = buttons.find((button) => {
    const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`
    return /视图选项|View options/.test(label)
  })
  return view?.parentElement ?? null
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

  slots.inject('shell.overlay', () =>
    slots.register(
      { name: 'shell.overlay', id: 'official-writing', order: 40, label: '公文写作助手' },
      Overlay,
    ),
  )

  ctx.effect(() => {
    const mountButton = (row: HTMLElement) => {
      if (row.querySelector(`[${RAIL_ATTR}]`)) return
      const host = document.createElement('span')
      host.setAttribute(RAIL_ATTR, '1')
      host.style.display = 'inline-flex'
      host.style.alignItems = 'center'
      const sibling = row.querySelector('button')
      const render = () => {
        host.replaceChildren()
        const button = document.createElement('button')
        button.type = 'button'
        button.className = sibling?.className || 'ow-rail-btn'
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
      row.appendChild(host)
      render()
      return subscribe(render)
    }

    const unsubs: Array<() => void> = []
    const sync = () => {
      const row = findWorkspaceActionRow()
      if (!row) return false
      const unsub = mountButton(row)
      if (unsub) unsubs.push(unsub)
      return true
    }

    let tries = 0
    const timer = window.setInterval(() => {
      if (sync() || ++tries > 80) window.clearInterval(timer)
    }, 250)
    const mo = new MutationObserver(() => sync())
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.clearInterval(timer)
      mo.disconnect()
      for (const unsub of unsubs) unsub()
      document.querySelectorAll(`[${RAIL_ATTR}]`).forEach((node) => node.remove())
    }
  })
}
