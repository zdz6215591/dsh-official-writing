import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DOC_TYPE_LABEL, normalizeDocType } from '../shared/docTypes.ts'
import { asRecord, parseJsonObject } from '../shared/json.ts'
import { coerceAuditType, relocateIssues } from '../shared/locate.ts'
import type { AuditIssue, DocumentContext, RewriteMode } from '../shared/types.ts'
import { isEncrypted } from '../shared/types.ts'
import { AuditMarks, auditPluginKey } from './extensions/AuditMarks.ts'
import { countDocChars, getDocPlainText, pinIssuesToDoc } from './extensions/docText.ts'
import { DocumentTitle } from './extensions/DocumentTitle.ts'
import { GhostText } from './extensions/GhostText.ts'
import { RewriteMark } from './extensions/RewriteMark.ts'
import { AnnotationSidebar, focusIssueInDoc } from './components/AnnotationSidebar.tsx'
import { BubbleMenuBar } from './components/BubbleMenuBar.tsx'
import { FloatTools } from './components/FloatTools.tsx'
import { ModelCenter } from './components/ModelCenter.tsx'
import { RewritePanel } from './components/RewritePanel.tsx'
import { Toast, type ToastState } from './components/Toast.tsx'
import { WelcomeWizard } from './components/WelcomeWizard.tsx'
import { useGhostAutocomplete } from './hooks/useGhostAutocomplete.ts'
import { fetchCatalog, runStreamingJob } from './remote.ts'
import { EMPTY_HTML, getLibrary, patchLibrary, writeDoc, type WritingDoc } from './library.ts'
import { applySidebarLeft } from './sidebar.ts'

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
        type: coerceAuditType(
          row.type === 'typo' || row.type === 'insert' ? row.type : 'polish',
          typeof row.reason === 'string' ? row.reason : typeof row.explanation === 'string' ? row.explanation : '',
        ),
        original: typeof row.original === 'string' ? row.original : '',
        suggestion: typeof row.suggestion === 'string' ? row.suggestion : '',
        reason: typeof row.reason === 'string' ? row.reason : typeof row.explanation === 'string' ? row.explanation : '',
        context: typeof row.context === 'string' ? row.context : '',
        start: -1,
        end: -1,
      }
    }),
  )
}

export function Workbench({ ctx, onClose, doc }: { ctx: Context; onClose: () => void; doc: WritingDoc }) {
  const lib = useMemo(() => getLibrary(), [doc.id])
  const [docCtx, setDocCtx] = useState<DocumentContext | null>(doc.docCtx)
  const [showWizard, setShowWizard] = useState(!doc.wizardDone)
  const [showModels, setShowModels] = useState(false)
  const [issues, setIssues] = useState<AuditIssue[]>(doc.issues)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [charCount, setCharCount] = useState(0)
  const [ghostOn, setGhostOn] = useState(lib.ghostAuto)
  const [ghostForce, setGhostForce] = useState(0)
  const [deepOn, setDeepOn] = useState(lib.deepOn)
  const [routing, setRouting] = useState(lib.routing)
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
  const paperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const toastId = useRef(0)
  const persistTimer = useRef(0)
  const htmlRef = useRef(doc.html)

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    toastId.current += 1
    setToast({ id: toastId.current, message, type })
  }, [])

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return '标题'
          return ghostOn ? '光标停在段末约 5 秒后联想续写…' : '段末双击空格触发联想…'
        },
      }),
      DocumentTitle,
      GhostText,
      AuditMarks,
      RewriteMark,
    ],
    content: doc.html,
    editorProps: {
      attributes: { class: 'ow-doc-editor', spellcheck: 'false' },
    },
    onCreate: ({ editor: ed }) => {
      setCharCount(countDocChars(ed.getText()))
      if (!doc.issues.length) return
      const pinned = pinIssuesToDoc(ed.state.doc, doc.issues)
      setIssues(pinned)
      ed.commands.setAuditIssues(pinned)
    },
    onUpdate: ({ editor: ed }) => {
      htmlRef.current = ed.getHTML()
      setCharCount(countDocChars(ed.getText()))
    },
    onTransaction: ({ editor: ed, transaction }) => {
      const accepted = transaction.getMeta('ow-accept-ghost') as { from: number; to: number } | undefined
      if (accepted) {
        queueMicrotask(() => ed.commands.markApplied(`ghost-${Date.now()}`, accepted.from, accepted.to))
      }
      const st = auditPluginKey.getState(ed.state)
      const nextId = st?.activeId ?? null
      setActiveId((prev) => (prev === nextId ? prev : nextId))
      if (transaction.docChanged && st) {
        const live = st.issues
        setIssues((prev) => {
          if (
            prev.length === live.length &&
            prev.every((item, i) => item.id === live[i]?.id && item.from === live[i]?.from && item.to === live[i]?.to)
          ) {
            return prev
          }
          return live
        })
      }
    },
  })

  const encrypted = isEncrypted(docCtx)
  useGhostAutocomplete(
    ctx,
    editor,
    !showWizard && ghostOn,
    docCtx,
    routing,
    localReady,
    (msg) => showToast(msg, 'error'),
    ghostForce,
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
      writeDoc({
        id: doc.id,
        title: docCtx?.title || doc.title || '未命名公文',
        html: htmlRef.current,
        issues,
        docCtx,
        wizardDone: !showWizard && Boolean(docCtx),
        updatedAt: Date.now(),
      })
      patchLibrary({ ghostAuto: ghostOn, deepOn, routing })
    }, 200)
    return () => window.clearTimeout(persistTimer.current)
  }, [doc.id, doc.title, issues, docCtx, showWizard, ghostOn, deepOn, routing, charCount])

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
      const text = getDocPlainText(editor.state.doc).text
      if (!text.trim()) {
        showToast('请先输入正文', 'error')
        return
      }
      console.info('[dsh-official-writing] audit.send', text.replace(/\s+/g, ' ').slice(0, 160))
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
        const live = getDocPlainText(editor.state.doc).text
        const list = pinIssuesToDoc(editor.state.doc, parseIssues(raw, live))
        console.info('[dsh-official-writing] audit.live', { chars: live.replace(/\s/g, '').length, kept: list.length, originals: list.map((item) => item.original) })
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
    const ok = editor.commands.applySuggestion(issue)
    if (!ok) {
      showToast('定位不到原文，未改动', 'error')
      return
    }
    setIssues(auditPluginKey.getState(editor.state)?.issues || [])
    showToast('已采纳', 'success')
  }

  const onRewriteReplaced = (from: number, to: number) => {
    if (!editor) return
    editor.commands.markApplied(`rw-${Date.now()}`, from, to)
    setIssues(auditPluginKey.getState(editor.state)?.issues || [])
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
        onGhostManual={() => setGhostForce((n) => n + 1)}
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
          <div className="ow-doc-scroll" ref={docScrollRef}>
            <div className="ow-paper" ref={paperRef}>
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
            paperRef={paperRef}
            onHover={(id) => {
              setActiveId(id)
              editor?.commands.setActiveIssue(id)
            }}
            onAccept={acceptIssue}
            onDismiss={(id) => {
              editor?.commands.removeAuditIssue(id)
              setIssues((prev) => prev.filter((item) => item.id !== id))
            }}
            onDismissAll={() => {
              editor?.commands.clearAuditIssues()
              setIssues([])
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
                  htmlRef.current = EMPTY_HTML
                  editor?.commands.setContent(EMPTY_HTML)
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
