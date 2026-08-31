import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDocType } from '../shared/docTypes.ts'
import { parseJsonObject } from '../shared/json.ts'
import { applyIssueToText, locateInText, relocateIssues } from '../shared/locate.ts'
import { isUnsupportedEffort, pickOffEffort, resolveEffort, streamAttempts } from '../shared/effort.ts'
import { autocompleteSystem, cleanModelText, extractGhostFromReasoning, styleGuide } from '../shared/prompts.ts'
import { isLocalRoute } from '../shared/local.ts'

test('normalizeDocType never falls through', () => {
  assert.equal(normalizeDocType('notice_letter'), 'notice_letter')
  assert.equal(normalizeDocType('notice'), 'notice_letter')
  assert.equal(normalizeDocType('report'), 'research')
  assert.equal(normalizeDocType('totally-unknown'), 'general')
  assert.equal(normalizeDocType(undefined), 'general')
})

test('styleGuide always returns a non-empty brief', () => {
  assert.ok(styleGuide('notice_letter').length > 10)
  assert.ok(styleGuide('nope').includes('通用机关公文'))
})

test('locate uses context, not stale offsets', () => {
  const text = '现将有关情况报告如下。\n请认真贯彻执行。\n特此通知。'
  const range = locateInText(text, {
    type: 'typo',
    original: '贯彻执行',
    context: '请认真贯彻执行。',
    start: 999,
    end: 1000,
  })
  assert.ok(range)
  assert.equal(text.slice(range.start, range.end), '贯彻执行')
})

test('locate never expands to the whole context span', () => {
  const text = '请认真贯彻执行并抓好落实。'
  const range = locateInText(text, {
    type: 'polish',
    original: '贯彻执行',
    context: '请认真贯彻执行并抓好落实。',
    start: 0,
  })
  assert.ok(range)
  assert.equal(text.slice(range.start, range.end), '贯彻执行')
  assert.notEqual(text.slice(range.start, range.end), '请认真贯彻执行并抓好落实。')
})

test('locate ignores bogus model offsets and uses the first original', () => {
  const text = '请认真贯彻执行。随后请认真贯彻执行。'
  const range = locateInText(text, {
    type: 'typo',
    original: '贯彻执行',
    context: '请认真贯彻执行。',
    start: 999,
  })
  assert.ok(range)
  assert.equal(range.start, text.indexOf('贯彻执行'))
})

test('locate prefers the occurrence nearest a real previous offset', () => {
  const text = '请认真贯彻执行。随后请认真贯彻执行。'
  const second = text.lastIndexOf('贯彻执行')
  const range = locateInText(text, {
    type: 'typo',
    original: '贯彻执行',
    start: second,
  })
  assert.ok(range)
  assert.equal(range.start, second)
})

test('insert locates by preceding context', () => {
  const text = '会议指出工作进展顺利。下一步将细化分工。'
  const range = locateInText(text, {
    type: 'insert',
    original: '',
    context: '工作进展顺利。',
  })
  assert.ok(range)
  const applied = applyIssueToText(text, {
    type: 'insert',
    original: '',
    context: '工作进展顺利。',
    suggestion: '各责任单位要倒排工期。',
  })
  assert.ok(applied)
  assert.match(applied.text, /顺利。各责任单位/)
})

test('relocateIssues drops vanished originals', () => {
  const kept = relocateIssues('请认真贯彻执行。', [
    {
      id: '1',
      type: 'typo',
      original: '贯彻执行',
      suggestion: '抓好落实',
      reason: '更庄重',
      context: '请认真贯彻执行。',
      start: 0,
      end: 0,
    },
    {
      id: '2',
      type: 'polish',
      original: '不存在的句子',
      suggestion: 'x',
      reason: 'x',
      context: '不存在的句子',
      start: 0,
      end: 0,
    },
  ])
  assert.equal(kept.length, 1)
  assert.equal(kept[0]!.id, '1')
})

test('parseJsonObject degrades through fences and braces', () => {
  const fenced = parseJsonObject('说明如下\n```json\n{"suggestions":[]}\n```')
  assert.deepEqual(fenced, { suggestions: [] })
  const noisy = parseJsonObject('好的。{"suggestions":[{"type":"typo"}]} 完毕')
  assert.equal((noisy as { suggestions: unknown[] }).suggestions.length, 1)
  assert.throws(() => parseJsonObject('不是 json'))
})

test('cleanModelText strips wrappers', () => {
  assert.equal(cleanModelText('```\n请认真贯彻执行。\n```'), '请认真贯彻执行。')
  assert.equal(cleanModelText('「请予复函」'), '请予复函')
})

test('extractGhostFromReasoning keeps a quoted continuation', () => {
  assert.equal(
    extractGhostFromReasoning('可以续写为「现就有关事项通知如下。」然后结束。'),
    '现就有关事项通知如下。',
  )
})

test('autocomplete prompt forbids extras', () => {
  const prompt = autocompleteSystem({ docType: 'notice', title: '通知' })
  assert.match(prompt, /立刻输出续写/)
  assert.match(prompt, /通知/)
})

test('local route detection', () => {
  assert.equal(isLocalRoute('ollama', 'Ollama'), true)
  assert.equal(isLocalRoute('deepseek-official', 'DeepSeek'), false)
  assert.equal(isLocalRoute('openai', 'vLLM OpenAI-compatible'), true)
})

test('pickOffEffort prefers true off over low', () => {
  assert.equal(
    pickOffEffort([
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
      { id: 'off', name: 'Off' },
    ]),
    'off',
  )
  assert.equal(pickOffEffort([{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }]), undefined)
  assert.equal(
    resolveEffort({ requested: 'high', efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }] }),
    'high',
  )
  assert.equal(resolveEffort({ preferOff: true, efforts: [{ id: 'low', name: 'Low' }] }), undefined)
  assert.equal(resolveEffort({ preferOff: true, efforts: [] }), undefined)
  assert.equal(
    isUnsupportedEffort({
      code: 'UNSUPPORTED_REASONING_EFFORT',
      message: 'provider x model y does not support reasoning effort "off"',
    }),
    true,
  )
  const deepseek = streamAttempts({
    preferOff: true,
    efforts: [
      { id: 'off', name: 'Off' },
      { id: 'high', name: 'High' },
    ],
  })
  assert.equal(deepseek[0]?.reasoningEffort, undefined)
  assert.equal(deepseek[1]?.reasoningEffort, 'off')
  const noReasoning = streamAttempts({ preferOff: true, efforts: [] })
  assert.deepEqual(noReasoning[0], {})
  assert.ok(noReasoning.some((item) => item.purpose === 'session-title'))
})
