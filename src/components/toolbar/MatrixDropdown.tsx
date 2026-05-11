import { useEffect, useRef, useState } from 'react'

interface MatrixDropdownProps {
  disabled: boolean
  onInsertSnippet: (snippet: string, mode: 'cmd' | 'write' | 'latex' | 'template') => void
}

interface MatrixDelimiterOption {
  id: string
  label: string
  preview: string
  left: string
  right: string
}

interface DelimiterSizeOption {
  id: string
  label: string
  leftCommand: string
  rightCommand: string
}

const MATRIX_DELIMITERS: MatrixDelimiterOption[] = [
  { id: 'none', label: 'None', preview: 'A', left: '', right: '' },
  { id: 'paren', label: 'Parentheses', preview: '( )', left: '(', right: ')' },
  { id: 'bracket', label: 'Brackets', preview: '[ ]', left: '[', right: ']' },
  { id: 'brace', label: 'Braces', preview: '{ }', left: '\\lbrace', right: '\\rbrace' },
  { id: 'angle', label: 'Angles', preview: '< >', left: '\\langle', right: '\\rangle' },
  { id: 'bar', label: 'Vertical bars', preview: '| |', left: '\\lvert', right: '\\rvert' },
  { id: 'double-bar', label: 'Double bars', preview: '|| ||', left: '\\lVert', right: '\\rVert' },
  { id: 'ceil', label: 'Ceiling', preview: '\u2308 \u2309', left: '\\lceil', right: '\\rceil' },
  { id: 'floor', label: 'Floor', preview: '\u230a \u230b', left: '\\lfloor', right: '\\rfloor' },
  { id: 'group', label: 'Groups', preview: '\u27ee \u27ef', left: '\\lgroup', right: '\\rgroup' },
  { id: 'moustache', label: 'Moustaches', preview: '\u23b0 \u23b1', left: '\\lmoustache', right: '\\rmoustache' },
  { id: 'upper-corner', label: 'Upper corners', preview: '\u231c \u231d', left: '\\ulcorner', right: '\\urcorner' },
  { id: 'lower-corner', label: 'Lower corners', preview: '\u231e \u231f', left: '\\llcorner', right: '\\lrcorner' },
  { id: 'llbracket', label: 'Double brackets', preview: '\u27e6 \u27e7', left: '\\llbracket', right: '\\rrbracket' },
  { id: 'arrow-up', label: 'Up arrows', preview: '\u2191 \u2191', left: '\\uparrow', right: '\\uparrow' },
  { id: 'arrow-down', label: 'Down arrows', preview: '\u2193 \u2193', left: '\\downarrow', right: '\\downarrow' },
  { id: 'arrow-both', label: 'Up-down arrows', preview: '\u2195 \u2195', left: '\\updownarrow', right: '\\updownarrow' },
  { id: 'double-arrow-up', label: 'Double up arrows', preview: '\u21d1 \u21d1', left: '\\Uparrow', right: '\\Uparrow' },
  { id: 'double-arrow-down', label: 'Double down arrows', preview: '\u21d3 \u21d3', left: '\\Downarrow', right: '\\Downarrow' },
  { id: 'double-arrow-both', label: 'Double up-down arrows', preview: '\u21d5 \u21d5', left: '\\Updownarrow', right: '\\Updownarrow' },
]

const DELIMITER_SIZES: DelimiterSizeOption[] = [
  { id: 'auto', label: 'Auto', leftCommand: '\\left', rightCommand: '\\right' },
  { id: 'small', label: 'Small', leftCommand: '\\bigl', rightCommand: '\\bigr' },
  { id: 'medium', label: 'Medium', leftCommand: '\\Bigl', rightCommand: '\\Bigr' },
  { id: 'large', label: 'Large', leftCommand: '\\biggl', rightCommand: '\\biggr' },
  { id: 'largest', label: 'Largest', leftCommand: '\\Biggl', rightCommand: '\\Biggr' },
]

function parsedDimension(value: number | string): number {
  return typeof value === 'string' ? parseInt(value, 10) : value
}

export function MatrixDropdown({ disabled, onInsertSnippet }: MatrixDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hoverRows, setHoverRows] = useState(0)
  const [hoverCols, setHoverCols] = useState(0)
  const [manualRows, setManualRows] = useState<number | string>(3)
  const [manualCols, setManualCols] = useState<number | string>(3)
  const [delimiterId, setDelimiterId] = useState(MATRIX_DELIMITERS[1].id)
  const [sizeId, setSizeId] = useState(DELIMITER_SIZES[0].id)

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const generateMatrixLatex = (rows: number, cols: number) => {
    const row = Array.from({ length: cols }, () => '#?').join(' & ')
    const body = Array.from({ length: rows }, () => row).join(' \\\\ ')
    const matrix = `\\begin{matrix} ${body} \\end{matrix}`
    const delimiter = MATRIX_DELIMITERS.find((option) => option.id === delimiterId) ?? MATRIX_DELIMITERS[1]
    if (!delimiter.left && !delimiter.right) return matrix

    const size = DELIMITER_SIZES.find((option) => option.id === sizeId) ?? DELIMITER_SIZES[0]
    return `${size.leftCommand}${delimiter.left}${matrix}${size.rightCommand}${delimiter.right}`
  }

  const handleInsert = (rows: number, cols: number) => {
    onInsertSnippet(generateMatrixLatex(rows, cols), 'template')
    setIsOpen(false)
  }

  const handleManualInsert = () => {
    const rows = parsedDimension(manualRows)
    const cols = parsedDimension(manualCols)
    if (!Number.isNaN(rows) && !Number.isNaN(cols) && rows > 0 && cols > 0) {
      handleInsert(rows, cols)
    }
  }

  return (
    <div className="toolbar-group toolbar-group-bordered matrix-dropdown-container" ref={dropdownRef}>
      <button
        type="button"
        className="symbol-btn"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsOpen(!isOpen)}
      >
        Matrix
      </button>

      {isOpen ? (
        <div className="matrix-dropdown-popover">
          <div className="matrix-dropdown-section">
            <span className="matrix-dropdown-label">Delimiters</span>
            <div className="matrix-delimiter-grid" role="radiogroup" aria-label="Matrix delimiters">
              {MATRIX_DELIMITERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`matrix-option-button${delimiterId === option.id ? ' matrix-option-button-active' : ''}`}
                  aria-label={option.label}
                  aria-pressed={delimiterId === option.id}
                  title={option.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setDelimiterId(option.id)}
                >
                  <span className="matrix-option-preview">{option.preview}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="matrix-dropdown-section">
            <span className="matrix-dropdown-label">Bracket size</span>
            <div className="matrix-size-row" role="radiogroup" aria-label="Matrix delimiter size">
              {DELIMITER_SIZES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`matrix-size-button${sizeId === option.id ? ' matrix-size-button-active' : ''}`}
                  aria-pressed={sizeId === option.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSizeId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="matrix-dropdown-divider" />

          <div
            className="matrix-grid"
            onMouseLeave={() => {
              setHoverRows(0)
              setHoverCols(0)
            }}
          >
            {Array.from({ length: 10 }).map((_, rowIndex) => (
              <div key={rowIndex} className="matrix-grid-row">
                {Array.from({ length: 10 }).map((_, colIndex) => {
                  const rows = rowIndex + 1
                  const cols = colIndex + 1
                  const isHovered = rows <= hoverRows && cols <= hoverCols
                  return (
                    <button
                      key={colIndex}
                      type="button"
                      className={`matrix-grid-cell${isHovered ? ' matrix-grid-cell-active' : ''}`}
                      aria-label={`Insert ${rows} by ${cols} matrix`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => {
                        setHoverRows(rows)
                        setHoverCols(cols)
                      }}
                      onClick={() => handleInsert(rows, cols)}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          <div className="matrix-hover-label">
            {hoverRows > 0 && hoverCols > 0 ? `${hoverRows} x ${hoverCols}` : 'Hover to select matrix size'}
          </div>

          <div className="matrix-dropdown-divider" />

          <div className="matrix-manual-row">
            <input
              type="number"
              min="1"
              value={manualRows}
              aria-label="Matrix rows"
              onChange={(event) => {
                const value = event.target.value
                setManualRows(value === '' ? '' : parseInt(value, 10) || '')
              }}
            />
            <span>x</span>
            <input
              type="number"
              min="1"
              value={manualCols}
              aria-label="Matrix columns"
              onChange={(event) => {
                const value = event.target.value
                setManualCols(value === '' ? '' : parseInt(value, 10) || '')
              }}
            />
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={handleManualInsert}>
              Insert
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
