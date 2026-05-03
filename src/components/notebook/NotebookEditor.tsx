import { Fragment, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCode, faEye, faGripVertical, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'

import { CellEditor, type CellInsertHandle } from '../cell/CellEditor'
import type { NotebookCell, NotebookDocument } from '../../shared/types/notebook'

interface NotebookEditorProps {
  activeCellId: string | null
  document: NotebookDocument
  documentRevision: number
  onActivateCell: (cellId: string) => void
  onAddCellBelow: (cellId: string) => void
  onCellChange: (cellId: string, cell: NotebookCell) => void
  onInsertHandleReady: (handle: CellInsertHandle) => void
  onMoveCell: (sourceCellId: string, targetCellId: string, position: 'before' | 'after') => void
  onRemoveCell: (cellId: string) => void
  onFocusCell: (cellId: string) => void
}

export function NotebookEditor({
  activeCellId,
  document,
  documentRevision,
  onActivateCell,
  onAddCellBelow,
  onCellChange,
  onInsertHandleReady,
  onMoveCell,
  onRemoveCell,
  onFocusCell,
}: NotebookEditorProps) {
  const draggedCellId = useRef<string | null>(null)
  const dragImageRef = useRef<HTMLElement | null>(null)
  const [latexViewCellIds, setLatexViewCellIds] = useState<Set<string>>(() => new Set())
  const [dragOverTarget, setDragOverTarget] = useState<{ targetCellId: string; position: 'before' | 'after' } | null>(null)

  useEffect(() => {
    const liveCellIds = new Set(document.cells.map((cell) => cell.id))
    setLatexViewCellIds((current) => {
      const next = new Set(Array.from(current).filter((cellId) => liveCellIds.has(cellId)))
      return next.size === current.size ? current : next
    })
  }, [document.cells])

  const getPreviousCellId = (cellId: string): string | null => {
    const idx = document.cells.findIndex((c) => c.id === cellId)
    return idx > 0 ? document.cells[idx - 1].id : null
  }

  const getNextCellId = (cellId: string): string | null => {
    const idx = document.cells.findIndex((c) => c.id === cellId)
    return idx >= 0 && idx < document.cells.length - 1 ? document.cells[idx + 1].id : null
  }

  const getDropPreviewIndex = (): number | null => {
    const sourceId = draggedCellId.current
    if (!sourceId || !dragOverTarget) return null

    const sourceIndex = document.cells.findIndex((cell) => cell.id === sourceId)
    const targetIndex = document.cells.findIndex((cell) => cell.id === dragOverTarget.targetCellId)
    if (sourceIndex < 0 || targetIndex < 0) return null

    let previewIndex = targetIndex + (dragOverTarget.position === 'after' ? 1 : 0)
    if (sourceIndex < previewIndex) {
      previewIndex -= 1
    }

    return Math.max(0, Math.min(previewIndex, document.cells.length - 1))
  }

  const sourceCellId = draggedCellId.current
  const cellsWithoutSource = sourceCellId ? document.cells.filter((cell) => cell.id !== sourceCellId) : document.cells
  const dropPreviewIndex = getDropPreviewIndex()

  return (
    <div className="notebook-editor" key={documentRevision}>
      {cellsWithoutSource.map((cell, renderIndex) => (
        <Fragment key={cell.id}>
          {dropPreviewIndex === renderIndex ? <div className="row-drop-indicator" aria-hidden /> : null}
          <section
            className={`notebook-cell${activeCellId === cell.id ? ' notebook-cell-active' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const rect = event.currentTarget.getBoundingClientRect()
              const position: 'before' | 'after' = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
              setDragOverTarget({ targetCellId: cell.id, position })
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setDragOverTarget((current) => (current?.targetCellId === cell.id ? null : current))
            }}
            onDrop={(event) => {
              event.preventDefault()
              const srcId = draggedCellId.current
              const dropTarget = dragOverTarget
              draggedCellId.current = null
              setDragOverTarget(null)
              if (!srcId || !dropTarget || srcId === dropTarget.targetCellId) return
              onMoveCell(srcId, dropTarget.targetCellId, dropTarget.position)
            }}
          >
          <div className="cell-gutter">
            <div className="cell-button-tooltip-wrap">
              <button
                type="button"
                className="cell-icon-button drag-handle"
                draggable
                aria-label="Drag Row"
                onDragStart={(event) => {
                  draggedCellId.current = cell.id
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', cell.id)

                  const row = event.currentTarget.closest('.notebook-cell') as HTMLElement | null
                  if (row) {
                    const dragImage = row.cloneNode(true) as HTMLElement
                    dragImage.classList.add('drag-row-preview')
                    dragImage.style.width = `${row.getBoundingClientRect().width}px`
                    dragImage.style.position = 'fixed'
                    dragImage.style.top = '-10000px'
                    dragImage.style.left = '-10000px'
                    window.document.body.appendChild(dragImage)
                    dragImageRef.current = dragImage
                    event.dataTransfer.setDragImage(dragImage, 24, 18)
                  }
                }}
                onDragEnd={() => {
                  draggedCellId.current = null
                  setDragOverTarget(null)
                  if (dragImageRef.current) {
                    dragImageRef.current.remove()
                    dragImageRef.current = null
                  }
                }}
              >
                <FontAwesomeIcon icon={faGripVertical} />
              </button>
              <span className="cell-button-tooltip">Drag Row</span>
            </div>
            <div className="cell-button-tooltip-wrap">
              <button
                type="button"
                className={`cell-icon-button${latexViewCellIds.has(cell.id) ? ' cell-icon-button-active' : ''}`}
                aria-label="Toggle LaTeX View"
                aria-pressed={latexViewCellIds.has(cell.id)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onActivateCell(cell.id)
                  setLatexViewCellIds((current) => {
                    const next = new Set(current)
                    if (next.has(cell.id)) {
                      next.delete(cell.id)
                    } else {
                      next.add(cell.id)
                    }
                    return next
                  })
                }}
              >
                <FontAwesomeIcon icon={latexViewCellIds.has(cell.id) ? faEye : faCode} />
              </button>
              <span className="cell-button-tooltip">Toggle LaTeX View</span>
            </div>
            <div className="cell-button-tooltip-wrap">
              <button
                type="button"
                className="cell-icon-button"
                aria-label="Add New Row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAddCellBelow(cell.id)}
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <span className="cell-button-tooltip">Add New Row</span>
            </div>
            <div className="cell-button-tooltip-wrap">
              <button
                type="button"
                className="cell-icon-button danger-button"
                aria-label="Delete Row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onRemoveCell(cell.id)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
              <span className="cell-button-tooltip">Delete Row</span>
            </div>
          </div>
          <div className="cell-content">
            <CellEditor
              cell={cell}
              isActive={activeCellId === cell.id}
              viewMode={latexViewCellIds.has(cell.id) ? 'latex' : 'wysiwyg'}
              onActivate={() => onActivateCell(cell.id)}
              onChange={(next) => onCellChange(cell.id, next)}
              onInsertHandle={(handle) => {
                if (activeCellId === cell.id) {
                  onInsertHandleReady(handle)
                }
              }}
              onAddCellBelow={() => onAddCellBelow(cell.id)}
              onDeleteCell={() => onRemoveCell(cell.id)}
              onFocusPrevious={() => {
                const prevId = getPreviousCellId(cell.id)
                if (prevId) onFocusCell(prevId)
              }}
              onFocusNext={() => {
                const nextId = getNextCellId(cell.id)
                if (nextId) onFocusCell(nextId)
              }}
            />
          </div>
          </section>
        </Fragment>
      ))}
      {dropPreviewIndex === cellsWithoutSource.length ? <div className="row-drop-indicator" aria-hidden /> : null}
    </div>
  )
}
