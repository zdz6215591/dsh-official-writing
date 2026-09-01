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
  auto: boolean,
  docCtx: DocumentContext | null,
  routing: TaskRouting,
  localReady: boolean,
  onError?: (message: string) => void,
  forceToken = 0,
) {
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const runningRef = useRef(false)
  const onErrorRef = useRef(onError)
  const docCtxRef = useRef(docCtx)
  const routingRef = useRef(routing)
  const localReadyRef = useRef(localReady)
  const autoRef = useRef(auto)
  onErrorRef.current = onError
  docCtxRef.current = docCtx
  routingRef.current = routing
  localReadyRef.current = localReady
  autoRef.current = auto

  useEffect(() => {
    if (!editor) return

    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const ghostPosRef = { current: -1 }
    const cancel = (abortJob = true) => {
      if (abortJob) {
        abortRef.current?.abort()
        abortRef.current = null
        runningRef.current = false
      }
      seqRef.current += 1
      ghostPosRef.current = -1
      clearTimer()
      editor.commands.clearGhost()
    }

    const run = async (pos: number) => {
      if (isEncrypted(docCtxRef.current) && !localReadyRef.current) {
        onErrorRef.current?.('加密模式无可用本地模型，已禁用智能联想')
        return
      }
      if (runningRef.current) return
      const seq = ++seqRef.current
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      runningRef.current = true
      const safe = Math.max(0, Math.min(pos, editor.state.doc.content.size))
      ghostPosRef.current = safe
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
              editor.commands.setGhost({
                pos: ghostPosRef.current < 0 ? safe : ghostPosRef.current,
                text: acc,
                loading: false,
              })
            },
          },
          ac.signal,
        )
        if (seqRef.current !== seq) return
        const shown = (finalText || acc).replace(/\s+/g, ' ').trim()
        if (!shown) {
          editor.commands.clearGhost()
          return
        }
        editor.commands.setGhost({ pos: safe, text: shown, loading: false })
      } catch (error: any) {
        if (seqRef.current !== seq || error?.name === 'AbortError') return
        editor.commands.clearGhost()
        onErrorRef.current?.(error?.message || '智能联想失败')
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null
          runningRef.current = false
        }
      }
    }

    const schedule = () => {
      if (!autoRef.current) return
      if (!shouldTrigger(editor) || !enoughContext(editor)) return
      if (runningRef.current) return
      if (timerRef.current) return
      const pos = editor.state.selection.from
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        if (!autoRef.current) return
        if (!shouldTrigger(editor)) return
        if (Math.abs(editor.state.selection.from - pos) > 1) return
        void run(editor.state.selection.from)
      }, IDLE_MS)
    }

    const onTransaction = ({ transaction }: { transaction: any }) => {
      if (transaction.getMeta(ghostPluginKey) !== undefined) return
      if (transaction.getMeta('ow-accept-ghost')) return
      if (transaction.getMeta('ow-ghost-manual')) {
        clearTimer()
        void run(editor.state.selection.from)
        return
      }
      const userEdit = transaction.docChanged && transaction.steps?.length
      if (userEdit) {
        if (runningRef.current) cancel(true)
        else {
          clearTimer()
          editor.commands.clearGhost()
        }
        schedule()
        return
      }
      if (!transaction.selectionSet || transaction.docChanged) return
      if (ghostPosRef.current >= 0 && Math.abs(editor.state.selection.from - ghostPosRef.current) > 2) {
        if (!runningRef.current) editor.commands.clearGhost()
      }
      schedule()
    }

    editor.on('transaction', onTransaction)
    if (auto) schedule()
    return () => {
      editor.off('transaction', onTransaction)
      clearTimer()
    }
  }, [ctx, editor, auto])

  useEffect(() => {
    if (!editor || !forceToken) return
    if (!shouldTrigger(editor) || !enoughContext(editor)) return
    editor.view.dispatch(editor.state.tr.setMeta('ow-ghost-manual', true))
  }, [editor, forceToken])
}
