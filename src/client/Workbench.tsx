import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DOC_TYPE_LABEL, normalizeDocType } from '../shared/docTypes.ts'
import { asRecord, parseJsonObject } from '../shared/json.ts'
import { locateInText, relocateIssues } from '../shared/locate.ts'
import type { AuditIssue, DocumentContext, RewriteMode } from '../shared/types.ts'
import { isEncrypted } from '../shared/types.ts'
import { AuditMarks, auditPluginKey } from './extensions/AuditMarks.ts'
import { countDocChars, getDocPlainText } from './extensions/docText.ts'
import { GhostText } from './extensions/GhostText.ts'
import { RewriteMark } from './extensions/RewriteMark.ts'
import { AnnotationSidebar, focusIssueInDoc } from './components/AnnotationSidebar.tsx'
import { CommentConnectors } from './components/CommentConnectors.tsx'
import { BubbleMenuBar } from './components/BubbleMenuBar.tsx'
import { FloatTools } from './components/FloatTools.tsx'
import { ModelCenter } from './components/ModelCenter.tsx'
import { RewritePanel } from './components/RewritePanel.tsx'
import { Toast, type ToastState } from './components/Toast.tsx'
import { WelcomeWizard } from './components/WelcomeWizard.tsx'
import { useGhostAutocomplete } from './hooks/useGhostAutocomplete.ts'
import { fetchCatalog, runStreamingJob } from './remote.ts'
import { applySidebarLeft } from './sidebar.ts'
import { clearState, loadState, saveState } from './storage.ts'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseIssues(raw: string, text: string): AuditIssue[] {
  let parsed: unknown
  try {
    parsed = parseJsonObject(raw)
  } catch {
    return []
  }
  const record = asRecord(parsed)
  const list = record?.suggestions
  if (!Array.isArray(list)) return []
  return relocateIssues(
    text,
    list.map((item, i) => {
      const row = asRecord(item) || {}
      return {
        id: typeof row.id === 'string' ? row.id : `audit-${i}`,
        type: row.type === 'typo' || row.type === 'insert' ? row.type : 'polish',
        original: typeof row.original === 'string' ? row.original : '',
        suggestion: typeof row.suggestion === 'string' ? row.suggestion : '',
        reason: typeof row.reason === 'string' ? row.reason : typeof row.explanation === 'string' ? row.explanation : '',
        context: typeof row.context === 'string' ? row.context : '',
        start: typeof row.start === 'number' ? row.start : 0,
        end: typeof row.end === 'number' ? row.end : 0,
      }
    }),
  )
}

export function Workbench({ ctx, onClose }: { ctx: Context; onClose: () => void }) {
  const initial = useMemo(() => loadState(), [])
  const [docCtx, setDocCtx] = useState<DocumentContext | null>(initial.docCtx)
  const [showWizard, setShowWizard] = useState(!initial.wizardDone)
  const [showModels, setShowModels] = useState(false)
  const [issues, setIssues] = useState<AuditIssue[]>(initial.issues)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [charCount, setCharCount] = useState(0)
  const [ghostOn, setGhostOn] = useState(initial.ghostOn)
  const [deepOn, setDeepOn] = useState(initial.deepOn)
  const [routing, setRouting] = useState(initial.routing)
  const [localReady, setLocalReady] = useState(false)
  const [rewrite, setRewrite] = useState<{
    open: boolean
    text: string
    from: number
    to: number
    mode: RewriteMode
  }>({ open: false, text: '', from: 0, to: 0, mode: 'expand' })
  const [confirmReset, setConfirmReset] = useState(false)

  const docScrollRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const toastId = useRef(0)
  const persistTimer = useRef(0)
  const htmlRef = useRef(initial.html)

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    toastId.current += 1
    setToast({ id: toastId.current, message, type })
  }, [])

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: '光标停在段末约 5 秒后联想续写…' }),
      GhostText,
      AuditMarks,
      RewriteMark,
    ],
    content: initial.html,
    editorProps: {
      attributes: { class: 'ow-doc-editor', spellcheck: 'false' },
    },
    onCreate: ({ editor: ed }) => setCharCount(countDocChars(ed.getText())),
    onUpdate: ({ editor: ed }) => {
      htmlRef.current = ed.getHTML()
      setCharCount(countDocChars(ed.getText()))
      const { text } = getDocPlainText(ed.state.doc)
      setIssues((prev) => {
        if (!prev.length) return prev
        const next = relocateIssues(text, prev)
        if (
          next.length === prev.length &&
          next.every(
            (item, i) => item.id === prev[i]?.id && item.start === prev[i]?.start && item.end === prev[i]?.end,
          )
        ) {
          return prev
        }
        return next
      })
    },
    onTransaction: ({ editor: ed, transaction }) => {
      const accepted = transaction.getMeta('ow-accept-ghost') as { from: number; to: number } | undefined
      if (accepted) {
        queueMicrotask(() => ed.commands.markApplied(`ghost-${Date.now()}`, accepted.from, accepted.to))
      }
      const nextId = auditPluginKey.getState(ed.state)?.activeId ?? null
      setActiveId((prev) => (prev === nextId ? prev : nextId))
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.commands.setAuditIssues(issues)
  }, [editor, issues])

  const encrypted = isEncrypted(docCtx)
  useGhostAutocomplete(ctx, editor, !showWizard && ghostOn, docCtx, routing, localReady, (msg) =>
    showToast(msg, 'error'),
  )

  useEffect(() => {
    if (!ghostOn) editor?.commands.clearGhost()
  }, [ghostOn, editor])

  useEffect(() => {
    const sync = () => applySidebarLeft()
    sync()
    window.addEventListener('resize', sync)
    const observed = new Set<Element>()
    const ro = new ResizeObserver(sync)
    const attach = () => {
      const settings = Array.from(document.querySelectorAll('button')).find((button) => {
        const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`
        return button.getAttribute('aria-haspopup') === 'dialog' && /设置|Settings/.test(label)
      })
      let el: HTMLElement | null = settings ?? null
      while (el && el !== document.body) {
        if (!observed.has(el)) {
          ro.observe(el)
          observed.add(el)
        }
        el = el.parentElement
      }
    }
    attach()
    const mo = new MutationObserver(() => {
      attach()
      sync()
    })
    mo.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-sidebar-collapsed', 'class', 'style'],
    })
    const timer = window.setInterval(sync, 200)
    return () => {
      window.removeEventListener('resize', sync)
      ro.disconnect()
      mo.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      for (let i = 0; i < 25 && !cancelled; i++) {
        try {
          const snap = await fetchCatalog(ctx)
          if (cancelled) return
          setLocalReady(snap.models.some((m) => m.local))
          return
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      }
      if (!cancelled) setLocalReady(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [ctx, showModels])

  useEffect(() => {
    window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      saveState({
        html: htmlRef.current,
        issues,
        docCtx,
        wizardDone: !showWizard && Boolean(docCtx),
        ghostOn,
        deepOn,
        routing,
      })
    }, 200)
    return () => window.clearTimeout(persistTimer.current)
  }, [issues, docCtx, showWizard, ghostOn, deepOn, routing, charCount])

  const seedTitle = useCallback(
    (ctxDoc: DocumentContext) => {
      if (!editor) return
      const t = (ctxDoc.title || '').trim()
      if (!t) return
      const first = editor.state.doc.firstChild
      const current = first?.textContent?.trim() || ''
      if (!current) editor.commands.setContent(`<h1>${escapeHtml(t)}</h1><p></p>`)
    },
    [editor],
  )

  const runAudit = useCallback(
    async (depth: 'quick' | 'deep') => {
      if (!editor) return
      if (encrypted && !localReady) {
        showToast('加密模式无可用本地模型，已禁用校核', 'error')
        return
      }
      const { text } = getDocPlainText(editor.state.doc)
      if (!text.trim()) {
        showToast('请先输入正文', 'error')
        return
      }
      setAuditing(true)
      showToast(depth === 'deep' ? '深度校验中…' : '快速校验中…', 'info')
      setIssues([])
      editor.commands.clearAuditIssues()
      try {
        const raw = await runStreamingJob(ctx, {
          task: 'audit',
          text,
          depth,
          docType: docCtx?.docType,
          title: docCtx?.title,
          intent: docCtx?.intent,
          encrypted,
          route: routing.audit,
          effort: depth === 'deep' ? routing.auditEffort : '',
        })
        const list = parseIssues(raw, text)
        setIssues(list)
        editor.commands.setAuditIssues(list)
        const tag = depth === 'deep' ? '深度' : '快速'
        showToast(list.length ? `${tag}校验：${list.length} 条批注` : `${tag}校验：未发现明显问题`, list.length ? 'info' : 'success')
      } catch (e: any) {
        showToast(e.message || '校验失败', 'error')
      } finally {
        setAuditing(false)
      }
    },
    [editor, encrypted, localReady, ctx, docCtx, routing, showToast],
  )

  const acceptIssue = (issue: AuditIssue) => {
    if (!editor) return
    const { text } = getDocPlainText(editor.state.doc)
    if (!locateInText(text, issue)) {
      showToast('定位不到原文，未改动', 'error')
      return
    }
    const ok = editor.commands.applySuggestion(issue)
    if (!ok) {
      showToast('定位不到原文，未改动', 'error')
      return
    }
    const nextText = getDocPlainText(editor.state.doc).text
    const rest = relocateIssues(
      nextText,
      issues.filter((item) => item.id !== issue.id),
    )
    setIssues(rest)
    editor.commands.setAuditIssues(rest)
    showToast('已采纳', 'success')
  }

  const onRewriteReplaced = (from: number, to: number) => {
    editor?.commands.markApplied(`rw-${Date.now()}`, from, to)
    if (editor) {
      const rest = relocateIssues(getDocPlainText(editor.state.doc).text, issues)
      setIssues(rest)
      editor.commands.setAuditIssues(rest)
    }
    showToast('已替换', 'success')
  }

  const copyAll = async () => {
    const text = editor?.getText() || ''
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制到剪贴板（当前环境无 Word 导出）', 'success')
    } catch {
      showToast('复制失败', 'error')
    }
  }

  if (showWizard) {
    return (
      <div className="ow-root">
        <WelcomeWizard
          initial={docCtx}
          onOpenModels={() => setShowModels(true)}
          onDone={(next) => {
            setDocCtx(next)
            setShowWizard(false)
            seedTitle(next)
          }}
        />
        <ModelCenter
          ctx={ctx}
          open={showModels}
          onClose={() => setShowModels(false)}
          routing={routing}
          onSaveRouting={setRouting}
          encrypted={isEncrypted(docCtx)}
        />
      </div>
    )
  }

  const docTypeLabel = DOC_TYPE_LABEL[normalizeDocType(docCtx?.docType)] || '公文'

  return (
    <div className="ow-root">
      <div className={`ow-mode-watermark ${encrypted ? 'encrypted' : ''}`} aria-hidden>
        <span>{encrypted ? '加密模式' : '普通模式'}</span>
      </div>
      <FloatTools
        ghostOn={ghostOn}
        onGhostChange={setGhostOn}
        deepOn={deepOn}
        onDeepChange={setDeepOn}
        auditing={auditing}
        onAudit={runAudit}
        onSettings={() => setShowModels(true)}
        onGuide={() => setConfirmReset(true)}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <header className="ow-chrome">
        <button type="button" className="ow-btn ghost sm" onClick={onClose}>
          收起
        </button>
        <div className="ow-chrome-title">公文写作助手</div>
        <button type="button" className="ow-btn ghost sm" onClick={() => void copyAll()}>
          导出
        </button>
      </header>
      {encrypted && !localReady && (
        <div className="ow-lock-banner">加密模式：当前没有可用的本地模型，智能联想 / 校核 / 改写已禁用，不会把正文送出本地。</div>
      )}
      <main className="ow-workspace">
        <div className="ow-stage" ref={stageRef}>
          <CommentConnectors editor={editor} issues={issues} activeId={activeId} stageRef={stageRef} />
          <div className="ow-doc-scroll" ref={docScrollRef}>
            <div className="ow-paper">
              <div className="ow-paper-topbar">
                <div className="ow-meta-left">
                  <span className="ow-paper-badge">{docTypeLabel}</span>
                  <span className="ow-topic-line" title={docCtx?.intent || docCtx?.title}>
                    {docCtx?.intent || docCtx?.title}
                  </span>
                </div>
                <div className="ow-char-count">
                  <span className="num">{charCount.toLocaleString('zh-CN')}</span>
                  <span className="unit">字</span>
                </div>
              </div>
              <div className="ow-paper-body">
                <EditorContent editor={editor} />
              </div>
              <RewritePanel
                ctx={ctx}
                editor={editor}
                open={rewrite.open}
                selectedText={rewrite.text}
                from={rewrite.from}
                to={rewrite.to}
                initialMode={rewrite.mode}
                docCtx={docCtx}
                routing={routing}
                localReady={localReady}
                onClose={() => setRewrite((r) => ({ ...r, open: false }))}
                onReplaced={onRewriteReplaced}
                onError={(msg) => showToast(msg, 'error')}
              />
            </div>
          </div>
          <AnnotationSidebar
            editor={editor}
            issues={issues}
            activeId={activeId}
            auditing={auditing}
            onHover={(id) => {
              setActiveId(id)
              editor?.commands.setActiveIssue(id)
            }}
            onAccept={acceptIssue}
            onDismiss={(id) => {
              const rest = issues.filter((i) => i.id !== id)
              setIssues(rest)
              editor?.commands.setAuditIssues(rest)
            }}
            onDismissAll={() => {
              setIssues([])
              editor?.commands.clearAuditIssues()
            }}
            onFocusIssue={(id) => {
              const issue = issues.find((i) => i.id === id)
              if (!issue || !editor) return
              setActiveId(id)
              editor.commands.setActiveIssue(id)
              focusIssueInDoc(editor, issue, docScrollRef)
            }}
          />
          <BubbleMenuBar
            editor={editor}
            hidden={rewrite.open}
            onRewrite={(payload) => setRewrite({ open: true, ...payload })}
          />
        </div>
      </main>
      <ModelCenter
        ctx={ctx}
        open={showModels}
        onClose={() => setShowModels(false)}
        routing={routing}
        onSaveRouting={(next) => {
          setRouting(next)
          showToast('任务路由已保存', 'success')
        }}
        encrypted={encrypted}
      />
      {confirmReset && (
        <div className="ow-modal-overlay" onClick={() => setConfirmReset(false)}>
          <div className="ow-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>重新走引导？</h3>
            <p>将清空正文、标题、文体与批注，此操作不可撤销。</p>
            <div className="ow-row-actions">
              <button type="button" className="ow-btn ghost" onClick={() => setConfirmReset(false)}>
                取消
              </button>
              <button
                type="button"
                className="ow-btn primary"
                onClick={() => {
                  clearState()
                  htmlRef.current = '<h1></h1><p></p>'
                  editor?.commands.setContent('<h1></h1><p></p>')
                  editor?.commands.clearAuditIssues()
                  setIssues([])
                  setDocCtx(null)
                  setConfirmReset(false)
                  setShowWizard(true)
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
