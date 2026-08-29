import type { DocTypeId } from './docTypes.ts'

export type AuditType = 'typo' | 'polish' | 'insert'

export type SecretLevel = 'public' | 'confidential' | 'secret' | 'encrypted'

export type TaskKind = 'autocomplete' | 'audit' | 'rewrite'

export type RewriteMode =
  | 'expand'
  | 'shorten'
  | 'abstract'
  | 'concrete'
  | 'professional'
  | 'plain'
  | 'reference'
  | 'custom'

export interface AuditIssue {
  id: string
  type: AuditType
  original: string
  suggestion: string
  reason: string
  /** 原文中原封不动存在的连续片段，用于实时定位。 */
  context: string
  /** 仅作参考的估算偏移，定位以 context / original 实时查找为准。 */
  start: number
  end: number
}

export interface DocumentContext {
  secretLevel: SecretLevel
  docType: DocTypeId
  title: string
  intent: string
  topic: string
  forceLocal: boolean
}

export interface ModelOption {
  provider: string
  model: string
  providerName: string
  modelName: string
  local: boolean
  efforts: { id: string; name: string }[]
}

export interface TaskRouting {
  autocomplete: string
  audit: string
  rewrite: string
  auditEffort: string
  rewriteEffort: string
}

export interface CatalogSnapshot {
  models: ModelOption[]
  failures: { provider: string; name: string; message: string }[]
}

export interface CompleteRequest {
  task: TaskKind
  text: string
  textBefore?: string
  textAfter?: string
  contextBefore?: string
  contextAfter?: string
  depth?: 'quick' | 'deep'
  modes?: RewriteMode[]
  custom?: string
  reference?: string
  docType?: string
  title?: string
  intent?: string
  encrypted?: boolean
  route?: string
  effort?: string
}

export interface JobSnapshot {
  jobId: string
  text: string
  done: boolean
  error?: string
}

export function isEncrypted(ctx: Pick<DocumentContext, 'secretLevel' | 'forceLocal'> | null | undefined): boolean {
  if (!ctx) return false
  return Boolean(
    ctx.forceLocal ||
      ctx.secretLevel === 'confidential' ||
      ctx.secretLevel === 'secret' ||
      ctx.secretLevel === 'encrypted',
  )
}

export function routeKey(provider: string, model: string): string {
  return `${provider}::${model}`
}

export function parseRouteKey(value: string | undefined | null): { provider: string; model: string } | null {
  if (!value) return null
  const idx = value.indexOf('::')
  if (idx <= 0) return null
  const provider = value.slice(0, idx)
  const model = value.slice(idx + 2)
  if (!provider || !model) return null
  return { provider, model }
}

export const EXCLUSIVE_REWRITE_GROUPS: RewriteMode[][] = [
  ['expand', 'shorten'],
  ['abstract', 'concrete'],
  ['professional', 'plain'],
]
