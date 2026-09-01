import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WritingDoc } from '../library.ts'

function WritingIcon({ active, thin }: { active?: boolean; thin?: boolean }) {
  const stroke = thin ? 1 : 1.15
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4.2 2.4h5.1L12.6 5.7v7.5H4.2V2.4z"
        stroke="currentColor"
        strokeWidth={stroke}
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.18 : 0}
      />
      <path d="M9.3 2.5v3.2h3.2" stroke="currentColor" strokeWidth={stroke} />
      <path d="M6 10.7h4.2M6 8.4h4.2" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function EllipsisIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3.5" cy="8" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="12.5" cy="8" r="1.15" />
    </svg>
  )
}

function TriangleIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden className={open ? 'ow-nav-arrow open' : 'ow-nav-arrow'}>
      <path d="M5 3.15 10.35 7 5 10.85z" />
    </svg>
  )
}

function findTree(): HTMLElement | null {
  const trees = Array.from(document.querySelectorAll<HTMLElement>('[role="tree"]'))
  return trees.find((el) => el.getBoundingClientRect().left < 420) || null
}

export function WritingNav({
  docs,
  activeId,
  onOpen,
  onCreate,
  onDelete,
  onRestyle,
  onCloseWriting,
}: {
  docs: WritingDoc[]
  activeId: string | null
  onOpen: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRestyle: (id: string) => void
  onCloseWriting: () => void
}) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let node = document.getElementById('ow-writing-nav') as HTMLElement | null
    if (!node) {
      node = document.createElement('div')
      node.id = 'ow-writing-nav'
    }
    const place = () => {
      const tree = findTree()
      const list = tree?.parentElement
      if (!tree || !list || !node) return
      if (node.nextElementSibling !== tree) list.insertBefore(node, tree)
      setHost(node)
    }
    place()
    const mo = new MutationObserver(place)
    mo.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(place, 400)
    return () => {
      mo.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('#ow-writing-nav') || target.closest('.ow-nav-menu')) return
      const row = target.closest('[role="treeitem"]') as HTMLElement | null
      if (!row) return
      if (row.getAttribute('aria-selected') === 'true' || /sessionRow|_selected/.test(row.className)) {
        onCloseWriting()
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [onCloseWriting])

  useEffect(() => {
    if (!menuId) return
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.ow-nav-menu') || target.closest('.ow-nav-ellipsis')) return
      setMenuId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuId])

  if (!host) return null
  const childActive = Boolean(activeId)
  return createPortal(
    <div className="ow-nav-group" data-ow-nav="1">
      <div
        className={`ow-nav-folder${expanded ? ' expanded' : ''}${childActive ? ' contains-current' : ''}`}
        role="treeitem"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={`ow-nav-slot ow-nav-icon${childActive ? ' active' : ''}`}>
          <WritingIcon active={childActive} thin={!expanded && !childActive} />
        </span>
        <span className="ow-nav-slot ow-nav-chevron">
          <TriangleIcon open={expanded} />
        </span>
        <span className="ow-nav-title">公文写作</span>
        <span className="ow-nav-actions">
          <button
            type="button"
            className="ow-nav-icon-btn"
            aria-label="新增公文"
            title="新增公文"
            onClick={(event) => {
              event.stopPropagation()
              onCreate()
            }}
          >
            <PlusIcon />
          </button>
        </span>
      </div>
      {expanded
        ? docs.map((doc) => (
            <div
              key={doc.id}
              className={`ow-nav-doc${doc.id === activeId ? ' selected' : ''}${menuId === doc.id ? ' menu-open' : ''}`}
              role="treeitem"
              aria-selected={doc.id === activeId}
              onClick={() => onOpen(doc.id)}
            >
              <span className="ow-nav-slot" />
              <span className="ow-nav-doc-title">{doc.title || '未命名公文'}</span>
              <span className="ow-nav-actions">
                <button
                  type="button"
                  className="ow-nav-icon-btn ow-nav-ellipsis"
                  aria-label="公文操作"
                  onClick={(event) => {
                    event.stopPropagation()
                    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenuPos({ top: rect.bottom + 4, left: rect.right - 148 })
                    setMenuId((id) => (id === doc.id ? null : doc.id))
                  }}
                >
                  <EllipsisIcon />
                </button>
              </span>
            </div>
          ))
        : null}
      {menuId && menuPos
        ? createPortal(
            <div ref={menuRef} className="ow-nav-menu" style={{ top: menuPos.top, left: Math.max(8, menuPos.left) }} role="menu">
              <button
                type="button"
                onClick={() => {
                  onRestyle(menuId)
                  setMenuId(null)
                }}
              >
                修改文体
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onDelete(menuId)
                  setMenuId(null)
                }}
              >
                删除
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>,
    host,
  )
}
