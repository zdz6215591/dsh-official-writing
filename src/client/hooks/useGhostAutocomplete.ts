import { useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { Editor } from '@tiptap/react'
import type { DocumentContext, TaskRouting } from '../../shared/types.ts'
import { isEncrypted } from '../../shared/types.ts'
import { ghostPluginKey } from '../extensions/GhostText.ts'
import { runStreamingJob } from '../remote.ts'

const IDLE_MS = 5000
const MIN_CHARS = 4
const PERIOD = new Set(['。', '.', '！', '!', '？', '?'])

function charBefore(editor: Editor, pos: number) {
  if (pos <= 1) return ''
  return editor.state.doc.textBetween(Math.max(0, pos - 1), pos, '')
}

function atParagraphEnd(editor: Editor) {
  const { $from, empty } = editor.state.selection
  if (!empty) return false
  return $from.parentOffset === $from.parent.content.size
}

function enoughContext(editor: Editor) {
  return editor.getText().replace(/\s/g, '').length >= MIN_CHARS
}

function shouldTrigger(editor: Editor) {
  const { empty, from } = editor.state.selection
  if (!empty) return false
  if (!atParagraphEnd(editor)) return false
  const parent = editor.state.selection.$from.parent
  const emptyPara = parent.content.size === 0
  const ch = charBefore(editor, from)
  return emptyPara || PERIOD.has(ch) || atParagraphEnd(editor)
}

export function useGhostAutocomplete(
  ctx: Context,
  editor: Editor | null,
  enabled: boolean,
  docCtx: DocumentContext | null,
  routing: TaskRouting,
  localReady: boolean,
  onError?: (message: string) => void,
) {
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const onErrorRef = useRef(onError)
  const docCtxRef = useRef(docCtx)
  const routingRef = useRef(routing)
  const localReadyRef = useRef(localReady)
  onErrorRef.current = onError
  docCtxRef.current = docCtx
  routingRef.current = routing
  localReadyRef.current = localReady

  useEffect(() => {
    if (!editor || !enabled) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      abortRef.current?.abort()
      editor?.commands.clearGhost()
      return
    }

    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const cancel = () => {
      abortRef.current?.abort()
      abortRef.current = null
      seqRef.current += 1
      clearTimer()
      editor.commands.clearGhost()
    }

    const run = async (pos: number) => {
      if (isEncrypted(docCtxRef.current) && !localReadyRef.current) {
        onErrorRef.current?.('加密模式无可用本地模型，已禁用智能联想')
        return
      }
      const seq = ++seqRef.current
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      const safe = Math.max(0, Math.min(pos, editor.state.doc.content.size))
      editor.commands.setGhost({ pos: safe, text: '', loading: true })
      let acc = ''
      try {
        const finalText = await runStreamingJob(
          ctx,
          {
            task: 'autocomplete',
            text: editor.getText(),
            textBefore: editor.state.doc.textBetween(0, safe, '\n'),
            textAfter: editor.state.doc.textBetween(safe, editor.state.doc.content.size, '\n'),
            docType: docCtxRef.current?.docType,
            title: docCtxRef.current?.title,
            intent: docCtxRef.current?.intent,
            encrypted: isEncrypted(docCtxRef.current),
            route: routingRef.current.autocomplete,
          },
          {
            onDelta: (chunk) => {
              if (seqRef.current !== seq) return
              acc += chunk
              editor.commands.setGhost({ pos: safe, text: acc, loading: false })
            },
          },
          ac.signal,
        )
        if (seqRef.current !== seq) return
        const shown = (finalText || acc).trim()
        if (!shown) {
          editor.commands.clearGhost()
          onErrorRef.current?.('未生成建议')
          return
        }
        editor.commands.setGhost({ pos: safe, text: shown, loading: false })
      } catch (error: any) {
        if (seqRef.current !== seq || error?.name === 'AbortError') return
        editor.commands.clearGhost()
        onErrorRef.current?.(error?.message || '智能联想失败')
      }
    }

    const schedule = () => {
      clearTimer()
      abortRef.current?.abort()
      editor.commands.clearGhost()
      if (!shouldTrigger(editor) || !enoughContext(editor)) return
      const pos = editor.state.selection.from
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        if (!shouldTrigger(editor)) return
        if (Math.abs(editor.state.selection.from - pos) > 1) return
        void run(editor.state.selection.from)
      }, IDLE_MS)
    }

    const onTransaction = ({ transaction }: { transaction: any }) => {
      if (transaction.getMeta(ghostPluginKey) !== undefined) return
      if (transaction.getMeta('ow-accept-ghost')) return
      if (transaction.docChanged || transaction.selectionSet) schedule()
    }

    editor.on('transaction', onTransaction)
    schedule()
    return () => {
      editor.off('transaction', onTransaction)
      cancel()
    }
  }, [ctx, editor, enabled])
}
