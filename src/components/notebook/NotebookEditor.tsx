import { useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGripVertical, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'

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
  onMoveCell: (sourceCellId: string, targetCellId: string) => void
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

  const getPreviousCellId = (cellId: string): string | null => {
    const idx = document.cells.findIndex((c) => c.id === cellId)
    return idx > 0 ? document.cells[idx - 1].id : null
  }

  const getNextCellId = (cellId: string): string | null => {
    const idx = document.cells.findIndex((c) => c.id === cellId)
    return idx >= 0 && idx < document.cells.length - 1 ? document.cells[idx + 1].id : null
  }

  return (
    <div className="notebook-editor" key={documentRevision}>
      {document.cells.map((cell) => (
        <section
          key={cell.id}
          className={`notebook-cell${activeCellId === cell.id ? ' notebook-cell-active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(event) => {
            event.preventDefault()
            const srcId = draggedCellId.current
            draggedCellId.current = null
            if (!srcId || srcId === cell.id) return
            onMoveCell(srcId, cell.id)
          }}
        >
          <div className="cell-gutter">
            <button
              type="button"
              className="cell-icon-button drag-handle"
              draggable
              title="Drag to reorder"
              onDragStart={(event) => {
                draggedCellId.current = cell.id
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', cell.id)
              }}
              onDragEnd={() => { draggedCellId.current = null }}
            >
              <FontAwesomeIcon icon={faGripVertical} />
            </button>
            <button
              type="button"
              className="cell-icon-button"
              title="Add cell below"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAddCellBelow(cell.id)}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
            <button
              type="button"
              className="cell-icon-button danger-button"
              title="Delete cell"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemoveCell(cell.id)}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
          <div className="cell-content">
            <CellEditor
              cell={cell}
              isActive={activeCellId === cell.id}
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
      ))}
    </div>
  )
}
