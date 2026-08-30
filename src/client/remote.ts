import type { Context } from '@deepseek-ai/cordis'
import type { CatalogSnapshot, CompleteRequest, JobSnapshot } from '../shared/types.ts'
import TYPERT_REMOTE from '../typert.remote-client.ts'

export type RemoteNs = {
  catalog: () => Promise<{ ok: true; value: CatalogSnapshot } | { ok: false; error: { message: string } }>
  startJob: (
    request: CompleteRequest,
  ) => Promise<{ ok: true; value: JobSnapshot } | { ok: false; error: { message: string } }>
  pollJob: (jobId: string) => Promise<{ ok: true; value: JobSnapshot } | { ok: false; error: { message: string } }>
  cancelJob: (jobId: string) => Promise<{ ok: true; value: JobSnapshot } | { ok: false; error: { message: string } }>
}

let cached: RemoteNs | null = null
const waiters: Array<(api: RemoteNs) => void> = []

function remember(api: RemoteNs) {
  cached = api
  for (const waiter of waiters) waiter(api)
  waiters.length = 0
}

export async function mountWritingRemote(ctx: Context): Promise<() => void> {
  const remote = ctx.get('remote') as { $mount?: (c: unknown) => Promise<() => Promise<void>> } | undefined
  if (!remote?.$mount) return () => undefined
  const disposeMount = await remote.$mount(TYPERT_REMOTE)
  const disposeFiber = ctx.inject(['remote.officialWriting'], (sub: Context) => {
    const api = sub.get('remote.officialWriting') as RemoteNs | undefined
    if (!api) return
    remember({
      catalog: api.catalog,
      startJob: api.startJob,
      pollJob: api.pollJob,
      cancelJob: api.cancelJob,
    })
  }) as unknown as (() => void) | undefined
  return () => {
    cached = null
    disposeFiber?.()
    void disposeMount()
  }
}

export function writingApi(): RemoteNs | null {
  return cached
}

export async function waitWritingApi(timeoutMs = 8000): Promise<RemoteNs> {
  if (cached) return cached
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('公文写作通道尚未就绪')), timeoutMs)
    waiters.push((api) => {
      clearTimeout(timer)
      resolve(api)
    })
  })
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) {
    const message = result.error.message || '远程调用失败'
    console.error('[dsh-official-writing] remote', message)
    throw new Error(message)
  }
  return result.value
}

export async function fetchCatalog(ctx: Context): Promise<CatalogSnapshot> {
  void ctx
  const api = cached ?? (await waitWritingApi())
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
  void ctx
  const api = cached ?? (await waitWritingApi())
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
      await sleep(request.task === 'autocomplete' ? 16 : 32, signal)
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
