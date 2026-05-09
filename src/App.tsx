import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSquare as faSquareRegular } from '@fortawesome/free-regular-svg-icons'
import {
  faSquare,
  faWindowMinimize,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'

import { NotebookEditor } from './components/notebook/NotebookEditor'
import { CustomScrollbar } from './components/scrollbar/CustomScrollbar'
import { EditorToolbar } from './components/toolbar/EditorToolbar'
import type { CellInsertHandle } from './components/cell/CellEditor'

import './App.css'
import { renderPrintableNotebook } from './print/renderPrintableNotebook'
import { parseNotebookFromLatex } from './serialization/latexParser'
import { serializeNotebookToLatex } from './serialization/latexSerializer'
import type { FileMenuAction } from './shared/ipc/channels'
import {
  createNotebookCell,
  type NotebookCell,
  type NotebookDocument,
  type RecentFileEntry,
} from './shared/types/notebook'



function titleFromPath(filePath: string | null): string {
  if (!filePath) {
    return 'Untitled Notebook'
  }

  const segments = filePath.split(/[/\\]/)
  const filename = segments[segments.length - 1] ?? 'Untitled Notebook'
  return filename.replace(/\.tex$/i, '')
}

function titleBarLabelFromPath(filePath: string | null): string {
  if (!filePath) {
    return 'Untitled Notebook'
  }

  const segments = filePath.split(/[/\\]/)
  return segments[segments.length - 1] ?? 'Untitled Notebook'
}

function isDocumentBlank(document: NotebookDocument): boolean {
  return document.cells.every((cell) => !cell.latex.trim())
}

function App() {
  const [document, setDocument] = useState<NotebookDocument | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [, setRecentFiles] = useState<RecentFileEntry[]>([])
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const activeCellHandleRef = useRef<CellInsertHandle | null>(null)
  const documentShellRef = useRef<HTMLElement | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    void (async () => {
      const recent = await window.eqoustics.listRecentFiles()
      const nextDocument = await window.eqoustics.createNotebook()
      setRecentFiles(recent)
      setDocument(nextDocument)
      setFilePath(null)
      setDocumentRevision((current) => current + 1)
      setActiveCellId(nextDocument.cells[0]?.id ?? null)
      setIsDirty(false)
      setIsBootstrapped(true)
    })()
  }, [])

  useEffect(() => {
    return window.eqoustics.onMenuAction((action: FileMenuAction) => {
      switch (action) {
        case 'new':
          void handleNewNotebook()
          break
        case 'open':
          void handleOpenNotebook()
          break
        case 'save':
          void persistDocument(false)
          break
        case 'saveAs':
          void persistDocument(true)
          break
        case 'exportPdf':
          void handleExportPdf()
          break
      }
    })
  })

  useEffect(() => {
    let isMounted = true

    void (async () => {
      const windowState = await window.eqoustics.getWindowState()

      if (isMounted) {
        setIsWindowMaximized(windowState.isMaximized)
      }
    })()

    const unsubscribe = window.eqoustics.onWindowStateChange((windowState) => {
      setIsWindowMaximized(windowState.isMaximized)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const refreshRecentFiles = useCallback(async () => {
    const entries = await window.eqoustics.listRecentFiles()
    setRecentFiles(entries)
  }, [])

  const replaceDocument = (nextDocument: NotebookDocument, nextPath: string | null) => {
    setDocument(nextDocument)
    setFilePath(nextPath)
    setDocumentRevision((current) => current + 1)
    setActiveCellId(nextDocument.cells[0]?.id ?? null)
    setIsDirty(false)
  }

  const handleNewNotebook = async () => {
    const nextDocument = await window.eqoustics.createNotebook()
    replaceDocument(nextDocument, null)
  }

  const handleOpenNotebook = async () => {
    const opened = await window.eqoustics.openNotebook()

    if (!opened) {
      return
    }

    const parsed = parseNotebookFromLatex(opened.content, titleFromPath(opened.path))
    replaceDocument(parsed, opened.path)
    await refreshRecentFiles()
  }

  const handleExportPdf = async () => {
    if (!document) {
      return
    }

    const result = await window.eqoustics.exportNotebookPdf({
      html: renderPrintableNotebook(document),
      title: document.metadata.title,
    })

    if (!result) {
      return
    }

  }

  const persistDocument = useCallback(async (saveAs: boolean) => {
    if (!document) {
      return
    }

    const nextDocument: NotebookDocument = {
      ...document,
      metadata: {
        ...document.metadata,
        updatedAt: new Date().toISOString(),
      },
    }
    const content = serializeNotebookToLatex(nextDocument)

    if (!saveAs && filePath) {
      const result = await window.eqoustics.saveNotebook({
        content,
        path: filePath,
        title: nextDocument.metadata.title,
      })

      setDocument(nextDocument)
      setFilePath(result.path)
      setIsDirty(false)
      await refreshRecentFiles()
      return
    }

    const result = await window.eqoustics.saveNotebookAs({
      content,
      title: nextDocument.metadata.title,
    })

    if (!result) {
      return
    }

    setDocument(nextDocument)
    setFilePath(result.path)
    setIsDirty(false)
    await refreshRecentFiles()
  }, [document, filePath, refreshRecentFiles])

  useEffect(() => {
    if (!document || !filePath || !isDirty) {
      return undefined
    }

    const handle = window.setTimeout(() => {
      void persistDocument(false)
    }, 1200)

    return () => {
      window.clearTimeout(handle)
    }
  }, [document, filePath, isDirty, persistDocument])

  const updateDocument = (updater: (current: NotebookDocument) => NotebookDocument) => {
    setDocument((current) => {
      if (!current) {
        return current
      }

      const next = updater(current)
      setIsDirty(true)
      return next
    })
  }

  const handleCellChange = (cellId: string, cell: NotebookCell) => {
    updateDocument((current) => ({
      ...current,
      cells: current.cells.map((c) => (c.id === cellId ? cell : c)),
    }))
  }

  const handleMoveCell = (sourceCellId: string, targetCellId: string, position: 'before' | 'after') => {
    setActiveCellId(sourceCellId)
    
    updateDocument((current) => {
      if (sourceCellId === targetCellId) {
        return current
      }

      const sourceIndex = current.cells.findIndex((cell) => cell.id === sourceCellId)
      const targetIndex = current.cells.findIndex((cell) => cell.id === targetCellId)

      if (sourceIndex < 0 || targetIndex < 0) {
        return current
      }

      let insertionIndex = targetIndex + (position === 'after' ? 1 : 0)
      if (sourceIndex < insertionIndex) {
        insertionIndex -= 1
      }

      if (sourceIndex === insertionIndex) {
        return current
      }

      const nextCells = [...current.cells]
      const [movedCell] = nextCells.splice(sourceIndex, 1)
      nextCells.splice(insertionIndex, 0, movedCell)

      return {
        ...current,
        cells: nextCells,
      }
    })
  }

  const handleRemoveCell = (cellId: string) => {
    if (!document) {
      return
    }

    // Pre-calculate active cell id based on current closure state.
    // Focus the cell before the deleted one, or the first cell
    const nextCells = document.cells.filter((cell) => cell.id !== cellId)
    const safeCells = nextCells.length > 0 ? nextCells : [createNotebookCell()]
    const deletedIndex = document.cells.findIndex((c) => c.id === cellId)
    const nextFocusIndex = Math.max(0, Math.min(deletedIndex, safeCells.length - 1))
    
    setActiveCellId(safeCells[nextFocusIndex]?.id ?? null)

    updateDocument((current) => {
      const currentNextCells = current.cells.filter((cell) => cell.id !== cellId)
      const currentSafeCells = currentNextCells.length > 0 ? currentNextCells : safeCells
      
      return {
        ...current,
        cells: currentSafeCells,
      }
    })
  }

  const handleAddCellBelow = (targetCellId: string) => {
    const nextCell = createNotebookCell()
    setActiveCellId(nextCell.id)

    updateDocument((current) => {
      const targetIndex = current.cells.findIndex((cell) => cell.id === targetCellId)

      if (targetIndex < 0) {
        return current
      }

      const nextCells = [...current.cells]
      nextCells.splice(targetIndex + 1, 0, nextCell)

      return {
        ...current,
        cells: nextCells,
      }
    })
  }

  const handleInsertSnippet = (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template' | 'func-slot') => {
    activeCellHandleRef.current?.insert(snippet, mode)
  }

  const handleFocusCell = (cellId: string) => {
    setActiveCellId(cellId)
  }

  if (!isBootstrapped) {
    return <main className="app-shell loading-shell">Loading Eqoustics...</main>
  }

  if (!document) {
    return <main className="app-shell loading-shell">Loading notebook...</main>
  }

  const isSaved = Boolean(filePath) && !isDirty

  return (
    <main className="app-shell">
      <header className="window-titlebar">
        <div className="window-titlebar-drag-zone" />
        <div className="window-titlebar-center" onDoubleClick={() => void window.eqoustics.windowControl('toggleMaximize')}>
          <span className="cell-button-tooltip-wrap window-title-tooltip-wrap">
            <span className="window-document-title">
              {titleBarLabelFromPath(filePath)} <span className="window-app-title-separator">• Eqoustics</span>
            </span>
            <span className="cell-button-tooltip window-title-tooltip">{filePath ?? 'Not saved yet'}</span>
          </span>
          <span className={`window-save-state ${isSaved ? 'window-save-state-saved' : 'window-save-state-unsaved'}`}>
            {isSaved ? 'Saved' : 'Unsaved'}
          </span>
        </div>
        <div className="window-controls">
          <button
            className="window-control-button window-control-minimize"
            type="button"
            onClick={() => void window.eqoustics.windowControl('minimize')}
            aria-label="Minimize window"
            title="Minimize"
          >
            <FontAwesomeIcon icon={faWindowMinimize} />
          </button>
          <button
            className="window-control-button window-control-maximize"
            type="button"
            onClick={() => void window.eqoustics.windowControl('toggleMaximize')}
            aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'}
            title={isWindowMaximized ? 'Restore' : 'Maximize'}
          >
            <FontAwesomeIcon icon={isWindowMaximized ? faSquareRegular : faSquare} />
          </button>
          <button
            className="window-control-button window-control-close"
            type="button"
            onClick={() => void window.eqoustics.windowControl('close')}
            aria-label="Close window"
            title="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </header>
      <EditorToolbar
        hasActiveCell={activeCellId !== null}
        onInsertSnippet={handleInsertSnippet}
        canSave={Boolean(document)}
        onExportPdf={() => void handleExportPdf()}
        onNewNotebook={handleNewNotebook}
        onOpenNotebook={handleOpenNotebook}
        onSaveNotebook={() => void persistDocument(false)}
        onSaveNotebookAs={() => void persistDocument(true)}
      />
      <div className="document-scroll-region">
        <section
          ref={documentShellRef}
          className="document-shell custom-scrollbar-target"
          onPointerDownCapture={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest('.notebook-cell')) return
            if (isDocumentBlank(document)) {
              setActiveCellId(document.cells[0]?.id ?? null)
            } else {
              setActiveCellId(null)
            }

            const activeElement = window.document.activeElement
            if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
              activeElement.blur()
            }
          }}
        >
          <NotebookEditor
            activeCellId={activeCellId}
            document={document}
            documentRevision={documentRevision}
            onActivateCell={handleFocusCell}
            onAddCellBelow={handleAddCellBelow}
            onCellChange={handleCellChange}
            onInsertHandleReady={(handle) => { activeCellHandleRef.current = handle }}
            onMoveCell={handleMoveCell}
            onRemoveCell={handleRemoveCell}
            onFocusCell={handleFocusCell}
          />
        </section>
        <CustomScrollbar targetRef={documentShellRef} />
      </div>
    </main>
  )
}

export default App
