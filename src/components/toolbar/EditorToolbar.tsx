import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faFile,
  faFolderOpen,
  faFloppyDisk,
  faFileArrowDown,
  faFilePdf,
  faFont,
  faSquareRootVariable,
  faSuperscript,
  faSubscript,
} from '@fortawesome/free-solid-svg-icons'
import { MatrixDropdown } from './MatrixDropdown'

interface EditorToolbarProps {
  hasActiveCell: boolean
  canSave: boolean
  isDirty: boolean
  title: string
  onInsertSnippet: (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template') => void
  onNewNotebook: () => void
  onOpenNotebook: () => void
  onExportPdf: () => void
  onSaveNotebook: () => void
  onSaveNotebookAs: () => void
  onTitleChange: (title: string) => void
}

interface SymbolItem {
  display: string
  /** The LaTeX string to insert */
  value: string
  title: string
  /**
   * 'cmd'  → structural command (e.g. \frac creates a fraction with empty slots).
   * 'write' → literal LaTeX symbols, operators, etc.
   */
  mode: 'cmd' | 'write'
}

interface SymbolGroup {
  label: string
  items: SymbolItem[]
}

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    label: 'Structures',
    items: [
      { display: 'a/b', value: '\\frac', title: 'Fraction — creates a fraction with empty numerator and denominator', mode: 'cmd' },
      { display: '√', value: '\\sqrt', title: 'Square root — type inside the radical', mode: 'cmd' },
      { display: 'x²', value: '^2', title: 'Squared', mode: 'write' },
      { display: 'xⁿ', value: '^', title: 'Power / Exponent — type the exponent', mode: 'cmd' },
      { display: 'xₙ', value: '_', title: 'Subscript — type the subscript', mode: 'cmd' },
      { display: '∫', value: '\\int', title: 'Integral', mode: 'cmd' },
      { display: '∑', value: '\\sum', title: 'Summation', mode: 'cmd' },
      { display: '∏', value: '\\prod', title: 'Product', mode: 'cmd' },
      { display: '|x|', value: '\\left|\\right|', title: 'Absolute value', mode: 'write' },
      { display: '()', value: '\\left(\\right)', title: 'Parentheses', mode: 'write' },
      { display: '[]', value: '\\left[\\right]', title: 'Brackets', mode: 'write' },
      { display: 'lim', value: '\\lim', title: 'Limit', mode: 'cmd' },
      { display: '{ }', value: '\\lbrace\\rbrace', title: 'Curly braces', mode: 'write' },
    ],
  },
  {
    label: 'Text',
    items: [
      { display: 'Abc', value: '\\text', title: 'Plain text — type regular words', mode: 'cmd' },
    ],
  },
  {
    label: 'Relations',
    items: [
      { display: '=', value: '=', title: 'Equals', mode: 'write' },
      { display: '≠', value: '\\ne', title: 'Not equal', mode: 'cmd' },
      { display: '≤', value: '\\le', title: 'Less or equal', mode: 'cmd' },
      { display: '≥', value: '\\ge', title: 'Greater or equal', mode: 'cmd' },
      { display: '≈', value: '\\approx', title: 'Approximately', mode: 'cmd' },
      { display: '∝', value: '\\propto', title: 'Proportional to', mode: 'cmd' },
      { display: '±', value: '\\pm', title: 'Plus or minus', mode: 'cmd' },
      { display: '×', value: '\\times', title: 'Times', mode: 'cmd' },
      { display: '÷', value: '\\div', title: 'Divide', mode: 'cmd' },
      { display: '·', value: '\\cdot', title: 'Dot product', mode: 'cmd' },
    ],
  },
  {
    label: 'Greek',
    items: [
      { display: 'α', value: '\\alpha', title: 'Alpha', mode: 'cmd' },
      { display: 'β', value: '\\beta', title: 'Beta', mode: 'cmd' },
      { display: 'γ', value: '\\gamma', title: 'Gamma', mode: 'cmd' },
      { display: 'δ', value: '\\delta', title: 'Delta', mode: 'cmd' },
      { display: 'ε', value: '\\epsilon', title: 'Epsilon', mode: 'cmd' },
      { display: 'ζ', value: '\\zeta', title: 'Zeta', mode: 'cmd' },
      { display: 'θ', value: '\\theta', title: 'Theta', mode: 'cmd' },
      { display: 'λ', value: '\\lambda', title: 'Lambda', mode: 'cmd' },
      { display: 'μ', value: '\\mu', title: 'Mu', mode: 'cmd' },
      { display: 'ξ', value: '\\xi', title: 'Xi', mode: 'cmd' },
      { display: 'π', value: '\\pi', title: 'Pi', mode: 'cmd' },
      { display: 'ρ', value: '\\rho', title: 'Rho', mode: 'cmd' },
      { display: 'σ', value: '\\sigma', title: 'Sigma', mode: 'cmd' },
      { display: 'τ', value: '\\tau', title: 'Tau', mode: 'cmd' },
      { display: 'φ', value: '\\phi', title: 'Phi', mode: 'cmd' },
      { display: 'χ', value: '\\chi', title: 'Chi', mode: 'cmd' },
      { display: 'ψ', value: '\\psi', title: 'Psi', mode: 'cmd' },
      { display: 'ω', value: '\\omega', title: 'Omega', mode: 'cmd' },
      { display: 'Γ', value: '\\Gamma', title: 'Gamma (upper)', mode: 'cmd' },
      { display: 'Δ', value: '\\Delta', title: 'Delta (upper)', mode: 'cmd' },
      { display: 'Θ', value: '\\Theta', title: 'Theta (upper)', mode: 'cmd' },
      { display: 'Λ', value: '\\Lambda', title: 'Lambda (upper)', mode: 'cmd' },
      { display: 'Π', value: '\\Pi', title: 'Pi (upper)', mode: 'cmd' },
      { display: 'Σ', value: '\\Sigma', title: 'Sigma (upper)', mode: 'cmd' },
      { display: 'Φ', value: '\\Phi', title: 'Phi (upper)', mode: 'cmd' },
      { display: 'Ψ', value: '\\Psi', title: 'Psi (upper)', mode: 'cmd' },
      { display: 'Ω', value: '\\Omega', title: 'Omega (upper)', mode: 'cmd' },
    ],
  },
  {
    label: 'Calculus',
    items: [
      { display: '∂', value: '\\partial', title: 'Partial derivative', mode: 'cmd' },
      { display: '∇', value: '\\nabla', title: 'Nabla / Del', mode: 'cmd' },
      { display: '∞', value: '\\infty', title: 'Infinity', mode: 'cmd' },
      { display: 'dy/dx', value: '\\frac{dy}{dx}', title: 'Derivative', mode: 'write' },
      { display: '∫ₐᵇ', value: '\\int_{ }^{ }', title: 'Definite integral — type the bounds', mode: 'write' },
    ],
  },
  {
    label: 'Sets & Logic',
    items: [
      { display: '∈', value: '\\in', title: 'Element of', mode: 'cmd' },
      { display: '∉', value: '\\notin', title: 'Not element of', mode: 'cmd' },
      { display: '∅', value: '\\emptyset', title: 'Empty set', mode: 'cmd' },
      { display: '⊂', value: '\\subset', title: 'Subset', mode: 'cmd' },
      { display: '⊆', value: '\\subseteq', title: 'Subset or equal', mode: 'cmd' },
      { display: '⊃', value: '\\supset', title: 'Superset', mode: 'cmd' },
      { display: '∪', value: '\\cup', title: 'Union', mode: 'cmd' },
      { display: '∩', value: '\\cap', title: 'Intersection', mode: 'cmd' },
      { display: '∀', value: '\\forall', title: 'For all', mode: 'cmd' },
      { display: '∃', value: '\\exists', title: 'There exists', mode: 'cmd' },
      { display: '¬', value: '\\neg', title: 'Logical not', mode: 'cmd' },
      { display: '∧', value: '\\wedge', title: 'Logical and', mode: 'cmd' },
      { display: '∨', value: '\\vee', title: 'Logical or', mode: 'cmd' },
    ],
  },
  {
    label: 'Arrows',
    items: [
      { display: '→', value: '\\rightarrow', title: 'Right arrow', mode: 'cmd' },
      { display: '←', value: '\\leftarrow', title: 'Left arrow', mode: 'cmd' },
      { display: '↔', value: '\\leftrightarrow', title: 'Both arrows', mode: 'cmd' },
      { display: '⇒', value: '\\Rightarrow', title: 'Implies', mode: 'cmd' },
      { display: '⇐', value: '\\Leftarrow', title: 'Implied by', mode: 'cmd' },
      { display: '⇔', value: '\\Leftrightarrow', title: 'If and only if', mode: 'cmd' },
      { display: '↦', value: '\\mapsto', title: 'Maps to', mode: 'cmd' },
    ],
  },
  {
    label: 'Functions',
    items: [
      { display: 'sin', value: '\\sin', title: 'Sine', mode: 'cmd' },
      { display: 'cos', value: '\\cos', title: 'Cosine', mode: 'cmd' },
      { display: 'tan', value: '\\tan', title: 'Tangent', mode: 'cmd' },
      { display: 'log', value: '\\log', title: 'Logarithm', mode: 'cmd' },
      { display: 'ln', value: '\\ln', title: 'Natural log', mode: 'cmd' },
      { display: 'exp', value: '\\exp', title: 'Exponential', mode: 'cmd' },
      { display: 'max', value: '\\max', title: 'Maximum', mode: 'cmd' },
      { display: 'min', value: '\\min', title: 'Minimum', mode: 'cmd' },
    ],
  },
]

const DROPDOWN_GROUP_LABELS = ['Greek', 'Relations', 'Sets & Logic', 'Arrows']
const DROPDOWN_GROUP_LABEL_SET = new Set(DROPDOWN_GROUP_LABELS)

function SymbolDropdown({
  disabled,
  group,
  onInsertSnippet,
}: {
  disabled: boolean
  group: SymbolGroup
  onInsertSnippet: (snippet: string, mode: 'cmd' | 'write') => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuWidth = Math.min(288, window.innerWidth - 32)
    setMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - menuWidth - 16)),
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, updateMenuPosition])

  return (
    <div className="toolbar-symbol-dropdown" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        className="symbol-btn symbol-dropdown-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updateMenuPosition()
          setIsOpen((current) => !current)
        }}
      >
        <span>{group.label}</span>
        <FontAwesomeIcon icon={faChevronDown} />
      </button>
      {isOpen ? (
        <div className="symbol-dropdown-menu" role="menu" style={menuPosition}>
          {group.items.map((item) => (
            <button
              key={item.title}
              type="button"
              title={item.title}
              className="symbol-btn symbol-dropdown-item"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onInsertSnippet(item.value, item.mode)
                setIsOpen(false)
              }}
            >
              {item.display}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function EditorToolbar({
  hasActiveCell,
  canSave,
  isDirty,
  title,
  onInsertSnippet,
  onExportPdf,
  onNewNotebook,
  onOpenNotebook,
  onSaveNotebook,
  onSaveNotebookAs,
  onTitleChange,
}: EditorToolbarProps) {
  const inlineSymbolGroups = SYMBOL_GROUPS.filter((group) => !DROPDOWN_GROUP_LABEL_SET.has(group.label))
  const dropdownSymbolGroups = DROPDOWN_GROUP_LABELS
    .map((label) => SYMBOL_GROUPS.find((group) => group.label === label))
    .filter((group): group is SymbolGroup => Boolean(group))

  return (
    <header className="editor-toolbar">
      <div className="toolbar-row toolbar-row-primary">
        <div className="toolbar-group title-group">
          <div className="title-input-row">
            <input id="notebook-title" className="title-input" value={title} onChange={(event) => onTitleChange(event.target.value)} />
            <span className={`dirty-indicator${isDirty ? ' dirty-indicator-active' : ''}`}>{isDirty ? 'Unsaved changes' : 'Saved'}</span>
            <div className="title-icon-actions" aria-label="File actions">
              <button type="button" className="icon-button" title="New Notebook" onClick={onNewNotebook}>
                <FontAwesomeIcon icon={faFile} />
              </button>
              <button type="button" className="icon-button" title="Open File" onClick={onOpenNotebook}>
                <FontAwesomeIcon icon={faFolderOpen} />
              </button>
              <button type="button" className="icon-button" title="Save" disabled={!canSave} onClick={onSaveNotebook}>
                <FontAwesomeIcon icon={faFloppyDisk} />
              </button>
              <button type="button" className="icon-button" title="Save As..." disabled={!canSave} onClick={onSaveNotebookAs}>
                <FontAwesomeIcon icon={faFileArrowDown} />
              </button>
              <button type="button" className="icon-button" title="Export as PDF" disabled={!canSave} onClick={onExportPdf}>
                <FontAwesomeIcon icon={faFilePdf} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="toolbar-row toolbar-row-contextual">
        <div className="toolbar-symbols-wrap">
          {/* Quick-access structure buttons */}
          <div className="toolbar-group toolbar-group-bordered">
            <span className="toolbar-group-label">Insert</span>
            <button
              type="button"
              title="Plain text — type regular words inside math"
              disabled={!hasActiveCell}
              className="symbol-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSnippet('\\text', 'cmd')}
            >
              <FontAwesomeIcon icon={faFont} /> Abc
            </button>
            <button
              type="button"
              title="Fraction — creates numerator/denominator slots"
              disabled={!hasActiveCell}
              className="symbol-btn symbol-btn-featured"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSnippet('\\frac', 'cmd')}
            >
              a/b
            </button>
            <button
              type="button"
              title="Square root — type inside the radical"
              disabled={!hasActiveCell}
              className="symbol-btn symbol-btn-featured"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSnippet('\\sqrt', 'cmd')}
            >
              <FontAwesomeIcon icon={faSquareRootVariable} />
            </button>
            <button
              type="button"
              title="Superscript / Power — type the exponent"
              disabled={!hasActiveCell}
              className="symbol-btn symbol-btn-featured"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSnippet('^', 'cmd')}
            >
              <FontAwesomeIcon icon={faSuperscript} />
            </button>
            <button
              type="button"
              title="Subscript — type the subscript"
              disabled={!hasActiveCell}
              className="symbol-btn symbol-btn-featured"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsertSnippet('_', 'cmd')}
            >
              <FontAwesomeIcon icon={faSubscript} />
            </button>
          </div>

          {/* Symbol groups */}
          {inlineSymbolGroups.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <span className="toolbar-group-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  title={item.title}
                  disabled={!hasActiveCell}
                  className="symbol-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onInsertSnippet(item.value, item.mode)}
                >
                  {item.display}
                </button>
              ))}
            </div>
          ))}

          <MatrixDropdown disabled={!hasActiveCell} onInsertSnippet={onInsertSnippet} />

          {dropdownSymbolGroups.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <SymbolDropdown disabled={!hasActiveCell} group={group} onInsertSnippet={onInsertSnippet} />
            </div>
          ))}
        </div>
        {!hasActiveCell ? <p className="toolbar-hint">Click a cell to start editing. Use the buttons above to insert math symbols and structures.</p> : null}
      </div>
    </header>
  )
}
