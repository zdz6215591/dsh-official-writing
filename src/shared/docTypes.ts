export type DocTypeId =
  | 'notice_letter'
  | 'info_summary'
  | 'policy'
  | 'research'
  | 'general'

export const DOC_TYPES: {
  id: DocTypeId
  label: string
  desc: string
  hint: string
}[] = [
  {
    id: 'notice_letter',
    label: '通知 / 函',
    desc: '部署事项、机关往来',
    hint: '条款化、主送规范、要求可执行',
  },
  {
    id: 'info_summary',
    label: '信息 / 总结报告',
    desc: '信息稿、工作总结',
    hint: '短、新、实，重事实数据',
  },
  {
    id: 'policy',
    label: '政策 / 办法',
    desc: '规范性文件',
    hint: '条款体、主体义务清晰、可执行可解释',
  },
  {
    id: 'research',
    label: '调研报告',
    desc: '现状—问题—对策',
    hint: '有材料有观点，建议可操作',
  },
  {
    id: 'general',
    label: '一般公文',
    desc: '通用机关文稿',
    hint: '庄重简明，层次清楚',
  },
]

export const DOC_TYPE_LABEL: Record<DocTypeId, string> = {
  notice_letter: '通知 / 函',
  info_summary: '信息 / 总结报告',
  policy: '政策 / 办法',
  research: '调研报告',
  general: '一般公文',
}

const LEGACY: Record<string, DocTypeId> = {
  notice_letter: 'notice_letter',
  info_summary: 'info_summary',
  policy: 'policy',
  research: 'research',
  general: 'general',
  notice2: 'notice_letter',
  letter: 'notice_letter',
  notice: 'notice_letter',
  report: 'research',
  decision: 'policy',
  opinion: 'policy',
}

/** 任何输入都落到一个有效文体，不能落空。 */
export function normalizeDocType(id: string | undefined | null): DocTypeId {
  if (!id) return 'general'
  return LEGACY[id] ?? 'general'
}

export function isDocTypeId(id: string): id is DocTypeId {
  return id in DOC_TYPE_LABEL
}
