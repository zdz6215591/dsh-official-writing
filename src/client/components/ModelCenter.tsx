import { useEffect, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { CatalogSnapshot, ModelOption, TaskRouting } from '../../shared/types.ts'
import { routeKey } from '../../shared/types.ts'
import { fetchCatalog } from '../remote.ts'

function labelOf(model: ModelOption) {
  return `${model.providerName} / ${model.modelName}${model.local ? ' · 本地' : ''}`
}

export function ModelCenter({
  ctx,
  open,
  onClose,
  routing,
  onSaveRouting,
  encrypted,
}: {
  ctx: Context
  open: boolean
  onClose: () => void
  routing: TaskRouting
  onSaveRouting: (next: TaskRouting) => void
  encrypted: boolean
}) {
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(routing)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(routing)
    setError('')
    setBusy(true)
    void fetchCatalog(ctx)
      .then((snap) => {
        setCatalog(snap)
        if (!snap.models.length) setError(snap.failures[0]?.message || '当前没有可用的 dsh 模型')
      })
      .catch((e: Error) => {
        setCatalog({ models: [], failures: [] })
        setError(e.message || '获取模型列表失败')
      })
      .finally(() => setBusy(false))
  }, [open, ctx, routing])

  const options = useMemo(() => {
    const models = catalog?.models || []
    return encrypted ? models.filter((m) => m.local) : models
  }, [catalog, encrypted])

  if (!open) return null

  const selectValue = (key: 'autocomplete' | 'audit' | 'rewrite') => {
    const current = draft[key]
    if (options.some((m) => routeKey(m.provider, m.model) === current)) return current
    return options[0] ? routeKey(options[0].provider, options[0].model) : ''
  }

  const effortsFor = (route: string) => options.find((m) => routeKey(m.provider, m.model) === route)?.efforts || []

  return (
    <div className="ow-modal-overlay" onClick={onClose}>
      <div className="ow-modal ow-model-center" onClick={(e) => e.stopPropagation()}>
        <header className="ow-modal-header">
          <h2>设置 · 模型</h2>
          <button type="button" className="ow-icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="ow-routing-panel">
          <p className="ow-muted">
            模型一律来自 dsh。联想 / 校核 / 改写可分别选用；思考等级默认为最低档。联想始终关闭深度思考。
          </p>
          {encrypted && (
            <div className="ow-warn-banner">加密模式仅列出本地模型。若列表为空，请先在 dsh 中配置本地提供方。</div>
          )}
          {busy && <div className="ow-muted">正在读取 dsh 模型目录…</div>}
          {!busy && options.length === 0 && (
            <div className="ow-warn-banner">{error || '当前没有可用的 dsh 模型，请先在系统设置中配置。'}</div>
          )}
          {!busy && options.length > 0 && (
            <>
              {(
                [
                  ['autocomplete', '智能联想（建议低延迟，强制关闭思考）'],
                  ['audit', '智能校核'],
                  ['rewrite', '选区改写'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select
                    value={selectValue(key)}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  >
                    {options.map((m) => (
                      <option key={routeKey(m.provider, m.model)} value={routeKey(m.provider, m.model)}>
                        {labelOf(m)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                校核思考等级（快速档忽略此项；深度档使用）
                <select
                  value={draft.auditEffort}
                  onChange={(e) => setDraft({ ...draft, auditEffort: e.target.value })}
                >
                  <option value="">最低（默认）</option>
                  {effortsFor(selectValue('audit')).map((effort) => (
                    <option key={effort.id} value={effort.id}>
                      {effort.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                改写思考等级
                <select
                  value={draft.rewriteEffort}
                  onChange={(e) => setDraft({ ...draft, rewriteEffort: e.target.value })}
                >
                  <option value="">最低（默认）</option>
                  {effortsFor(selectValue('rewrite')).map((effort) => (
                    <option key={effort.id} value={effort.id}>
                      {effort.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ow-row-actions">
                <button
                  type="button"
                  className="ow-btn primary"
                  onClick={() => {
                    onSaveRouting({
                      ...draft,
                      autocomplete: selectValue('autocomplete'),
                      audit: selectValue('audit'),
                      rewrite: selectValue('rewrite'),
                    })
                    onClose()
                  }}
                >
                  保存路由
                </button>
              </div>
            </>
          )}
          {catalog?.failures.length ? (
            <div className="ow-muted ow-sm" style={{ marginTop: 12 }}>
              部分提供方读取失败：{catalog.failures.map((f) => `${f.name}（${f.message}）`).join('；')}
            </div>
          ) : null}
          {error && options.length > 0 && <div className="ow-error-text">{error}</div>}
        </div>
      </div>
    </div>
  )
}
