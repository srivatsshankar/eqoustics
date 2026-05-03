import { useState, useRef, useEffect } from 'react'

interface MatrixDropdownProps {
  disabled: boolean
  onInsertSnippet: (snippet: string, mode: 'cmd' | 'write' | 'latex' | 'template') => void
}

export function MatrixDropdown({ disabled, onInsertSnippet }: MatrixDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hoverRows, setHoverRows] = useState(0)
  const [hoverCols, setHoverCols] = useState(0)
  const [manualRows, setManualRows] = useState<number | string>(3)
  const [manualCols, setManualCols] = useState<number | string>(3)

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
    return `\\begin{pmatrix} ${body} \\end{pmatrix}`
  }

  const handleGridClick = (r: number, c: number) => {
    onInsertSnippet(generateMatrixLatex(r, c), 'template')
    setIsOpen(false)
  }

  const handleManualInsert = () => {
    const r = typeof manualRows === 'string' ? parseInt(manualRows) : manualRows
    const c = typeof manualCols === 'string' ? parseInt(manualCols) : manualCols
    if (!isNaN(r) && !isNaN(c) && r > 0 && c > 0) {
      onInsertSnippet(generateMatrixLatex(r, c), 'template')
      setIsOpen(false)
    }
  }

  return (
    <div className="toolbar-group toolbar-group-bordered matrix-dropdown-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="symbol-btn"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setIsOpen(!isOpen)}
      >
        Matrix
      </button>

      {isOpen && (
        <div
          className="matrix-dropdown-popover"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            background: '#ffffff',
            border: '1px solid rgba(31, 41, 51, 0.12)',
            borderRadius: '0.5rem',
            padding: '1rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginTop: '0.25rem',
          }}
        >
          <div
            className="matrix-grid"
            onMouseLeave={() => {
              setHoverRows(0)
              setHoverCols(0)
            }}
            style={{ display: 'grid', gap: '3px' }}
          >
            {Array.from({ length: 10 }).map((_, rIndex) => (
              <div key={rIndex} style={{ display: 'flex', gap: '3px' }}>
                {Array.from({ length: 10 }).map((_, cIndex) => {
                  const r = rIndex + 1
                  const c = cIndex + 1
                  const isHovered = r <= hoverRows && c <= hoverCols
                  return (
                    <button
                      key={cIndex}
                      type="button"
                      aria-label={`Insert ${r} by ${c} matrix`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => {
                        setHoverRows(r)
                        setHoverCols(c)
                      }}
                      onClick={() => handleGridClick(r, c)}
                      style={{
                        width: '18px',
                        height: '18px',
                        padding: 0,
                        border: isHovered ? '1px solid #2563eb' : '1px solid rgba(31, 41, 51, 0.2)',
                        backgroundColor: isHovered ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        transition: 'background-color 100ms',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#4b5563', minHeight: '1.2rem' }}>
            {hoverRows > 0 && hoverCols > 0 ? `${hoverRows} × ${hoverCols}` : 'Hover to select size'}
          </div>
          <hr style={{ margin: '0', border: 'none', borderTop: '1px solid rgba(31, 41, 51, 0.1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <input
              type="number"
              min="1"
              value={manualRows}
              onChange={(e) => {
                const val = e.target.value
                setManualRows(val === '' ? '' : parseInt(val) || '')
              }}
              style={{
                width: '3rem',
                padding: '0.25rem',
                border: '1px solid rgba(31, 41, 51, 0.2)',
                borderRadius: '0.25rem',
                textAlign: 'center',
              }}
            />
            <span style={{ color: '#6b7280' }}>×</span>
            <input
              type="number"
              min="1"
              value={manualCols}
              onChange={(e) => {
                const val = e.target.value
                setManualCols(val === '' ? '' : parseInt(val) || '')
              }}
              style={{
                width: '3rem',
                padding: '0.25rem',
                border: '1px solid rgba(31, 41, 51, 0.2)',
                borderRadius: '0.25rem',
                textAlign: 'center',
              }}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleManualInsert}
              style={{
                marginLeft: 'auto',
                padding: '0.3rem 0.6rem',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Insert
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
