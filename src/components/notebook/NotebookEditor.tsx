import { useRef } from 'react'

import type { LexicalEditor } from 'lexical'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGripVertical, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'

import { MathCellEditor, type MathFieldElementLike } from '../math/MathCellEditor'
import { RichTextCellEditor } from './RichTextCellEditor'
import type { NotebookCell, NotebookCellKind, NotebookDocument } from '../../shared/types/notebook'

interface NotebookEditorProps {
  activeCellId: string | null
  document: NotebookDocument
  documentRevision: number
  onActivateCell: (cellId: string, kind: NotebookCellKind, editor: LexicalEditor | null) => void
  onAddCell: (cellId: string, position: 'above' | 'below') => void
  onCellChange: (cellId: string, updater: (cell: NotebookCell) => NotebookCell) => void
  onMathFieldReady?: (field: MathFieldElementLike) => void
  onMoveCell: (sourceCellId: string, targetCellId: string) => void
  onRemoveCell: (cellId: string) => void
}

export function NotebookEditor({
  activeCellId,
  document,
  documentRevision,
  onActivateCell,
  onAddCell,
  onCellChange,
  onMathFieldReady,
  onMoveCell,
  onRemoveCell,
}: NotebookEditorProps) {
  const draggedCellId = useRef<string | null>(null)

  return (
    <div className="notebook-editor">
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

            if (!srcId || srcId === cell.id) {
              return
            }

            onMoveCell(srcId, cell.id)
          }}
          onPointerDownCapture={() => onActivateCell(cell.id, cell.kind, null)}
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
              onDragEnd={() => {
                draggedCellId.current = null
              }}
            >
              <FontAwesomeIcon icon={faGripVertical} />
            </button>
            <details className="cell-menu">
              <summary className="cell-icon-button" title="Add cell">
                <FontAwesomeIcon icon={faPlus} />
              </summary>
              <div className="cell-menu-panel">
                <button type="button" onClick={() => onAddCell(cell.id, 'above')}>
                  Add cell above
                </button>
                <button type="button" onClick={() => onAddCell(cell.id, 'below')}>
                  Add cell below
                </button>
              </div>
            </details>
            <button type="button" className="cell-icon-button danger-button" title="Delete cell" onClick={() => onRemoveCell(cell.id)}>
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
          <div className="cell-content">
            {cell.kind === 'math' ? (
              <MathCellEditor
                cell={cell}
                onActivate={() => onActivateCell(cell.id, 'math', null)}
                onChange={(nextCell) => {
                  onCellChange(cell.id, () => nextCell)
                  onActivateCell(cell.id, 'math', null)
                }}
                onFieldReady={onMathFieldReady}
              />
            ) : (
              <RichTextCellEditor
                cell={cell}
                documentRevision={documentRevision}
                onActivateEditor={(editor) => onActivateCell(cell.id, 'rich-text', editor)}
                onChange={(nextState) => {
                  onCellChange(cell.id, (currentCell) => {
                    if (currentCell.kind !== 'rich-text') {
                      return currentCell
                    }

                    return {
                      ...currentCell,
                      lexicalState: nextState,
                    }
                  })
                }}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
