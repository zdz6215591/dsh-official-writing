import { useCallback, useEffect, useRef, useState } from 'react'
import { DOC_TYPES, type DocTypeId } from '../../shared/docTypes.ts'
import type { DocumentContext } from '../../shared/types.ts'

const MODES = [
  { id: 'normal' as const, label: '普通模式', desc: '可使用云端大模型，适合非涉密文稿。' },
  { id: 'encrypted' as const, label: '加密模式', desc: '切断云端，仅允许本地模型。' },
]

function modeFromInitial(initial?: DocumentContext | null) {
  if (initial?.forceLocal || initial?.secretLevel === 'confidential' || initial?.secretLevel === 'secret') {
    return 'encrypted' as const
  }
  return 'normal' as const
}

export function WelcomeWizard({
  onDone,
  onOpenModels,
  initial,
}: {
  onDone: (ctx: DocumentContext) => void
  onOpenModels: () => void
  initial?: DocumentContext | null
}) {
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'normal' | 'encrypted'>(modeFromInitial(initial))
  const [docType, setDocType] = useState<DocTypeId>((initial?.docType as DocTypeId) || 'notice_letter')
  const [title, setTitle] = useState(initial?.title || '')
  const [intent, setIntent] = useState(initial?.intent || initial?.topic || '')
  const [error, setError] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const intentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setFocusIdx(0)
    if (step === 2) window.setTimeout(() => titleRef.current?.focus(), 30)
    else cardRef.current?.focus()
  }, [step])

  const finish = useCallback(() => {
    if (!title.trim()) {
      setError('请填写公文标题')
      titleRef.current?.focus()
      return
    }
    onDone({
      secretLevel: mode === 'encrypted' ? 'confidential' : 'public',
      docType,
      title: title.trim(),
      intent: intent.trim(),
      topic: intent.trim() || title.trim(),
      forceLocal: mode === 'encrypted',
    })
  }, [mode, docType, title, intent, onDone])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    const inField = tag === 'INPUT' || tag === 'TEXTAREA'
    if (e.key === 'Escape') return
    if (step === 2 && inField) {
      if (e.key === 'Enter' && tag === 'INPUT') {
        e.preventDefault()
        finish()
      }
      if (e.key === 'ArrowDown' && tag === 'INPUT') {
        e.preventDefault()
        intentRef.current?.focus()
      }
      if (e.key === 'ArrowUp' && tag === 'TEXTAREA') {
        e.preventDefault()
        titleRef.current?.focus()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        finish()
      }
      return
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (step === 0) {
        const n = (focusIdx + 1) % MODES.length
        setFocusIdx(n)
        setMode(MODES[n]!.id)
      } else if (step === 1) {
        const n = (focusIdx + 1) % DOC_TYPES.length
        setFocusIdx(n)
        setDocType(DOC_TYPES[n]!.id)
      }
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (step === 0) {
        const n = (focusIdx - 1 + MODES.length) % MODES.length
        setFocusIdx(n)
        setMode(MODES[n]!.id)
      } else if (step === 1) {
        const n = (focusIdx - 1 + DOC_TYPES.length) % DOC_TYPES.length
        setFocusIdx(n)
        setDocType(DOC_TYPES[n]!.id)
      } else if (step > 0 && !inField) setStep((s) => s - 1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (step < 2) setStep((s) => s + 1)
      else finish()
    }
  }

  return (
    <div className="ow-wizard-overlay" onKeyDown={onKeyDown}>
      <div className="ow-wizard-card" ref={cardRef} tabIndex={0} role="dialog" aria-modal="true" aria-label="写作引导">
        <div className="ow-wizard-brand">
          <div className="ow-wizard-logo">文</div>
          <div>
            <h1>机关公文写作助手</h1>
            <p>沉浸写作 · 文体分明</p>
          </div>
        </div>
        <div className="ow-wizard-steps">
          {['模式', '文体', '标题'].map((t, i) => (
            <div key={t} className={`ow-wstep ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <span>{i + 1}</span>
              {t}
            </div>
          ))}
        </div>
        <div className="ow-wizard-scroll">
          {step === 0 && (
            <div className="ow-wizard-body">
              <h2>写作模式</h2>
              <div className="ow-option-grid two-only">
                {MODES.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`ow-option-card ${m.id === 'encrypted' ? 'encrypted' : ''} ${mode === m.id ? 'selected' : ''} ${focusIdx === i ? 'kb-focus' : ''}`}
                    onClick={() => {
                      setMode(m.id)
                      setFocusIdx(i)
                    }}
                  >
                    <strong>{m.label}</strong>
                    <span>{m.desc}</span>
                  </button>
                ))}
              </div>
              {mode === 'encrypted' && (
                <div className="ow-warn-banner">
                  加密模式将切断云端。请先在
                  <button type="button" className="ow-linkish" onClick={onOpenModels}>
                    设置
                  </button>
                  配置本地模型。
                </div>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="ow-wizard-body">
              <h2>选择文体</h2>
              <div className="ow-doc-type-list">
                {DOC_TYPES.map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`ow-doc-type-item ${docType === d.id ? 'selected' : ''} ${focusIdx === i ? 'kb-focus' : ''}`}
                    onClick={() => {
                      setDocType(d.id)
                      setFocusIdx(i)
                    }}
                  >
                    <strong>{d.label}</strong>
                    <span className="desc">{d.desc}</span>
                    <span className="hint">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="ow-wizard-body">
              <h2>标题与意图</h2>
              <label className="ow-field-label">
                公文标题 <em className="req">必填</em>
                <input
                  ref={titleRef}
                  className="ow-topic-input"
                  type="text"
                  placeholder="例如：关于做好2026年度干部档案专项审核工作的通知"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="ow-field-label">
                写作意图 / 目标 <em className="opt">选填</em>
                <textarea
                  ref={intentRef}
                  className="ow-topic-input"
                  rows={4}
                  placeholder="例如：突出审核时限与责任分工；语气坚决"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                />
              </label>
              {error && <div className="ow-error-text">{error}</div>}
            </div>
          )}
        </div>
        <div className="ow-wizard-footer">
          {step > 0 ? (
            <button type="button" className="ow-btn ghost" onClick={() => setStep((s) => s - 1)}>
              上一步
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button type="button" className="ow-btn primary" onClick={() => setStep((s) => s + 1)}>
              下一步
            </button>
          ) : (
            <button type="button" className="ow-btn primary" onClick={finish}>
              开始起草
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
