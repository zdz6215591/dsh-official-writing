import { z } from 'zod'

const modelOption = z.object({
  provider: z.string(),
  model: z.string(),
  providerName: z.string(),
  modelName: z.string(),
  local: z.boolean(),
  efforts: z.array(z.object({ id: z.string(), name: z.string() })),
})

const catalogResult = z.object({
  models: z.array(modelOption),
  failures: z.array(
    z.object({
      provider: z.string(),
      name: z.string(),
      message: z.string(),
    }),
  ),
})

const completeRequest = z.object({
  task: z.union([z.literal('autocomplete'), z.literal('audit'), z.literal('rewrite')]),
  text: z.string(),
  textBefore: z.string().optional(),
  textAfter: z.string().optional(),
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional(),
  depth: z.union([z.literal('quick'), z.literal('deep')]).optional(),
  modes: z.array(z.string()).optional(),
  custom: z.string().optional(),
  reference: z.string().optional(),
  docType: z.string().optional(),
  title: z.string().optional(),
  intent: z.string().optional(),
  encrypted: z.boolean().optional(),
  route: z.string().optional(),
  effort: z.string().optional(),
})

const jobSnapshot = z.object({
  jobId: z.string(),
  text: z.string(),
  done: z.boolean(),
  error: z.string().optional(),
})

const jobId = z.string()

export const TYPERT = {
  package: 'dsh-official-writing',
  face: 'host' as const,
  schemas: [],
  invocations: [
    {
      id: 'dsh-official-writing#officialWriting/catalog',
      service: 'officialWriting',
      namespace: 'officialWriting',
      method: 'catalog',
      invocation: { kind: 'direct' as const },
      parameters: [],
      result: {
        mode: 'strict' as const,
        typeSymbol: 'dsh-official-writing#CatalogSnapshot',
        schema: catalogResult,
      },
      sourceLocation: { file: 'src/index.ts', line: 21, column: 3 },
    },
    {
      id: 'dsh-official-writing#officialWriting/startJob',
      service: 'officialWriting',
      namespace: 'officialWriting',
      method: 'startJob',
      invocation: { kind: 'direct' as const },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json' as const,
          codec: {
            mode: 'strict' as const,
            typeSymbol: 'dsh-official-writing#CompleteRequest',
            schema: completeRequest,
          },
        },
      ],
      result: {
        mode: 'strict' as const,
        typeSymbol: 'dsh-official-writing#JobSnapshot',
        schema: jobSnapshot,
      },
      sourceLocation: { file: 'src/index.ts', line: 76, column: 3 },
    },
    {
      id: 'dsh-official-writing#officialWriting/pollJob',
      service: 'officialWriting',
      namespace: 'officialWriting',
      method: 'pollJob',
      invocation: { kind: 'direct' as const },
      parameters: [
        {
          name: 'jobId',
          wire: 'jobId',
          source: 'json' as const,
          codec: {
            mode: 'strict' as const,
            typeSymbol: 'dsh-official-writing#JobId',
            schema: jobId,
          },
        },
      ],
      result: {
        mode: 'strict' as const,
        typeSymbol: 'dsh-official-writing#JobSnapshot',
        schema: jobSnapshot,
      },
      sourceLocation: { file: 'src/index.ts', line: 92, column: 3 },
    },
    {
      id: 'dsh-official-writing#officialWriting/cancelJob',
      service: 'officialWriting',
      namespace: 'officialWriting',
      method: 'cancelJob',
      invocation: { kind: 'direct' as const },
      parameters: [
        {
          name: 'jobId',
          wire: 'jobId',
          source: 'json' as const,
          codec: {
            mode: 'strict' as const,
            typeSymbol: 'dsh-official-writing#JobId',
            schema: jobId,
          },
        },
      ],
      result: {
        mode: 'strict' as const,
        typeSymbol: 'dsh-official-writing#JobSnapshot',
        schema: jobSnapshot,
      },
      sourceLocation: { file: 'src/index.ts', line: 102, column: 3 },
    },
  ],
  model: { services: [], events: [], objects: [] },
}

export default TYPERT
