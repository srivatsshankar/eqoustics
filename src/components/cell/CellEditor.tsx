import { useCallback, useEffect, useRef } from 'react'

import { EditableMathField, type MathField, type MathQuillConfig } from './MathQuillWrapper'
import type { NotebookCell } from '../../shared/types/notebook'

/** Handle exposed to the parent so the toolbar can insert into the active cell. */
export interface CellInsertHandle {
  /**
   * Insert a LaTeX snippet into the active MathQuill field.
   *
   * - `mode:'cmd'`  → structural commands like `\frac`, `\sqrt`.
   *   MathQuill creates the visual structure and places the cursor
   *   inside the first empty slot automatically.
   * - `mode:'write'` (default) → symbols, text, or literal LaTeX.
   */
  insert: (snippet: string, mode?: 'cmd' | 'write') => void
  focus: () => void
}

interface CellEditorProps {
  cell: NotebookCell
  isActive: boolean
  onActivate: () => void
  onChange: (cell: NotebookCell) => void
  onInsertHandle: (handle: CellInsertHandle) => void
  onAddCellBelow: () => void
  /** Called when the user presses Backspace on an empty cell. */
  onDeleteCell: () => void
  /** Called when the user presses ArrowUp at the top edge. */
  onFocusPrevious: () => void
  /** Called when the user presses ArrowDown at the bottom edge. */
  onFocusNext: () => void
}

export function CellEditor({
  cell,
  isActive,
  onActivate,
  onChange,
  onInsertHandle,
  onAddCellBelow,
  onDeleteCell,
  onFocusPrevious,
  onFocusNext,
}: CellEditorProps) {
  const mathFieldRef = useRef<MathField | null>(null)

  // Expose insert handle whenever the MathField reference changes
  const syncHandle = useCallback(() => {
    const mf = mathFieldRef.current
    if (!mf) return

    const handle: CellInsertHandle = {
      insert: (snippet: string, mode: 'cmd' | 'write' = 'write') => {
        mf.focus()
        if (mode === 'cmd') {
          mf.cmd(snippet)
        } else {
          mf.write(snippet)
        }
      },
      focus: () => mf.focus(),
    }
    onInsertHandle(handle)
  }, [onInsertHandle])

  // Focus the MathQuill field when this cell becomes active
  useEffect(() => {
    if (isActive && mathFieldRef.current) {
      mathFieldRef.current.focus()
      syncHandle()
    }
  }, [isActive, syncHandle])

  const mqConfig: MathQuillConfig = {
    spaceBehavesLikeTab: true,
    leftRightIntoCmdGoes: 'up',
    restrictMismatchedBrackets: true,
    sumStartsWithNEquals: true,
    supSubsRequireOperand: true,
    autoCommands: 'pi theta alpha beta gamma delta sigma omega lambda mu epsilon phi psi rho tau chi zeta xi sqrt int sum prod',
    autoOperatorNames: 'sin cos tan arcsin arccos arctan log ln exp lim max min det dim gcd deg',
    handlers: {
      enter: () => {
        onAddCellBelow()
      },
      moveOutOf: (direction) => {
        if (direction === 1) {
          onFocusPrevious()
        } else {
          onFocusNext()
        }
      },
      deleteOutOf: (direction) => {
        if (direction === -1 || direction === 1) {
          onDeleteCell()
        }
      },
      upOutOf: () => {
        onFocusPrevious()
      },
      downOutOf: () => {
        onFocusNext()
      },
    },
  }

  return (
    <div
      className={`cell-editor${isActive ? ' cell-editor-active' : ''}`}
      onPointerDown={onActivate}
    >
      <EditableMathField
        latex={cell.latex}
        config={mqConfig}
        onChange={(mf) => {
          onChange({ ...cell, latex: mf.latex() })
        }}
        onMount={(mf) => {
          mathFieldRef.current = mf
          syncHandle()
        }}
        onFocus={onActivate}
      />
    </div>
  )
}
