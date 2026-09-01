import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const DocumentTitle = Extension.create({
  name: 'owDocumentTitle',
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        const parent = $from.parent
        if (parent.type.name !== 'heading' || parent.attrs.level !== 1) return false
        if ($from.index(0) !== 0) return false
        if (!empty) return false
        if ($from.parentOffset === 0) return true
        if (parent.content.size === 0) return true
        return false
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('owDocumentTitle'),
        appendTransaction(_trs, _old, state) {
          const heading = state.schema.nodes.heading
          const paragraph = state.schema.nodes.paragraph
          if (!heading) return null
          const first = state.doc.firstChild
          if (first && first.type === heading && first.attrs.level === 1) return null
          const tr = state.tr.insert(0, heading.create({ level: 1 }))
          if (state.doc.content.size === 0 && paragraph) tr.insert(tr.doc.content.size, paragraph.create())
          return tr.setMeta('addToHistory', false)
        },
      }),
    ]
  },
})
