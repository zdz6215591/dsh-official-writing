import { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler,
  createUserMessage,
  type GenerateOptions,
  type ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import { asRecord, asString, parseJsonObject } from '../shared/json.ts'
import { locateInText, normalizeAuditType } from '../shared/locate.ts'
import { isLocalRoute } from '../shared/local.ts'
import {
  auditSystem,
  autocompleteSystem,
  cleanModelText,
  rewriteSystem,
} from '../shared/prompts.ts'
import { normalizeDocType } from '../shared/docTypes.ts'
import type { AuditIssue, CompleteRequest, JobSnapshot, RewriteMode } from '../shared/types.ts'
import { parseRouteKey } from '../shared/types.ts'

export const STREAM_TIMEOUT_MS = 18_000
export const AUDIT_TIMEOUT_MS = 35_000

export interface JobRecord extends JobSnapshot {
  abort: AbortController
  task: CompleteRequest['task']
}

export function finishError(finish: { kind: string; failure?: { message?: string } } | undefined): Error | undefined {
  if (!finish) return undefined
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    return new Error(finish.failure?.message || (finish.kind === 'aborted' ? '已取消' : '模型调用失败'))
  }
  return undefined
}

function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; dispose: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('TIMEOUT')), ms)
  const onAbort = () => ctrl.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) ctrl.abort(signal.reason)
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function pickEffort(
  requested: string | undefined,
  efforts: { id: string; name?: string }[],
): ReasoningEffortId | undefined {
  if (!efforts.length) return undefined
  if (requested && efforts.some((item) => item.id === requested)) {
    return requested as ReasoningEffortId
  }
  const lowest = efforts.find((item) =>
    /low|min|none|off|disable|chat|fast|minimal/i.test(`${item.id} ${item.name || ''}`),
  )
  return (lowest?.id || efforts[0]!.id) as ReasoningEffortId
}

export async function resolveRoute(
  ctx: Context,
  request: CompleteRequest,
): Promise<{ provider: string; model: string; local: boolean; efforts: { id: string; name: string }[] }> {
  const providers = ctx.llm.listProviders()
  if (!providers.length) throw new Error('当前没有可用的 dsh 模型，请先在设置中配置')

  const parsed = parseRouteKey(request.route)
  let provider = parsed?.provider
  let model = parsed?.model

  if (!provider || !model) {
    provider = providers[0]!.id
    const models = await ctx.llm.listModels(provider)
    if (!models.length) throw new Error(`提供方 ${providers[0]!.name} 未公布可用模型`)
    model = models[0]!.id
  }

  const info = providers.find((item) => item.id === provider)
  if (!info) throw new Error(`找不到提供方 ${provider}`)
  const resolved = await ctx.llm.resolveModelInfo(provider, model)
  const local = isLocalRoute(provider, info.name)
  if (request.encrypted && !local) {
    throw new Error('加密模式禁止把正文送出本地。请先配置可用的本地模型，或改回普通模式。')
  }
  return {
    provider,
    model,
    local,
    efforts: (resolved.reasoning?.efforts ?? []).map((item) => ({ id: item.id, name: item.name })),
  }
}

function userMessage(text: string) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-official-writing' },
  })
}

async function streamText(
  ctx: Context,
  options: GenerateOptions,
  onDelta: (text: string) => void,
): Promise<string> {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta' && chunk.text) onDelta(chunk.text)
  }
  const error = finishError(assembler.finish)
  if (error) throw error
  const text = assembler
    .blocks()
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  return text
}

function buildAuditIssues(raw: string, source: string): AuditIssue[] {
  const parsed = parseJsonObject(raw)
  const record = asRecord(parsed)
  const list = record?.suggestions
  if (!Array.isArray(list)) throw new Error('校核结果缺少 suggestions')
  const issues: AuditIssue[] = []
  let i = 0
  for (const item of list) {
    const row = asRecord(item)
    if (!row) continue
    const type = normalizeAuditType(row.type)
    if (!type) continue
    const original = type === 'insert' ? '' : asString(row.original)
    const suggestion = asString(row.suggestion)
    const context = asString(row.context)
    const explanation = asString(row.explanation) || asString(row.reason)
    if (type !== 'insert' && !original && !context) continue
    if (type === 'insert' && !context) continue
    const draft: AuditIssue = {
      id: `audit-${Date.now().toString(36)}-${i++}`,
      type,
      original,
      suggestion,
      reason: explanation,
      context,
      start: typeof row.start === 'number' ? row.start : 0,
      end: typeof row.end === 'number' ? row.end : 0,
    }
    const located = locateInText(source, draft)
    if (!located) continue
    issues.push({ ...draft, start: located.start, end: located.end })
  }
  issues.sort((a, b) => a.start - b.start || a.end - b.end)
  return issues
}

export async function runJob(
  ctx: Context,
  request: CompleteRequest,
  job: JobRecord,
): Promise<void> {
  const route = await resolveRoute(ctx, request)
  const timeoutMs = request.task === 'audit' ? AUDIT_TIMEOUT_MS : STREAM_TIMEOUT_MS
  const clock = withTimeout(job.abort.signal, timeoutMs)
  try {
    const effort =
      request.task === 'autocomplete'
        ? pickEffort(undefined, route.efforts)
        : request.task === 'audit' && request.depth !== 'deep'
          ? pickEffort(undefined, route.efforts)
          : pickEffort(request.effort, route.efforts)

    if (request.task === 'autocomplete') {
      const before = request.textBefore || request.text || ''
      const system = autocompleteSystem({
        docType: request.docType,
        title: request.title,
        intent: request.intent,
      })
      const raw = await streamText(
        ctx,
        {
          provider: route.provider,
          model: route.model,
          system,
          messages: [userMessage(`光标前上下文：\n${before.slice(-1200)}`)],
          temperature: 0.3,
          maxTokens: 160,
          ...(effort ? { reasoningEffort: effort } : {}),
          signal: clock.signal,
        },
        (delta) => {
          job.text += delta
        },
      )
      const cleaned = cleanModelText(raw || job.text)
      job.text = (cleaned || (raw || job.text).replace(/\s+/g, ' ').trim()).slice(0, 80)
      return
    }

    if (request.task === 'rewrite') {
      const modes = (request.modes || []) as RewriteMode[]
      const system = rewriteSystem({
        docType: request.docType,
        modes,
        custom: request.custom,
        reference: request.reference,
      })
      const raw = await streamText(
        ctx,
        {
          provider: route.provider,
          model: route.model,
          system,
          messages: [
            userMessage(
              [
                request.contextBefore ? `上文：\n${request.contextBefore}` : '',
                `待改写文本：\n${request.text}`,
                request.contextAfter ? `下文：\n${request.contextAfter}` : '',
              ]
                .filter(Boolean)
                .join('\n\n'),
            ),
          ],
          temperature: 0.5,
          maxTokens: 1200,
          ...(effort ? { reasoningEffort: effort } : {}),
          signal: clock.signal,
        },
        (delta) => {
          job.text += delta
        },
      )
      job.text = cleanModelText(raw || job.text)
      return
    }

    const system = auditSystem({ docType: request.docType })
    const raw = await streamText(
      ctx,
      {
        provider: route.provider,
        model: route.model,
        system,
        messages: [
          userMessage(
            `文体：${normalizeDocType(request.docType)}\n标题：${request.title || ''}\n\n正文：\n${request.text}`,
          ),
        ],
        temperature: 0.1,
        maxTokens: 1800,
        ...(effort ? { reasoningEffort: effort } : {}),
        signal: clock.signal,
      },
      () => {
        /* 校核等完成后一次性解析，避免半截 JSON 误导前端 */
      },
    )
    const issues = buildAuditIssues(raw, request.text)
    job.text = JSON.stringify({ suggestions: issues })
  } finally {
    clock.dispose()
  }
}
