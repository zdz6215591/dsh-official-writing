import assert from 'node:assert/strict'
import test from 'node:test'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { splitBlock } from '@tiptap/pm/commands'
import { mapPinnedIssue, markSliceValid, pinIssuesToDoc } from '../client/extensions/docText.ts'
import type { AuditIssue } from '../shared/types.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    heading: {
      content: 'inline*',
      group: 'block',
      attrs: { level: { default: 1 } },
      toDOM() {
        return ['h1', 0]
      },
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
      toDOM() {
        return ['p', 0]
      },
    },
    text: { group: 'inline' },
  },
})

function issue(partial: Partial<AuditIssue> & Pick<AuditIssue, 'id' | 'original' | 'suggestion'>): AuditIssue {
  return {
    type: 'polish',
    reason: 'test',
    context: partial.context || '',
    start: -1,
    end: -1,
    ...partial,
  }
}

function paragraphDoc(text: string) {
  return schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])])
}

function posOf(doc: ReturnType<typeof paragraphDoc>, needle: string) {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText || !node.text) return true
    const at = node.text.indexOf(needle)
    if (at >= 0) found = pos + at
    return true
  })
  return found
}

test('pinIssuesToDoc keeps a heading plus body original', () => {
  const title = '关于人才工作及培训的意见建议'
  const body = '优选手握项目资源、产业线索的专家授课，实现教学与实践的资源互通。'
  const doc = schema.node('doc', null, [
    schema.node('heading', { level: 1 }, [schema.text(title)]),
    schema.node('paragraph', null, [schema.text(body)]),
  ])
  const pinned = pinIssuesToDoc(doc, [
    issue({
      id: 'shouwo',
      original: '优选手握项目资源、产业线索的专家授课',
      suggestion: '建议邀请掌握项目资源、产业线索的专家授课',
    }),
  ])
  assert.equal(pinned.length, 1)
  const slice = doc.textBetween(pinned[0]!.from!, pinned[0]!.to!, '\n', '')
  assert.ok(slice.length >= 2)
  assert.ok('优选手握项目资源、产业线索的专家授课'.includes(slice))
})

test('markSliceValid rejects a one-character slice of a longer original', () => {
  const source = '优选手握项目资源、产业线索的专家授课'
  const doc = paragraphDoc(source)
  const zhuan = posOf(doc, '专')
  assert.equal(
    markSliceValid(doc, issue({ id: 'bad', original: '手握项目资源、产业线索的专家授课', suggestion: '掌握', from: zhuan, to: zhuan + 1 })),
    false,
  )
})

test('split paragraph maps the pinned mark, does not jump to 关于', () => {
  const source = '关于促进科技成果转化。定为4月3日上午9点于综合楼召开。'
  const doc = paragraphDoc(source)
  const pinned = pinIssuesToDoc(doc, [
    issue({
      id: 'yu',
      original: '上午9点于综合楼',
      suggestion: '上午9:00在综合楼',
      context: '定为4月3日上午9点于综合楼召开。',
    }),
  ])
  assert.equal(pinned.length, 1)
  assert.equal(doc.textBetween(pinned[0]!.from!, pinned[0]!.to!, '\n', ''), '点于')

  let state = EditorState.create({ schema, doc })
  const splitAt = posOf(state.doc, '定为')
  assert.ok(splitAt > 0)
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, splitAt)))

  let mapped: AuditIssue | null = null
  const ok = splitBlock(state, (tr) => {
    mapped = mapPinnedIssue(pinned[0]!, tr.mapping, tr.doc.content.size)
    state = state.apply(tr)
  })
  assert.equal(ok, true)
  assert.ok(mapped)
  assert.equal(state.doc.textBetween(mapped.from!, mapped.to!, '\n', ''), '点于')
  assert.ok(state.doc.textBetween(0, mapped.from!, '\n', '').includes('关于'))
  assert.notEqual(state.doc.textBetween(mapped.from!, mapped.to!, '\n', ''), '于')
})

test('already pinned short 于 stays on 9点于 after a split before it', () => {
  const source = '关于促进科技成果转化。定为4月3日上午9点于综合楼召开。'
  const doc = paragraphDoc(source)
  const at = posOf(doc, '9点于') + 2
  const pinned = issue({
    id: 'yu',
    original: '于',
    suggestion: '在',
    context: '上午9点于综合楼',
    from: at,
    to: at + 1,
  })
  assert.equal(doc.textBetween(at, at + 1, '\n', ''), '于')
  assert.equal(doc.textBetween(posOf(doc, '关于') + 1, posOf(doc, '关于') + 2, '\n', ''), '于')

  let state = EditorState.create({ schema, doc })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, posOf(state.doc, '定为'))))
  splitBlock(state, (tr) => {
    const mapped = mapPinnedIssue(pinned, tr.mapping, tr.doc.content.size)
    assert.ok(mapped)
    assert.equal(tr.doc.textBetween(mapped.from!, mapped.to!, '\n', ''), '于')
    assert.ok(tr.doc.textBetween(0, mapped.from!, '\n', '').includes('关于'))
    assert.match(tr.doc.textBetween(Math.max(1, mapped.from! - 4), mapped.from!, '\n', ''), /点$/)
  })
})

test('mapPinnedIssue only moves positions after the split', () => {
  const mapped = mapPinnedIssue(
    issue({ id: 'a', original: '于', suggestion: '在', from: 40, to: 41 }),
    {
      map(pos) {
        return pos >= 20 ? pos + 2 : pos
      },
    },
    80,
  )
  assert.deepEqual({ from: mapped?.from, to: mapped?.to }, { from: 42, to: 43 })
  const beforeSplit = mapPinnedIssue(
    issue({ id: 'b', original: '于', suggestion: '在', from: 8, to: 9 }),
    {
      map(pos) {
        return pos >= 20 ? pos + 2 : pos
      },
    },
    80,
  )
  assert.deepEqual({ from: beforeSplit?.from, to: beforeSplit?.to }, { from: 8, to: 9 })
})
