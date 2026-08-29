import { useEffect, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { CatalogSnapshot, ModelOption, TaskRouting } from '../../shared/types.ts'
import { routeKey } from '../../shared/types.ts'
import { fetchCatalog } from '../remote.ts'

function labelOf(model: ModelOption) {
  return `${model.providerName} / ${model.modelName}${model.local ? ' · 本地' : ''}`
}

const TASKS = [
  {
    key: 'autocomplete' as const,
    effortKey: null,
    title: '智能联想',
    hint: '停笔后续写。思考固定最低档，以保证出字速度。',
  },
  {
    key: 'audit' as const,
    effortKey: 'auditEffort' as const,
    title: '智能校核',
    hint: '快速校验忽略思考；深度校验使用右侧等级。',
  },
  {
    key: 'rewrite' as const,
    effortKey: 'rewriteEffort' as const,
    title: '选区改写',
    hint: '改写时使用该模型与思考等级。',
  },
]

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
          <h2>模型</h2>
          <button type="button" className="ow-icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="ow-routing-panel">
          <p className="ow-muted ow-sm">模型一律来自 dsh。每项任务在同一行选择模型与思考等级。</p>
          {encrypted && (
            <div className="ow-warn-banner">加密模式仅列出本地模型。若列表为空，请先在 dsh 中配置本地提供方。</div>
          )}
          {busy && <div className="ow-muted">正在读取 dsh 模型目录…</div>}
          {!busy && options.length === 0 && (
            <div className="ow-warn-banner">{error || '当前没有可用的 dsh 模型，请先在系统设置中配置。'}</div>
          )}
          {!busy && options.length > 0 && (
            <>
              {TASKS.map((task) => {
                const route = selectValue(task.key)
                const efforts = effortsFor(route)
                const effortValue = task.effortKey ? draft[task.effortKey] : ''
                return (
                  <section key={task.key} className="ow-route-card">
                    <div className="ow-route-card-head">
                      <strong>{task.title}</strong>
                      <span>{task.hint}</span>
                    </div>
                    <div className="ow-route-row">
                      <label>
                        模型
                        <select
                          value={route}
                          onChange={(e) => {
                            const next = e.target.value
                            const nextEfforts = effortsFor(next)
                            setDraft((prev) => ({
                              ...prev,
                              [task.key]: next,
                              ...(task.effortKey &&
                              prev[task.effortKey] &&
                              !nextEfforts.some((item) => item.id === prev[task.effortKey])
                                ? { [task.effortKey]: '' }
                                : {}),
                            }))
                          }}
                        >
                          {options.map((m) => (
                            <option key={routeKey(m.provider, m.model)} value={routeKey(m.provider, m.model)}>
                              {labelOf(m)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        思考
                        <select
                          disabled={!task.effortKey || efforts.length === 0}
                          value={task.effortKey ? effortValue : ''}
                          onChange={(e) => {
                            if (!task.effortKey) return
                            setDraft({ ...draft, [task.effortKey]: e.target.value })
                          }}
                        >
                          <option value="">关闭思考</option>
                          {task.effortKey
                            ? efforts.map((effort) => (
                                <option key={effort.id} value={effort.id}>
                                  {effort.name}
                                </option>
                              ))
                            : null}
                        </select>
                      </label>
                    </div>
                  </section>
                )
              })}
              <div className="ow-row-actions">
                <button type="button" className="ow-btn ghost" onClick={onClose}>
                  取消
                </button>
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
                  保存
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
