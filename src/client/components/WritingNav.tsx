import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WritingDoc } from '../library.ts'

function PenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2.5h5.2L13 6.3V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V4A1.5 1.5 0 0 1 4.5 2.5H4z" stroke="currentColor" strokeWidth="1.25" />
      <path d="M9 2.6V6h3.3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6.2 11.6 10.4 7.4l1.2 1.2-4.2 4.2H6.2v-1.2z" fill="currentColor" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function TriangleIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden className={open ? 'ow-nav-arrow open' : 'ow-nav-arrow'}>
      <path d="M5 3.2 10.2 7 5 10.8z" />
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
}: {
  docs: WritingDoc[]
  activeId: string | null
  onToggle?: () => void
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let node = document.getElementById('ow-writing-nav') as HTMLElement | null
    if (!node) {
      node = document.createElement('div')
      node.id = 'ow-writing-nav'
    }
    const place = () => {
      const tree = findTree()
      if (!tree || !node) return
      if (tree.firstElementChild !== node) tree.insertBefore(node, tree.firstChild)
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

  if (!host) return null
  return createPortal(
    <div className="ow-nav-group" data-ow-nav="1">
      <div
        className={`ow-nav-folder${expanded ? ' expanded' : ''}${activeId ? ' active' : ''}`}
        role="treeitem"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="ow-nav-slot ow-nav-icon">
          <PenIcon />
        </span>
        <span className="ow-nav-slot ow-nav-chevron">
          <TriangleIcon open={expanded} />
        </span>
        <span className="ow-nav-title">公文写作</span>
        <span className="ow-nav-actions">
          <button
            type="button"
            className="ow-nav-plus"
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
            <button
              key={doc.id}
              type="button"
              className={`ow-nav-doc${doc.id === activeId ? ' selected' : ''}`}
              role="treeitem"
              aria-selected={doc.id === activeId}
              onClick={() => onOpen(doc.id)}
            >
              <span className="ow-nav-doc-title">{doc.title || '未命名公文'}</span>
            </button>
          ))
        : null}
    </div>,
    host,
  )
}
