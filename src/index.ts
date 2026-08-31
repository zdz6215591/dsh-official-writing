import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { runJob, type JobRecord } from './host/jobs.ts'
import { logOw } from './host/log.ts'
import { isLocalRoute } from './shared/local.ts'
import type { CatalogSnapshot, CompleteRequest, JobSnapshot, ModelOption } from './shared/types.ts'

class OfficialWritingGateway extends TypertRemoteService {
  static inject = ['llm']
  private readonly jobs = new Map<string, JobRecord>()
  private seq = 0

  constructor(ctx: Context) {
    super(ctx, 'officialWriting')
    ctx.effect(() => {
      const timer = setInterval(() => {
        const now = Date.now()
        for (const [id, job] of this.jobs) {
          if (job.done && now - job.startedAt > 120_000) this.jobs.delete(id)
        }
      }, 15_000)
      return () => {
        clearInterval(timer)
        for (const job of this.jobs.values()) job.abort.abort()
        this.jobs.clear()
      }
    })
  }

  async catalog(): Promise<CatalogSnapshot> {
    const models: ModelOption[] = []
    const failures: CatalogSnapshot['failures'] = []
    for (const provider of this.ctx.llm.listProviders()) {
      try {
        const listed = await this.ctx.llm.listModels(provider.id)
        for (const model of listed) {
          try {
            const info = await this.ctx.llm.resolveModelInfo(provider.id, model.id)
            models.push({
              provider: provider.id,
              model: model.id,
              providerName: provider.name,
              modelName: info.name || model.name || model.id,
              local: isLocalRoute(provider.id, provider.name),
              efforts: (info.reasoning?.efforts ?? []).map((item) => ({
                id: item.id,
                name: item.name,
              })),
            })
          } catch (error) {
            models.push({
              provider: provider.id,
              model: model.id,
              providerName: provider.name,
              modelName: model.name || model.id,
              local: isLocalRoute(provider.id, provider.name),
              efforts: [],
            })
            failures.push({
              provider: provider.id,
              name: `${provider.name} / ${model.id}`,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }
        if (!listed.length) {
          failures.push({
            provider: provider.id,
            name: provider.name,
            message: '未公布可用模型',
          })
        }
      } catch (error) {
        failures.push({
          provider: provider.id,
          name: provider.name,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { models, failures }
  }

  startJob(request: CompleteRequest): JobSnapshot {
    const jobId = `ow-${Date.now().toString(36)}-${++this.seq}`
    const abort = new AbortController()
    const job: JobRecord = {
      jobId,
      text: '',
      done: false,
      abort,
      task: request.task,
      startedAt: Date.now(),
    }
    this.jobs.set(jobId, job)
    logOw('job.start', { jobId, task: request.task, route: request.route || '' })
    void this.execute(job, request)
    return snapshot(job)
  }

  pollJob(jobId: string): JobSnapshot {
    const job = this.jobs.get(jobId)
    if (!job) {
      return { jobId, text: '', done: true, error: '任务不存在或已结束' }
    }
    return snapshot(job)
  }

  cancelJob(jobId: string): JobSnapshot {
    const job = this.jobs.get(jobId)
    if (!job) return { jobId, text: '', done: true }
    job.abort.abort()
    job.done = true
    job.error = job.error || '已取消'
    this.jobs.delete(jobId)
    return snapshot(job)
  }

  private async execute(job: JobRecord, request: CompleteRequest): Promise<void> {
    try {
      await runJob(this.ctx, request, job)
    } catch (error) {
      if (job.abort.signal.aborted) {
        job.error = '已取消'
      } else if (error instanceof Error && /TIMEOUT|abort/i.test(error.message)) {
        job.error = request.task === 'audit' ? '校核超时' : '联想超时'
      } else {
        const message = error instanceof Error ? error.message : String(error)
        job.error = /EMPTY_RESPONSE/i.test(message)
          ? '模型没有返回正文。请换一个在 dsh 对话里能正常出字的模型后再试。'
          : /UNSUPPORTED_REASONING_EFFORT|does not support reasoning effort/i.test(message)
            ? '该模型不支持当前思考档，已按无思考重试仍失败。请换一个 dsh 里能正常对话的模型。'
            : message
      }
    } finally {
      job.done = true
      logOw('job.done', { jobId: job.jobId, task: request.task, chars: job.text.length, error: job.error || '' })
    }
  }
}

function snapshot(job: JobRecord): JobSnapshot {
  return {
    jobId: job.jobId,
    text: job.text,
    done: job.done,
    ...(job.error ? { error: job.error } : {}),
  }
}

export const name = 'official-writing'
export const inject = ['llm']
export function apply(ctx: Context) {
  new OfficialWritingGateway(ctx)
}

export { OfficialWritingGateway }
