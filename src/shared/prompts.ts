import { normalizeDocType, type DocTypeId } from './docTypes.ts'
import type { RewriteMode } from './types.ts'

const STYLE: Record<DocTypeId, string> = {
  notice_letter: [
    '通知以祈使句为主，明确时间、地点、事项、要求；用词具指示性、告知性。',
    '常用「现就有关事项通知如下」「请认真贯彻执行」「特此通知」。',
    '函用于不相隶属机关之间，平和、平等、礼貌。',
    '常用「现就……事宜函商如下」「请予复函」「专此函达」。',
  ].join(''),
  info_summary: [
    '信息稿主旨突出、文字精练，客观中立、叙事流畅，突出时效性与工作亮点，含时间、地点、人物、经过、成效。',
    '工作总结 / 工作汇报结构为「主要做法及成效—存在问题—下步打算」。',
    '平实客观、数据详实。多用「今年以来……」「一是抓……二是促……」「取得了明显成效」「下一步我们将……」。',
  ].join(''),
  policy: [
    '政策 / 管理办法用条文式结构，用词高度准确严密，具强制约束力。',
    '多用「应当」「严禁」「自发布之日起施行」「违反本办法的将……」。',
    '意见 / 实施意见偏指导性、宏观性，结构常为「总体要求—重点任务—保障措施」。',
    '决定 / 决议权威果断严肃。多用「会议决定」「一致同意」。',
  ].join(''),
  research: [
    '调研报告扎实求真、客观务实，结构为「现状剖析—痛点问题梳理—针对性对策建议」。',
    '多用「经实地调研发现……」「制约发展的核心瓶颈在于……」「为此建议采取以下措施……」。',
    '请示 / 报告谦恭规范，必须明确事由、请示缘由与具体请求。',
    '多用「妥否，请批示」「现将有关情况报告如下」，请求明确且单一。',
    '会议纪要客观纪实。多用「会议听取了……」「会议指出……」「会议强调……」。',
  ].join(''),
  general: '通用机关公文：严肃、庄重、严谨的书面用词，层次清楚，不用口语、网络语和对话腔。',
}

export function styleGuide(docType: string | undefined): string {
  return STYLE[normalizeDocType(docType)]
}

export function autocompleteSystem(input: {
  docType?: string
  title?: string
  intent?: string
}): string {
  const title = (input.title || '').trim()
  const intent = (input.intent || '').trim()
  return [
    '你是专业公文写作秘书。根据光标前的上下文，立刻输出续写正文。',
    '必须把续写写在可见正文里，不要只在思考过程中写。不要输出思考过程。',
    '禁止：标题、解释、重复上文、重复标点、Markdown、对话腔、引号包裹、编号列表。',
    '长度 8–40 字。自然衔接上文，符合机关公文用词。',
    '若上文以不完整的句子结尾，必须先把该句补完整，再视情况续写。',
    `当前文体：${styleGuide(input.docType)}`,
    title ? `公文标题：${title}` : '',
    intent ? `写作意图：${intent}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function auditSystem(input: { docType?: string }): string {
  return [
    '你是资深机关公文审校专家。只标真正的硬伤，不要吹毛求疵。',
    '只标当前正文里原样存在的问题。不得凭记忆、草稿或已删除句子编造 original。',
    'type 规则：typo 仅限错字、别字、标点写错；口语/不够正式/公文用语一律 polish；缺要素才用 insert。',
    '只标：错别字、语法标点硬伤；严重影响公文质感的口语；明显的常识性逻辑缺失。',
    '把 JSON 写在可见正文里，不要只在思考过程中写。不要输出思考过程。',
    '输出严格 JSON，不要任何多余说明，不要包在 Markdown 代码块里。形状：',
    '{"suggestions":[{"type":"typo|polish|insert","original":"原文中存在的问题文本（insert 时为空串）","suggestion":"建议改成什么 / 要插入什么","context":"原文中原封不动存在的连续片段，用于定位","explanation":"为什么改","start":0,"end":0}]}',
    'original 必须是真正要改的最短片段，例如只改「上午9点」不要整句。suggestion 只对应这段。',
    'context 取材规则（最关键）：',
    '- typo / polish：取 10–25 字连续原文，必须包含 original。',
    '- insert：取插入点前方紧邻的 8–15 字连续原文。',
    'context 必须是原文里原封不动存在的连续文本，不能有任何改写。',
    `当前文体：${styleGuide(input.docType)}`,
  ].join('\n')
}

const MODE_HINT: Record<RewriteMode, string> = {
  expand: '扩写：在不改变原意的前提下补充必要内容，篇幅更详细。',
  shorten: '简写：压缩篇幅，保留要点，更精简。',
  abstract: '拔高写虚：更宏观、抽象，强调意义与要求。',
  concrete: '细化写实：更具体务实，补足对象、时限、措施与数据。',
  professional: '文笔更有文采，但仍须庄重得体，禁止华丽堆砌。',
  plain: '文笔更通俗易懂，但仍须书面、庄重，禁止口语。',
  reference: '融入参考内容中的事实、数据与表述，不得编造未给出的事实。',
  custom: '严格按自定义修改指令执行。',
}

export function rewriteSystem(input: {
  docType?: string
  modes?: RewriteMode[]
  custom?: string
  reference?: string
}): string {
  const modes = input.modes?.length ? input.modes : []
  const extra = modes.map((mode) => MODE_HINT[mode]).filter(Boolean)
  return [
    '你是资深政府机关公文撰稿专家。只输出改写后的结果本身。',
    '禁止：解释、对话、Markdown、标题、前后缀、引号包裹全文。',
    '保持原意，符合机关公文语体。',
    `当前文体：${styleGuide(input.docType)}`,
    extra.length ? `附加要求：\n${extra.map((line) => `- ${line}`).join('\n')}` : '',
    input.reference?.trim() ? `必须融入的参考内容：\n${input.reference.trim()}` : '',
    input.custom?.trim() ? `自定义修改指令：\n${input.custom.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function cleanModelText(raw: string): string {
  let text = (raw || '').trim()
  text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
  text = text
    .replace(/^(续写|改写后|如下)[的]?[文本内容句段]*[：:]\s*/i, '')
    .trim()
  if (
    (text.startsWith('「') && text.endsWith('」')) ||
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('“') && text.endsWith('”'))
  ) {
    text = text.slice(1, -1).trim()
  }
  return text
}

/** Last plausible continuation from a thinking dump when the model emitted no visible text. */
export function extractGhostFromReasoning(raw: string): string {
  const cleaned = cleanModelText(raw).replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const quoted = cleaned.match(/[「“"]([^」”"]{8,80})[」”"]/)
  if (quoted?.[1]) return quoted[1].trim()
  const sentences = cleaned.split(/(?<=[。！？；])/).map((item) => item.trim()).filter((item) => item.length >= 8)
  const last = sentences.at(-1) || cleaned
  return last.slice(0, 60)
}
