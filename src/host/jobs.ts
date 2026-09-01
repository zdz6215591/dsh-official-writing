import { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler,
  createUserMessage,
  type GenerateOptions,
  type ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import { isUnsupportedEffort, streamAttempts } from '../shared/effort.ts'
import { logOw } from './log.ts'
import { asRecord, asString, parseJsonObject } from '../shared/json.ts'
import { coerceAuditType, isNoOpIssue, locateInText, normalizeAuditType } from '../shared/locate.ts'
import { isLocalRoute } from '../shared/local.ts'
import {
  auditSystem,
  autocompleteSystem,
  cleanModelText,
  extractGhostFromReasoning,
  rewriteSystem,
} from '../shared/prompts.ts'
import { normalizeDocType } from '../shared/docTypes.ts'
import type { AuditIssue, CompleteRequest, JobSnapshot, RewriteMode } from '../shared/types.ts'
import { parseRouteKey } from '../shared/types.ts'

export const STREAM_TIMEOUT_MS = 90_000
export const AUDIT_TIMEOUT_MS = 90_000

export interface JobRecord extends JobSnapshot {
  abort: AbortController
  task: CompleteRequest['task']
  startedAt: number
}

export function finishError(
  finish: { kind: string; failure?: { message?: string; code?: string } } | undefined,
): Error | undefined {
  if (!finish) return undefined
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    const error = new Error(finish.failure?.message || (finish.kind === 'aborted' ? '已取消' : '模型调用失败'))
    if (finish.failure?.code) (error as Error & { code?: string }).code = finish.failure.code
    return error
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

function asEffort(value: string | undefined): ReasoningEffortId | undefined {
  return value ? (value as ReasoningEffortId) : undefined
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
  let info = provider ? providers.find((item) => item.id === provider) : undefined

  if (!info || !model) {
    for (const candidate of providers) {
      if (request.encrypted && !isLocalRoute(candidate.id, candidate.name)) continue
      try {
        const listed = await ctx.llm.listModels(candidate.id)
        const hit = model ? listed.find((item) => item.id === model) : listed[0]
        if (!hit) continue
        provider = candidate.id
        model = hit.id
        info = candidate
        break
      } catch {
        continue
      }
    }
  }

  if (!info || !provider || !model) {
    info = providers[0]!
    provider = info.id
    const listed = await ctx.llm.listModels(provider)
    if (!listed.length) throw new Error(`提供方 ${info.name} 未公布可用模型`)
    model = listed[0]!.id
  }

  let efforts: { id: string; name: string }[] = []
  try {
    const resolved = await ctx.llm.resolveModelInfo(provider, model)
    efforts = (resolved.reasoning?.efforts ?? []).map((item) => ({ id: item.id, name: item.name }))
  } catch {
    efforts = []
  }
  const local = isLocalRoute(provider, info.name)
  if (request.encrypted && !local) {
    throw new Error('加密模式禁止把正文送出本地。请先配置可用的本地模型，或改回普通模式。')
  }
  return { provider, model, local, efforts }
}

function userMessage(text: string) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-official-writing' },
  })
}

function deadline<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new Error('TIMEOUT'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('TIMEOUT'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

async function streamText(
  ctx: Context,
  options: GenerateOptions,
  onDelta: (text: string) => void,
): Promise<{ text: string; reasoning: string; kinds: string[]; usage?: unknown; ms: number }> {
  const assembler = new BlockAssembler()
  const kinds: string[] = []
  const started = Date.now()
  let textChars = 0
  let reasoningChars = 0
  let chunkCount = 0
  logOw('stream.begin', {
    provider: options.provider,
    model: options.model,
    effort: String(options.reasoningEffort || ''),
    purpose: options.purpose || '',
    maxTokens: options.maxTokens || 0,
  })
  for await (const chunk of ctx.llm.stream(options)) {
    if (options.signal?.aborted) throw new Error('TIMEOUT')
    assembler.push(chunk)
    chunkCount += 1
    kinds.push(chunk.type)
    if (chunk.type === 'text-delta' && chunk.text) {
      textChars += chunk.text.length
      onDelta(chunk.text)
      if (textChars === chunk.text.length) {
        logOw('stream.first-text', { ms: Date.now() - started, chars: chunk.text.length, preview: chunk.text.slice(0, 80) })
      }
    }
    if (chunk.type === 'reasoning-delta' && 'text' in chunk && chunk.text) {
      reasoningChars += String(chunk.text).length
      if (reasoningChars === String(chunk.text).length) {
        logOw('stream.first-reasoning', { ms: Date.now() - started, chars: String(chunk.text).length })
      }
    }
  }
  const error = finishError(assembler.finish)
  if (error) throw error
  const blocks = assembler.blocks()
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  const reasoning = blocks
    .filter((block) => block.type === 'reasoning')
    .map((block) => ('text' in block ? String(block.text) : ''))
    .join('')
  const ms = Date.now() - started
  logOw('stream.end', {
    ms,
    chunks: chunkCount,
    textChars: text.length,
    reasoningChars: reasoning.length,
    kinds: [...new Set(kinds)].join(','),
    finish: assembler.finish?.kind || '',
    usage: assembler.usage || null,
  })
  return { text, reasoning, kinds: [...new Set(kinds)], usage: assembler.usage, ms }
}

async function streamMaybeOffThinking(
  ctx: Context,
  options: GenerateOptions,
  onDelta: (text: string) => void,
  efforts: { id: string; name: string }[],
  requested?: string,
  allowReasoningFallback = false,
): Promise<string> {
  const attempts = streamAttempts({ requested, efforts, preferOff: !requested })
  const planned = attempts.slice(0, 1)
  const call = async (next: GenerateOptions) => deadline(streamText(ctx, next, onDelta), next.signal)
  let lastError: unknown
  let lastReasoning = ''
  for (const attempt of planned) {
    const next: GenerateOptions = { ...options }
    if (attempt.reasoningEffort) next.reasoningEffort = asEffort(attempt.reasoningEffort)
    else delete next.reasoningEffort
    if (attempt.purpose) next.purpose = attempt.purpose
    else delete next.purpose
    try {
      const result = await call(next)
      if (result.reasoning.trim()) lastReasoning = result.reasoning
      logOw('stream.ok', {
        provider: options.provider,
        model: options.model,
        effort: attempt.reasoningEffort || '',
        purpose: attempt.purpose || '',
        chars: result.text.length,
        reasoningChars: result.reasoning.length,
        kinds: result.kinds.join(','),
      })
      if (result.text.trim()) return result.text
      lastError = new Error('EMPTY_RESPONSE')
    } catch (error) {
      lastError = error
      logOw('stream.fail', {
        provider: options.provider,
        model: options.model,
        effort: attempt.reasoningEffort || '',
        purpose: attempt.purpose || '',
        message: error instanceof Error ? error.message : String(error),
        code: error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code || '') : '',
      })
      const retryable =
        isUnsupportedEffort(error) ||
        (error instanceof Error && /UNSUPPORTED|does not support|EMPTY_RESPONSE/i.test(error.message))
      if (!retryable) throw error
    }
  }
  if (allowReasoningFallback && lastReasoning.trim()) {
    logOw('stream.reasoning-fallback', { provider: options.provider, model: options.model, chars: lastReasoning.length })
    return lastReasoning
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || '模型调用失败'))
}

function buildAuditIssues(raw: string, source: string): AuditIssue[] {
  let parsed: unknown
  try {
    parsed = parseJsonObject(raw)
  } catch {
    return []
  }
  const record = asRecord(parsed)
  const list = record?.suggestions
  if (!Array.isArray(list)) return []
  const issues: AuditIssue[] = []
  let i = 0
  for (const item of list) {
    const row = asRecord(item)
    if (!row) continue
    const rawType = normalizeAuditType(row.type)
    if (!rawType) continue
    const original = rawType === 'insert' ? '' : asString(row.original)
    const suggestion = asString(row.suggestion)
    const context = asString(row.context)
    const explanation = asString(row.explanation) || asString(row.reason)
    const type = coerceAuditType(rawType, explanation)
    if (type !== 'insert' && !original && !context) continue
    if (type === 'insert' && !context) continue
    if (type !== 'insert' && original && !source.includes(original)) {
      logOw('audit.drop', { original: original.slice(0, 40), reason: 'original-missing' })
      continue
    }
    if (context && !source.includes(context) && !(original && source.includes(original))) {
      logOw('audit.drop', { context: context.slice(0, 40), reason: 'context-missing' })
      continue
    }
    const draft: AuditIssue = {
      id: `audit-${Date.now().toString(36)}-${i++}`,
      type,
      original,
      suggestion,
      reason: explanation,
      context,
      start: -1,
      end: -1,
    }
    if (isNoOpIssue(draft)) {
      logOw('audit.drop', { original: original.slice(0, 40), reason: 'no-op' })
      continue
    }
    const located = locateInText(source, draft)
    if (!located) {
      logOw('audit.drop', { original: original.slice(0, 40), reason: 'not-located' })
      continue
    }
    logOw('audit.keep', { type, original: original.slice(0, 40), start: located.start })
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
    if (request.task === 'autocomplete') {
      const before = (request.textBefore || request.text || '').slice(-4000)
      const after = (request.textAfter || '').slice(0, 2000)
      const system = autocompleteSystem({
        docType: request.docType,
        title: request.title,
        intent: request.intent,
      })
      const raw = await streamMaybeOffThinking(
        ctx,
        {
          provider: route.provider,
          model: route.model,
          system,
          messages: [
            userMessage(
              [
                '只输出续写正文本身，不要思考过程，不要重复已有文字。',
                `光标前：\n${before}`,
                after ? `光标后：\n${after}` : '光标后：（无）',
              ].join('\n\n'),
            ),
          ],
          temperature: 0.2,
          maxTokens: 2048,
          signal: clock.signal,
        },
        (delta) => {
          job.text += delta
        },
        route.efforts,
        undefined,
        true,
      )
      const cleaned = cleanModelText(raw || job.text)
      const fromReasoning = cleaned || extractGhostFromReasoning(raw || job.text)
      job.text = (fromReasoning || (raw || job.text).replace(/\s+/g, ' ').trim()).slice(0, 120)
      logOw('autocomplete.out', { chars: job.text.length, preview: job.text })
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
      const raw = await streamMaybeOffThinking(
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
          signal: clock.signal,
        },
        (delta) => {
          job.text += delta
        },
        route.efforts,
        request.effort,
      )
      job.text = cleanModelText(raw || job.text)
      return
    }

    const system = auditSystem({ docType: request.docType })
    logOw('audit.source', { chars: request.text.replace(/\s/g, '').length, preview: request.text.replace(/\s+/g, ' ').slice(0, 160) })
    const raw = await streamMaybeOffThinking(
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
        signal: clock.signal,
      },
      () => {
        /* 校核等完成后一次性解析，避免半截 JSON 误导前端 */
      },
      route.efforts,
      request.depth === 'deep' ? request.effort : undefined,
      true,
    )
    const issues = buildAuditIssues(raw, request.text)
    logOw('audit.done', { kept: issues.length, originals: issues.map((item) => item.original.slice(0, 24)) })
    job.text = JSON.stringify({ suggestions: issues })
  } finally {
    clock.dispose()
  }
}
