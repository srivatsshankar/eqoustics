import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { $createHeadingNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFile,
  faFolderOpen,
  faFloppyDisk,
  faFileArrowDown,
  faFilePdf,
  faBold,
  faItalic,
  faUnderline,
  faCode,
  faListUl,
  faListOl,
  faParagraph,
} from '@fortawesome/free-solid-svg-icons'

import type { NotebookCellKind } from '../../shared/types/notebook'

interface EditorToolbarProps {
  activeEditor: LexicalEditor | null
  activeCellKind: NotebookCellKind | null
  activeMathDisplayMode: boolean
  canSave: boolean
  isDirty: boolean
  title: string
  onApplyMathFormat: (format: 'bold' | 'italic' | 'underline') => void
  onInsertSnippet: (snippet: string) => void
  onNewNotebook: () => void
  onOpenNotebook: () => void
  onExportPdf: () => void
  onSaveNotebook: () => void
  onSaveNotebookAs: () => void
  onToggleMathDisplay: () => void
  onTitleChange: (title: string) => void
}

interface SymbolItem {
  display: string
  value: string
  title: string
}

interface SymbolGroup {
  label: string
  items: SymbolItem[]
}

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    label: 'Structures',
    items: [
      { display: 'a/b', value: '\\frac{#@}{#0}', title: 'Fraction' },
      { display: '√', value: '\\sqrt{#@}', title: 'Square root' },
      { display: 'x²', value: '^{2}', title: 'Squared' },
      { display: 'xⁿ', value: '^{#0}', title: 'Power' },
      { display: 'xₙ', value: '_{#0}', title: 'Subscript' },
      { display: '∫', value: '\\int_{#0}^{#0}', title: 'Integral' },
      { display: '∑', value: '\\sum_{#0}^{#0}', title: 'Summation' },
      { display: '∏', value: '\\prod_{#0}^{#0}', title: 'Product' },
      { display: '|x|', value: '\\left|#@\\right|', title: 'Absolute value' },
      { display: '()', value: '\\left(#0\\right)', title: 'Parentheses' },
      { display: '[]', value: '\\left[#0\\right]', title: 'Brackets' },
      { display: 'lim', value: '\\lim_{#0}', title: 'Limit' },
    ],
  },
  {
    label: 'Relations',
    items: [
      { display: '≠', value: '\\ne ', title: 'Not equal' },
      { display: '≤', value: '\\le ', title: 'Less or equal' },
      { display: '≥', value: '\\ge ', title: 'Greater or equal' },
      { display: '≈', value: '\\approx ', title: 'Approximately' },
      { display: '∝', value: '\\propto ', title: 'Proportional to' },
      { display: '±', value: '\\pm ', title: 'Plus or minus' },
      { display: '×', value: '\\times ', title: 'Times' },
      { display: '÷', value: '\\div ', title: 'Divide' },
      { display: '·', value: '\\cdot ', title: 'Dot product' },
    ],
  },
  {
    label: 'Greek',
    items: [
      { display: 'α', value: '\\alpha ', title: 'Alpha' },
      { display: 'β', value: '\\beta ', title: 'Beta' },
      { display: 'γ', value: '\\gamma ', title: 'Gamma' },
      { display: 'δ', value: '\\delta ', title: 'Delta' },
      { display: 'ε', value: '\\epsilon ', title: 'Epsilon' },
      { display: 'ζ', value: '\\zeta ', title: 'Zeta' },
      { display: 'θ', value: '\\theta ', title: 'Theta' },
      { display: 'λ', value: '\\lambda ', title: 'Lambda' },
      { display: 'μ', value: '\\mu ', title: 'Mu' },
      { display: 'ξ', value: '\\xi ', title: 'Xi' },
      { display: 'π', value: '\\pi ', title: 'Pi' },
      { display: 'ρ', value: '\\rho ', title: 'Rho' },
      { display: 'σ', value: '\\sigma ', title: 'Sigma' },
      { display: 'τ', value: '\\tau ', title: 'Tau' },
      { display: 'φ', value: '\\phi ', title: 'Phi' },
      { display: 'χ', value: '\\chi ', title: 'Chi' },
      { display: 'ψ', value: '\\psi ', title: 'Psi' },
      { display: 'ω', value: '\\omega ', title: 'Omega' },
      { display: 'Γ', value: '\\Gamma ', title: 'Gamma (upper)' },
      { display: 'Δ', value: '\\Delta ', title: 'Delta (upper)' },
      { display: 'Θ', value: '\\Theta ', title: 'Theta (upper)' },
      { display: 'Λ', value: '\\Lambda ', title: 'Lambda (upper)' },
      { display: 'Π', value: '\\Pi ', title: 'Pi (upper)' },
      { display: 'Σ', value: '\\Sigma ', title: 'Sigma (upper)' },
      { display: 'Φ', value: '\\Phi ', title: 'Phi (upper)' },
      { display: 'Ψ', value: '\\Psi ', title: 'Psi (upper)' },
      { display: 'Ω', value: '\\Omega ', title: 'Omega (upper)' },
    ],
  },
  {
    label: 'Calculus & Analysis',
    items: [
      { display: '∂', value: '\\partial ', title: 'Partial derivative' },
      { display: '∇', value: '\\nabla ', title: 'Nabla / Del' },
      { display: '∞', value: '\\infty ', title: 'Infinity' },
      { display: '∮', value: '\\oint ', title: 'Contour integral' },
      { display: '∬', value: '\\iint ', title: 'Double integral' },
      { display: '∭', value: '\\iiint ', title: 'Triple integral' },
    ],
  },
  {
    label: 'Sets & Logic',
    items: [
      { display: '∈', value: '\\in ', title: 'Element of' },
      { display: '∉', value: '\\notin ', title: 'Not element of' },
      { display: '∅', value: '\\emptyset ', title: 'Empty set' },
      { display: '⊂', value: '\\subset ', title: 'Subset' },
      { display: '⊆', value: '\\subseteq ', title: 'Subset or equal' },
      { display: '⊃', value: '\\supset ', title: 'Superset' },
      { display: '∪', value: '\\cup ', title: 'Union' },
      { display: '∩', value: '\\cap ', title: 'Intersection' },
      { display: '∀', value: '\\forall ', title: 'For all' },
      { display: '∃', value: '\\exists ', title: 'There exists' },
      { display: '¬', value: '\\neg ', title: 'Logical not' },
      { display: '∧', value: '\\wedge ', title: 'Logical and' },
      { display: '∨', value: '\\vee ', title: 'Logical or' },
    ],
  },
  {
    label: 'Arrows',
    items: [
      { display: '→', value: '\\rightarrow ', title: 'Right arrow' },
      { display: '←', value: '\\leftarrow ', title: 'Left arrow' },
      { display: '↔', value: '\\leftrightarrow ', title: 'Both arrows' },
      { display: '⇒', value: '\\Rightarrow ', title: 'Implies' },
      { display: '⇐', value: '\\Leftarrow ', title: 'Implied by' },
      { display: '⇔', value: '\\Leftrightarrow ', title: 'If and only if' },
      { display: '↦', value: '\\mapsto ', title: 'Maps to' },
      { display: '↑', value: '\\uparrow ', title: 'Up arrow' },
      { display: '↓', value: '\\downarrow ', title: 'Down arrow' },
    ],
  },
  {
    label: 'Functions',
    items: [
      { display: 'sin', value: '\\sin ', title: 'Sine' },
      { display: 'cos', value: '\\cos ', title: 'Cosine' },
      { display: 'tan', value: '\\tan ', title: 'Tangent' },
      { display: 'arcsin', value: '\\arcsin ', title: 'Arcsine' },
      { display: 'arccos', value: '\\arccos ', title: 'Arccosine' },
      { display: 'arctan', value: '\\arctan ', title: 'Arctangent' },
      { display: 'ln', value: '\\ln ', title: 'Natural log' },
      { display: 'log', value: '\\log ', title: 'Logarithm' },
      { display: 'exp', value: '\\exp ', title: 'Exponential' },
      { display: 'max', value: '\\max ', title: 'Maximum' },
      { display: 'min', value: '\\min ', title: 'Minimum' },
      { display: 'det', value: '\\det ', title: 'Determinant' },
      { display: 'dim', value: '\\dim ', title: 'Dimension' },
    ],
  },
]

function setBlockType(editor: LexicalEditor, blockType: 'paragraph' | 'h1' | 'h2') {
  editor.update(() => {
    const selection = $getSelection()

    if (!$isRangeSelection(selection)) {
      return
    }

    $setBlocksType(selection, () => {
      if (blockType === 'paragraph') {
        return $createParagraphNode()
      }

      return $createHeadingNode(blockType)
    })
  })
}

function dispatchFormat(editor: LexicalEditor | null, format: 'bold' | 'italic' | 'underline' | 'code') {
  if (!editor) {
    return
  }

  editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
}

export function EditorToolbar({
  activeEditor,
  activeCellKind,
  activeMathDisplayMode,
  canSave,
  isDirty,
  title,
  onApplyMathFormat,
  onInsertSnippet,
  onExportPdf,
  onNewNotebook,
  onOpenNotebook,
  onSaveNotebook,
  onSaveNotebookAs,
  onToggleMathDisplay,
  onTitleChange,
}: EditorToolbarProps) {
  const isMath = activeCellKind === 'math'
  const isRichText = activeCellKind === 'rich-text'
  const hasActiveCell = isMath || isRichText

  const handleFormat = (format: 'bold' | 'italic' | 'underline' | 'code') => {
    if (isMath && format !== 'code') {
      onApplyMathFormat(format as 'bold' | 'italic' | 'underline')
    } else {
      dispatchFormat(activeEditor, format)
    }
  }

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
        <div className="toolbar-symbols-scroll">
          {/* Text formatting */}
          <div className="toolbar-group toolbar-group-bordered">
            <button
              type="button"
              title="Bold"
              disabled={!hasActiveCell}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFormat('bold')}
            >
              <FontAwesomeIcon icon={faBold} />
            </button>
            <button
              type="button"
              title="Italic"
              disabled={!hasActiveCell}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFormat('italic')}
            >
              <FontAwesomeIcon icon={faItalic} />
            </button>
            <button
              type="button"
              title="Underline"
              disabled={!hasActiveCell}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFormat('underline')}
            >
              <FontAwesomeIcon icon={faUnderline} />
            </button>
            <button
              type="button"
              title="Code"
              disabled={!isRichText}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFormat('code')}
            >
              <FontAwesomeIcon icon={faCode} />
            </button>
            <button
              type="button"
              title="Bullet list"
              disabled={!isRichText}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activeEditor?.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
            >
              <FontAwesomeIcon icon={faListUl} />
            </button>
            <button
              type="button"
              title="Numbered list"
              disabled={!isRichText}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activeEditor?.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
            >
              <FontAwesomeIcon icon={faListOl} />
            </button>
            <button
              type="button"
              title="Paragraph"
              disabled={!isRichText}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activeEditor && setBlockType(activeEditor, 'paragraph')}
            >
              <FontAwesomeIcon icon={faParagraph} />
            </button>
            <button
              type="button"
              title="Heading 1"
              disabled={!isRichText}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activeEditor && setBlockType(activeEditor, 'h1')}
            >
              H1
            </button>
            <button
              type="button"
              title="Heading 2"
              disabled={!isRichText}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activeEditor && setBlockType(activeEditor, 'h2')}
            >
              H2
            </button>
            <button
              type="button"
              title={activeMathDisplayMode ? 'Switch to inline math' : 'Switch to display math'}
              disabled={!isMath}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onToggleMathDisplay}
              className="display-toggle-btn"
            >
              {activeMathDisplayMode ? '⊡ Block' : '⊟ Inline'}
            </button>
          </div>

          {/* Symbol groups */}
          {SYMBOL_GROUPS.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <span className="toolbar-group-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  title={item.title}
                  disabled={!isMath}
                  className="symbol-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onInsertSnippet(item.value)}
                >
                  {item.display}
                </button>
              ))}
            </div>
          ))}
        </div>
        {!hasActiveCell ? <p className="toolbar-hint">Select a cell to reveal formatting and symbol tools.</p> : null}
      </div>
    </header>
  )
}
