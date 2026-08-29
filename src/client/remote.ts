import type { Context } from '@deepseek-ai/cordis'
import type { CatalogSnapshot, CompleteRequest, JobSnapshot } from '../shared/types.ts'
import TYPERT_REMOTE from '../typert.remote-client.ts'

type RemoteNs = {
  catalog: () => Promise<{ ok: true; value: CatalogSnapshot } | { ok: false; error: { message: string } }>
  startJob: (request: CompleteRequest) => Promise<{ ok: true; value: JobSnapshot } | { ok: false; error: { message: string } }>
  pollJob: (jobId: string) => Promise<{ ok: true; value: JobSnapshot } | { ok: false; error: { message: string } }>
  cancelJob: (jobId: string) => Promise<{ ok: true; value: JobSnapshot } | { ok: false; error: { message: string } }>
}

export async function mountWritingRemote(ctx: Context): Promise<() => void> {
  const remote = ctx.get('remote') as { $mount?: (c: unknown) => Promise<() => Promise<void>> } | undefined
  if (!remote?.$mount) return () => undefined
  const dispose = await remote.$mount(TYPERT_REMOTE)
  return () => {
    void dispose()
  }
}

export function writingApi(ctx: Context): RemoteNs | null {
  const remote = ctx.get('remote') as { officialWriting?: RemoteNs } | undefined
  return remote?.officialWriting ?? null
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message || '远程调用失败')
  return result.value
}

export async function fetchCatalog(ctx: Context): Promise<CatalogSnapshot> {
  const api = writingApi(ctx)
  if (!api) throw new Error('公文写作通道尚未就绪')
  return unwrap(await api.catalog())
}

export async function runStreamingJob(
  ctx: Context,
  request: CompleteRequest,
  handlers: {
    onDelta?: (text: string) => void
    onDone?: (text: string) => void
  },
  signal?: AbortSignal,
): Promise<string> {
  const api = writingApi(ctx)
  if (!api) throw new Error('公文写作通道尚未就绪')
  const started = unwrap(await api.startJob(request))
  let last = started.text || ''
  if (last) handlers.onDelta?.(last)
  if (signal?.aborted) {
    await api.cancelJob(started.jobId)
    throw new DOMException('Aborted', 'AbortError')
  }
  const onAbort = () => {
    void api.cancelJob(started.jobId)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    let snap = started
    while (!snap.done) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await sleep(48, signal)
      snap = unwrap(await api.pollJob(started.jobId))
      if (snap.text.length > last.length) {
        handlers.onDelta?.(snap.text.slice(last.length))
        last = snap.text
      } else if (snap.text !== last) {
        last = snap.text
        handlers.onDelta?.('')
      }
    }
    if (snap.error) throw new Error(snap.error)
    handlers.onDone?.(snap.text)
    return snap.text
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}
