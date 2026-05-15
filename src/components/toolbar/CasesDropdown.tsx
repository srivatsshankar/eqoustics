import { useEffect, useRef, useState } from 'react'

interface CasesDropdownProps {
  disabled: boolean
  onInsertSnippet: (snippet: string, mode: 'template') => void
}

const CASE_ENVIRONMENTS = [
  { id: 'cases', label: 'cases', env: 'cases', preview: '{', description: 'Left-braced cases' },
  { id: 'rcases', label: 'rcases', env: 'rcases', preview: '}', description: 'Right-braced cases' },
]

function parsedRows(value: number | string): number {
  return typeof value === 'string' ? parseInt(value, 10) : value
}

function casesLatex(env: string, rows: number): string {
  const body = Array.from({ length: rows }, () => '#? & \\text{if } #?').join(' \\\\ ')
  return `\\begin{${env}} ${body} \\end{${env}}`
}

export function CasesDropdown({ disabled, onInsertSnippet }: CasesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [environmentId, setEnvironmentId] = useState(CASE_ENVIRONMENTS[0].id)
  const [manualRows, setManualRows] = useState<number | string>(2)
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

  const insertRows = (rows: number) => {
    const environment = CASE_ENVIRONMENTS.find((option) => option.id === environmentId) ?? CASE_ENVIRONMENTS[0]
    onInsertSnippet(casesLatex(environment.env, rows), 'template')
    setIsOpen(false)
  }

  const handleManualInsert = () => {
    const rows = parsedRows(manualRows)
    if (!Number.isNaN(rows) && rows > 0) {
      insertRows(rows)
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
        Cases
      </button>

      {isOpen ? (
        <div className="matrix-dropdown-popover cases-dropdown-popover">
          <div className="matrix-dropdown-section">
            <span className="matrix-dropdown-label">Environment</span>
            <div className="matrix-env-row" role="radiogroup" aria-label="Cases environments">
              {CASE_ENVIRONMENTS.map((option) => (
                <span key={option.id} className="cell-button-tooltip-wrap">
                  <button
                    type="button"
                    className={`matrix-env-button${environmentId === option.id ? ' matrix-env-button-active' : ''}`}
                    aria-label={`${option.label}: ${option.description}`}
                    aria-pressed={environmentId === option.id}
                    title={`${option.label}: ${option.description}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setEnvironmentId(option.id)}
                  >
                    <span className="matrix-env-button-icon cases-env-button-icon">{option.preview}</span>
                    <span className="matrix-env-button-label">{option.label}</span>
                  </button>
                  <span className="cell-button-tooltip">{option.description}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="matrix-dropdown-section">
            <span className="matrix-dropdown-label">Rows</span>
            <div className="cases-row-presets" role="radiogroup" aria-label="Cases row count">
              {[1, 2, 3, 4].map((rows) => (
                <button
                  key={rows}
                  type="button"
                  className="matrix-size-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertRows(rows)}
                >
                  {rows}
                </button>
              ))}
            </div>
          </div>

          <div className="matrix-dropdown-divider" />

          <div className="matrix-manual-row">
            <input
              type="number"
              min="1"
              value={manualRows}
              aria-label="Cases rows"
              onChange={(event) => {
                const value = event.target.value
                setManualRows(value === '' ? '' : parseInt(value, 10) || '')
              }}
            />
            <span>rows</span>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={handleManualInsert}>
              Insert
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
