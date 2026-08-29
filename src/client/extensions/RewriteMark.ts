import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type RewriteMarkState = { from: number; to: number } | null
export const rewriteMarkKey = new PluginKey<RewriteMarkState>('owRewriteMark')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    owRewriteMark: {
      setRewriteMark: (from: number, to: number) => ReturnType
      clearRewriteMark: () => ReturnType
    }
  }
}

export const RewriteMark = Extension.create({
  name: 'owRewriteMark',
  addCommands() {
    return {
      setRewriteMark:
        (from: number, to: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(rewriteMarkKey, { from, to }))
          return true
        },
      clearRewriteMark:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(rewriteMarkKey, null))
          return true
        },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: rewriteMarkKey,
        state: {
          init: () => null as RewriteMarkState,
          apply(tr, value) {
            const meta = tr.getMeta(rewriteMarkKey)
            if (meta !== undefined) return meta as RewriteMarkState
            if (!value) return null
            if (tr.docChanged) {
              const from = tr.mapping.map(value.from, 1)
              const to = tr.mapping.map(value.to, -1)
              if (from >= to) return null
              return { from, to }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const mark = rewriteMarkKey.getState(state)
            if (!mark || mark.from >= mark.to || mark.to > state.doc.content.size) return null
            return DecorationSet.create(state.doc, [
              Decoration.inline(mark.from, mark.to, { class: 'ow-rewrite-source-mark' }),
            ])
          },
        },
      }),
    ]
  },
})
