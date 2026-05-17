import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCode, faEye, faGripVertical, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'

import { CellEditor, type CellChangeMetadata, type CellInsertHandle, type CorrectionHighlightRange, type EditorSelectionState } from '../cell/CellEditor'
import type { NotebookCell, NotebookDocument } from '../../shared/types/notebook'

interface NotebookEditorProps {
  activeCellId: string | null
  document: NotebookDocument
  documentRevision: number
  onActivateCell: (cellId: string) => void
  onAddCellAbove: (cellId: string, initialLatex?: string) => void
  onAddCellBelow: (cellId: string, initialLatex?: string) => void
  onAddCellsBelow: (cellId: string, initialLatexRows: string[]) => void
  onCellChange: (cellId: string, cell: NotebookCell, metadata?: CellChangeMetadata) => void
  onInsertHandleReady: (handle: CellInsertHandle) => void
  pendingSelectionRestore: EditorSelectionState | null
  onSelectionRestoreComplete: () => void
  onMoveCell: (sourceCellId: string, targetCellId: string, position: 'before' | 'after') => void
  onRemoveCell: (cellId: string) => void
  onFocusCell: (cellId: string) => void
  selectedCellIds: Set<string>
  onSelectCellRows: (cellId: string, mode: 'replace' | 'toggle' | 'range') => void
  onExtendCellRowSelection: (cellId: string) => void
  correctionHighlight: { cellId: string } & CorrectionHighlightRange | null
}

type RowListKind = 'bulletList' | 'numberedList' | null

const NUMBERED_LIST_CELL_PATTERN = /^\\begin\{enumerate\}\\item\s*([\s\S]*?)\\end\{enumerate\}$/
const BULLET_LIST_CELL_PATTERN = /^\\begin\{itemize\}\\item\s*([\s\S]*?)\\end\{itemize\}$/

function rowListKindFromLatex(latex: string): RowListKind {
  const trimmed = latex.trim()
  if (NUMBERED_LIST_CELL_PATTERN.test(trimmed)) return 'numberedList'
  if (BULLET_LIST_CELL_PATTERN.test(trimmed)) return 'bulletList'
  return null
}

export function NotebookEditor({
  activeCellId,
  document,
  documentRevision,
  onActivateCell,
  onAddCellAbove,
  onAddCellBelow,
  onAddCellsBelow,
  onCellChange,
  onInsertHandleReady,
  pendingSelectionRestore,
  onSelectionRestoreComplete,
  onMoveCell,
  onRemoveCell,
  onFocusCell,
  selectedCellIds,
  onSelectCellRows,
  onExtendCellRowSelection,
  correctionHighlight,
}: NotebookEditorProps) {
  const draggedCellId = useRef<string | null>(null)
  const dragImageRef = useRef<HTMLElement | null>(null)
  const dragRectsRef = useRef<{ cellId: string; midY: number }[]>([])
  const notebookEditorRef = useRef<HTMLDivElement | null>(null)
  const isSelectingRowsRef = useRef(false)
  const textDragSourceCellRef = useRef<string | null>(null)
  const [draggingCellId, setDraggingCellId] = useState<string | null>(null)
  const [latexViewCellIds, setLatexViewCellIds] = useState<Set<string>>(() => new Set())
  const [dragOverTarget, setDragOverTarget] = useState<{ targetCellId: string; position: 'before' | 'after' } | null>(null)
  const [continuedNumberingCellIds, setContinuedNumberingCellIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const liveCellIds = new Set(document.cells.map((cell) => cell.id))
    setLatexViewCellIds((current) => {
      const next = new Set(Array.from(current).filter((cellId) => liveCellIds.has(cellId)))
      return next.size === current.size ? current : next
    })
    setContinuedNumberingCellIds((current) => {
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
    if (!draggingCellId || !dragOverTarget) return null

    const targetIndex = document.cells.findIndex((cell) => cell.id === dragOverTarget.targetCellId)
    if (targetIndex < 0) return null

    const previewIndex = targetIndex + (dragOverTarget.position === 'after' ? 1 : 0)
    return Math.max(0, Math.min(previewIndex, document.cells.length))
  }

  const dropPreviewIndex = getDropPreviewIndex()
  const rowListKindByCellId = new Map<string, RowListKind>()
  const numberedListValueByCellId = new Map<string, number>()
  const canContinueNumberingByCellId = new Map<string, boolean>()

  let previousRowWasNumbered = false
  let previousNumberedValue = 0
  let lastSeenNumberedValue = 0

  document.cells.forEach((row) => {
    const rowKind = rowListKindFromLatex(row.latex)
    rowListKindByCellId.set(row.id, rowKind)

    if (rowKind !== 'numberedList') {
      previousRowWasNumbered = false
      return
    }

    const hasPreviousNumbering = lastSeenNumberedValue > 0
    const shouldContinueFromLast = continuedNumberingCellIds.has(row.id) && !previousRowWasNumbered && hasPreviousNumbering
    const nextValue = previousRowWasNumbered
      ? previousNumberedValue + 1
      : shouldContinueFromLast
        ? lastSeenNumberedValue + 1
        : 1

    numberedListValueByCellId.set(row.id, nextValue)
    canContinueNumberingByCellId.set(row.id, !previousRowWasNumbered && hasPreviousNumbering && !shouldContinueFromLast)
    previousRowWasNumbered = true
    previousNumberedValue = nextValue
    lastSeenNumberedValue = nextValue
  })

  const cleanupDrag = useCallback(() => {
    draggedCellId.current = null
    dragRectsRef.current = []
    setDraggingCellId(null)
    setDragOverTarget(null)
    if (dragImageRef.current) {
      dragImageRef.current.remove()
      dragImageRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!draggingCellId) return undefined

    window.addEventListener('dragend', cleanupDrag, true)
    return () => window.removeEventListener('dragend', cleanupDrag, true)
  }, [cleanupDrag, draggingCellId])

  useEffect(() => {
    const stopRowSelection = () => {
      isSelectingRowsRef.current = false
      textDragSourceCellRef.current = null
    }

    window.addEventListener('pointerup', stopRowSelection, true)
    window.addEventListener('pointercancel', stopRowSelection, true)
    return () => {
      window.removeEventListener('pointerup', stopRowSelection, true)
      window.removeEventListener('pointercancel', stopRowSelection, true)
    }
  }, [])

  const updateDragOverTarget = (targetCellId: string, position: 'before' | 'after') => {
    setDragOverTarget((current) => (
      current?.targetCellId === targetCellId && current.position === position
        ? current
        : { targetCellId, position }
    ))
  }

  const dragTargetFromPointer = (clientY: number): { targetCellId: string; position: 'before' | 'after' } | null => {
    const sourceId = draggedCellId.current
    if (!sourceId) return null

    // Prefer frozen rects captured at dragstart (prevents indicator layout shifts from
    // causing jitter). Fall back to live DOM queries if the cache is missing.
    let rects = dragRectsRef.current.filter((r) => r.cellId !== sourceId)
    if (rects.length === 0 && notebookEditorRef.current) {
      rects = Array.from(
        notebookEditorRef.current.querySelectorAll<HTMLElement>('.notebook-cell[data-cell-id]')
      )
        .filter((row) => row.dataset.cellId !== sourceId)
        .map((row) => {
          const rect = row.getBoundingClientRect()
          return { cellId: row.dataset.cellId!, midY: rect.top + rect.height / 2 }
        })
    }
    if (rects.length === 0) return null

    for (const { cellId, midY } of rects) {
      if (clientY < midY) {
        return { targetCellId: cellId, position: 'before' }
      }
    }

    return { targetCellId: rects[rects.length - 1].cellId, position: 'after' }
  }

  const updateDragTargetFromPointer = (clientY: number) => {
    const nextTarget = dragTargetFromPointer(clientY)
    if (nextTarget) {
      updateDragOverTarget(nextTarget.targetCellId, nextTarget.position)
    } else {
      setDragOverTarget(null)
    }
  }

  return (
    <div
      ref={notebookEditorRef}
      className="notebook-editor"
      key={documentRevision}
      onDragOver={(event) => {
        if (!draggedCellId.current) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        updateDragTargetFromPointer(event.clientY)
      }}
      onDrop={(event) => {
        if (!draggedCellId.current) return
        event.preventDefault()
        const srcId = draggedCellId.current
        const dropTarget = dragTargetFromPointer(event.clientY) ?? dragOverTarget
        cleanupDrag()
        if (!srcId || !dropTarget || srcId === dropTarget.targetCellId) return
        onMoveCell(srcId, dropTarget.targetCellId, dropTarget.position)
      }}
    >
      {document.cells.map((cell, renderIndex) => (
        <Fragment key={cell.id}>
          {dropPreviewIndex === renderIndex ? <div className="row-drop-indicator" aria-hidden /> : null}
          <section
            className={`notebook-cell${activeCellId === cell.id ? ' notebook-cell-active' : ''}${draggingCellId === cell.id ? ' notebook-cell-dragging' : ''}${selectedCellIds.has(cell.id) ? ' notebook-cell-row-selected' : ''}`}
            data-cell-id={cell.id}
            onPointerDown={(event) => {
              if (event.button !== 0 || isSelectingRowsRef.current) return
              const target = event.target instanceof Element ? event.target : null
              if (target && !target.closest('.cell-gutter')) {
                textDragSourceCellRef.current = cell.id
              }
            }}
            onPointerEnter={() => {
              if (isSelectingRowsRef.current) {
                onExtendCellRowSelection(cell.id)
                return
              }
              const sourceCellId = textDragSourceCellRef.current
              if (sourceCellId && sourceCellId !== cell.id) {
                window.getSelection()?.removeAllRanges()
                isSelectingRowsRef.current = true
                textDragSourceCellRef.current = null
                onSelectCellRows(sourceCellId, 'replace')
                onExtendCellRowSelection(cell.id)
              }
            }}
          >
          <div className="cell-gutter">
            <div className="cell-button-tooltip-wrap row-number-wrap">
              <button
                type="button"
                className="cell-icon-button row-number-button"
                aria-label={`Row ${renderIndex + 1}`}
                aria-pressed={selectedCellIds.has(cell.id)}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  // Release implicit pointer capture so pointerenter fires on other rows during drag
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  isSelectingRowsRef.current = true
                  onSelectCellRows(cell.id, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace')
                }}
              >
                {renderIndex + 1}
              </button>
            </div>
            <div className="cell-button-tooltip-wrap">
              <button
                type="button"
                className="cell-icon-button drag-handle"
                draggable
                aria-label="Drag Row"
                onDragStart={(event) => {
                  // Frozen positions prevent the drop indicator's height from shifting
                  // cell rects and causing jitter on subsequent dragover events.
                  if (notebookEditorRef.current) {
                    dragRectsRef.current = Array.from(
                      notebookEditorRef.current.querySelectorAll<HTMLElement>('.notebook-cell[data-cell-id]')
                    ).map((row) => {
                      const rect = row.getBoundingClientRect()
                      return { cellId: row.dataset.cellId!, midY: rect.top + rect.height / 2 }
                    })
                  }

                  draggedCellId.current = cell.id
                  setDraggingCellId(cell.id)
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
                onDragEnd={cleanupDrag}
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
              correctionHighlight={correctionHighlight?.cellId === cell.id ? correctionHighlight : null}
              onActivate={() => onActivateCell(cell.id)}
              onChange={(next, metadata) => onCellChange(cell.id, next, metadata)}
              onInsertHandle={(handle) => {
                if (activeCellId === cell.id) {
                  onInsertHandleReady(handle)
                }
              }}
              pendingSelectionRestore={activeCellId === cell.id ? pendingSelectionRestore : null}
              onSelectionRestoreComplete={onSelectionRestoreComplete}
              onAddCellBelow={(initialLatex) => onAddCellBelow(cell.id, initialLatex)}
              onAddCellAbove={(initialLatex) => onAddCellAbove(cell.id, initialLatex)}
              onAddCellsBelow={(initialLatexRows) => onAddCellsBelow(cell.id, initialLatexRows)}
              onDeleteCell={() => onRemoveCell(cell.id)}
              rowListKind={rowListKindByCellId.get(cell.id) ?? null}
              numberedListValue={numberedListValueByCellId.get(cell.id)}
              canContinueNumbering={canContinueNumberingByCellId.get(cell.id) ?? false}
              onContinueNumbering={() => {
                setContinuedNumberingCellIds((current) => {
                  if (current.has(cell.id)) return current
                  const next = new Set(current)
                  next.add(cell.id)
                  return next
                })
              }}
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
      {dropPreviewIndex === document.cells.length ? <div className="row-drop-indicator" aria-hidden /> : null}
    </div>
  )
}
