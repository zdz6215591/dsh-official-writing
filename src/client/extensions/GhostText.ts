import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type GhostState = {
  pos: number
  text: string
  loading: boolean
}

export const ghostPluginKey = new PluginKey<GhostState | null>('owGhostText')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    owGhostText: {
      setGhost: (state: GhostState | null) => ReturnType
      clearGhost: () => ReturnType
    }
  }
}

export const GhostText = Extension.create({
  name: 'owGhostText',
  addCommands() {
    return {
      setGhost:
        (state: GhostState | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(ghostPluginKey, state).setMeta('addToHistory', false))
          return true
        },
      clearGhost:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(ghostPluginKey, null).setMeta('addToHistory', false))
          return true
        },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostPluginKey,
        state: {
          init: () => null as GhostState | null,
          apply(tr, value) {
            const meta = tr.getMeta(ghostPluginKey)
            if (meta !== undefined) return meta as GhostState | null
            if (!value) return null
            if (tr.docChanged) {
              const mapped = tr.mapping.map(value.pos)
              if (mapped < 0 || mapped > tr.doc.content.size) return null
              return { ...value, pos: mapped }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const ghost = ghostPluginKey.getState(state)
            if (!ghost) return null
            const { pos, text, loading } = ghost
            if (pos < 0 || pos > state.doc.content.size) return null
            const widget = document.createElement('span')
            widget.className = loading ? 'ow-ghost-loading' : 'ow-ghost-text'
            widget.contentEditable = 'false'
            widget.setAttribute('data-ghost', '1')
            if (loading) {
              widget.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>'
              widget.setAttribute('aria-label', '正在联想')
            } else {
              widget.textContent = text
            }
            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, widget, {
                side: 1,
                key: loading ? 'ow-ghost-loading' : `ow-ghost-text:${text}`,
              }),
            ])
          },
          handleKeyDown(view, event) {
            if (event.key === ' ' && !event.repeat) {
              const { empty, from } = view.state.selection
              if (empty && from > 1) {
                const prev = view.state.doc.textBetween(from - 1, from, '')
                if (prev === ' ') {
                  view.dispatch(view.state.tr.setMeta('ow-ghost-manual', true).setMeta('addToHistory', false))
                  return true
                }
              }
            }
            const ghost = ghostPluginKey.getState(view.state)
            if (!ghost) return false
            if (ghost.loading) {
              if (event.key === 'Escape') {
                view.dispatch(view.state.tr.setMeta(ghostPluginKey, null))
                return true
              }
              return false
            }
            if (!ghost.text) return false
            if (event.key === 'Tab' || event.key === 'ArrowRight') {
              event.preventDefault()
              const tr = view.state.tr.insertText(ghost.text, ghost.pos)
              tr.setMeta(ghostPluginKey, null)
              tr.setMeta('ow-accept-ghost', { from: ghost.pos, to: ghost.pos + ghost.text.length })
              view.dispatch(tr)
              return true
            }
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(ghostPluginKey, null))
              return true
            }
            view.dispatch(view.state.tr.setMeta(ghostPluginKey, null))
            return false
          },
        },
      }),
    ]
  },
})
