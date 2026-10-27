import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  deleteDoc,
  getLibrary,
  openDoc,
  startNewDoc,
  subscribeLibrary,
  type WritingDoc,
} from '../library.ts'

function PenIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.2 2.4h5.1L12.6 5.7v7.5H4.2V2.4z"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <path d="M9.3 2.5v3.2h3.2" stroke="currentColor" strokeWidth="1.15" />
      <path d="M6 10.7h4.2M6 8.4h4.2" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function EllipsisIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3.5" cy="8" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="12.5" cy="8" r="1.15" />
    </svg>
  )
}

export function WritingSidebarPanel({
  onOpenWorkbench,
  onRestyleDoc,
  isOpen = false,
}: {
  onOpenWorkbench: (id: string) => void
  onRestyleDoc: (id: string) => void
  isOpen?: boolean
}) {
  const [lib, setLib] = useState(() => getLibrary())
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribeLibrary(() => setLib(getLibrary()))
  }, [])

  useEffect(() => {
    if (!menuId) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.ow-sidebar-menu') || target.closest('.ow-sidebar-more')) return
      setMenuId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuId])

  const handleCreate = () => {
    const doc = startNewDoc()
    onOpenWorkbench(doc.id)
  }

  const handleSelect = (docId: string) => {
    openDoc(docId)
    onOpenWorkbench(docId)
  }

  const handleDelete = (docId: string) => {
    deleteDoc(docId)
    setMenuId(null)
  }

  const handleRestyle = (docId: string) => {
    onRestyleDoc(docId)
    setMenuId(null)
  }

  return (
    <div className="ow-sidebar-panel">
      <div className="ow-sidebar-head">
        <div className="ow-sidebar-head-title">
          <span>公文列表</span>
          {lib.docs.length > 0 && <span className="ow-sidebar-count">{lib.docs.length}</span>}
        </div>
        <button
          type="button"
          className="ow-sidebar-action-btn"
          title="新建公文"
          aria-label="新建公文"
          onClick={handleCreate}
        >
          <PlusIcon />
        </button>
      </div>

      <div className="ow-sidebar-list" role="list">
        {lib.docs.length === 0 ? (
          <div className="ow-sidebar-empty">
            <p>暂无公文</p>
            <button type="button" className="ow-btn sm primary" onClick={handleCreate}>
              起草第一篇公文
            </button>
          </div>
        ) : (
          lib.docs.map((doc) => {
            const isSelected = isOpen && doc.id === lib.activeId
            return (
              <div
                key={doc.id}
                role="listitem"
                className={`ow-sidebar-row${isSelected ? ' selected' : ''}${menuId === doc.id ? ' menu-open' : ''}`}
                onClick={() => handleSelect(doc.id)}
              >
                <span className="ow-sidebar-row-icon">
                  <PenIcon />
                </span>
                <span className="ow-sidebar-row-title" title={doc.title || '未命名公文'}>
                  {doc.title || '未命名公文'}
                </span>
                <div className="ow-sidebar-row-actions">
                  <button
                    type="button"
                    className="ow-sidebar-more"
                    aria-label="操作"
                    title="操作"
                    onClick={(e) => {
                      e.stopPropagation()
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 140) })
                      setMenuId((cur) => (cur === doc.id ? null : doc.id))
                    }}
                  >
                    <EllipsisIcon />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {menuId && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="ow-sidebar-menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              role="menu"
            >
              <button type="button" onClick={() => handleRestyle(menuId)}>
                修改文体
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(menuId)}>
                删除公文
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
