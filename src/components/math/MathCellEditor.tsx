import 'mathlive'

import { useEffect, useRef } from 'react'

import type { MathNotebookCell } from '../../shared/types/notebook'

export type MathFieldElementLike = HTMLElement & {
  value: string
  insert: (value: string, options?: Record<string, unknown>) => void
  focus: () => void
  mathVirtualKeyboardPolicy?: string
}

interface MathCellEditorProps {
  cell: MathNotebookCell
  onActivate: () => void
  onChange: (next: MathNotebookCell) => void
  onFieldReady?: (field: MathFieldElementLike) => void
}

export function MathCellEditor({ cell, onActivate, onChange, onFieldReady }: MathCellEditorProps) {
  const fieldRef = useRef<MathFieldElementLike | null>(null)

  useEffect(() => {
    const field = fieldRef.current

    if (!field) {
      return undefined
    }

    field.mathVirtualKeyboardPolicy = 'manual'

    const handleFocus = () => {
      onFieldReady?.(field)
    }

    field.addEventListener('focusin', handleFocus)

    return () => {
      field.removeEventListener('focusin', handleFocus)
    }
  }, [onFieldReady])

  return (
    <div className="math-cell-editor" onPointerDown={onActivate}>
      <math-field
        className="math-field"
        ref={(element) => {
          fieldRef.current = element as MathFieldElementLike | null
        }}
        onFocus={onActivate}
        onInput={(event) => {
          const target = event.target as MathFieldElementLike
          onChange({
            ...cell,
            latex: target.value,
          })
        }}
      >
        {cell.latex}
      </math-field>
    </div>
  )
}