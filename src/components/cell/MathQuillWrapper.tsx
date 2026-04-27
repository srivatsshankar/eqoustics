/**
 * Lightweight React wrapper around MathQuill.
 *
 * Instead of the broken `react-mathquill` package (which uses eval() that
 * Electron blocks), we load jQuery + MathQuill ourselves and create a thin
 * React component on top.
 */

import { useEffect, useRef } from 'react'

import './jquery-global'
import 'mathquill/build/mathquill.css'
import 'mathquill/build/mathquill.js'

/** MathQuill's MathField API surface we use */
export interface MathField {
  latex(): string
  latex(value: string): void
  cmd(latexCmd: string): void
  write(latex: string): void
  focus(): void
  blur(): void
  reflow(): void
  el(): HTMLElement
  keystroke(keys: string): void
  typedText(text: string): void
  select(): void
  clearSelection(): void
  moveToLeftEnd(): void
  moveToRightEnd(): void
}

export interface MathQuillConfig {
  spaceBehavesLikeTab?: boolean
  leftRightIntoCmdGoes?: 'up' | 'down'
  restrictMismatchedBrackets?: boolean
  sumStartsWithNEquals?: boolean
  supSubsRequireOperand?: boolean
  autoCommands?: string
  autoOperatorNames?: string
  handlers?: {
    edit?: (mf: MathField) => void
    enter?: (mf: MathField) => void
    moveOutOf?: (dir: number, mf: MathField) => void
    deleteOutOf?: (dir: number, mf: MathField) => void
    upOutOf?: (mf: MathField) => void
    downOutOf?: (mf: MathField) => void
    selectOutOf?: (dir: number, mf: MathField) => void
  }
}

// Grab the MathQuill API from the global that mathquill.js sets up.
// MathQuill attaches to `jQuery.fn.mathquill` or `window.MathQuill`.
function getMathQuillAPI(): {
  MathField: (el: HTMLElement, config?: MathQuillConfig) => MathField
  StaticMath: (el: HTMLElement) => unknown
} | null {
  const win = window as unknown as Record<string, unknown>
  const MQ = (win.MathQuill as { getInterface?: (version: number) => unknown })?.getInterface?.(2) as {
    MathField: (el: HTMLElement, config?: MathQuillConfig) => MathField
    StaticMath: (el: HTMLElement) => unknown
  } | undefined

  return MQ ?? null
}

export interface EditableMathFieldProps {
  latex?: string
  config?: MathQuillConfig
  className?: string
  onChange?: (mf: MathField) => void
  onMount?: (mf: MathField) => void
  onFocus?: () => void
}

export function EditableMathField({
  latex,
  config,
  className,
  onChange,
  onMount,
  onFocus,
}: EditableMathFieldProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const mathFieldRef = useRef<MathField | null>(null)
  const onChangeRef = useRef(onChange)
  const onMountRef = useRef(onMount)
  const lastLatexRef = useRef(latex)
  const configRef = useRef(config)

  // Keep callback refs fresh
  onChangeRef.current = onChange
  onMountRef.current = onMount
  configRef.current = config

  // Initialize MathQuill on mount
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const MQ = getMathQuillAPI()
    if (!MQ) {
      console.error('MathQuill API not found. Ensure mathquill.js is loaded.')
      return
    }

    const mergedConfig: MathQuillConfig = {
      ...config,
      handlers: {
        ...config?.handlers,
        edit: (mf: MathField) => {
          lastLatexRef.current = mf.latex()
          onChangeRef.current?.(mf)
          configRef.current?.handlers?.edit?.(mf)
        },
        enter: (mf: MathField) => {
          configRef.current?.handlers?.enter?.(mf)
        },
        upOutOf: (mf: MathField) => {
          configRef.current?.handlers?.upOutOf?.(mf)
        },
        downOutOf: (mf: MathField) => {
          configRef.current?.handlers?.downOutOf?.(mf)
        },
        moveOutOf: (dir: number, mf: MathField) => {
          configRef.current?.handlers?.moveOutOf?.(dir, mf)
        },
        deleteOutOf: (dir: number, mf: MathField) => {
          configRef.current?.handlers?.deleteOutOf?.(dir, mf)
        },
        selectOutOf: (dir: number, mf: MathField) => {
          configRef.current?.handlers?.selectOutOf?.(dir, mf)
        },
      },
    }

    const mf = MQ.MathField(el, mergedConfig)
    mathFieldRef.current = mf

    // Set initial latex
    if (latex) {
      mf.latex(latex)
    }

    onMountRef.current?.(mf)

    // Cleanup: remove MathQuill's DOM modifications
    return () => {
      mathFieldRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Sync latex from parent (if changed externally)
  useEffect(() => {
    const mf = mathFieldRef.current
    if (!mf) return
    if (latex !== undefined && latex !== lastLatexRef.current && mf.latex() !== latex) {
      mf.latex(latex)
      lastLatexRef.current = latex
    }
  }, [latex])

  return (
    <span
      ref={containerRef}
      className={className}
      onFocus={onFocus}
    />
  )
}
