import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const file = join(homedir(), '.dsh', 'official-writing.log')

export function logOw(event: string, data: Record<string, unknown> = {}): void {
  const line = `${new Date().toISOString()} ${event} ${JSON.stringify(data)}\n`
  console.error(`[dsh-official-writing] ${event}`, data)
  void mkdir(join(homedir(), '.dsh'), { recursive: true })
    .then(() => appendFile(file, line, 'utf8'))
    .catch(() => undefined)
}
