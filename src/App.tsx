import { useCallback, useEffect, useRef, useState } from 'react'

import { NotebookEditor } from './components/notebook/NotebookEditor'
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

function App() {
  const [document, setDocument] = useState<NotebookDocument | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [, setRecentFiles] = useState<RecentFileEntry[]>([])
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const activeCellHandleRef = useRef<CellInsertHandle | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Loading notebook workspace...')

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
      setStatusMessage('Created a new notebook.')
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
    setStatusMessage('Created a new notebook.')
  }

  const handleOpenNotebook = async () => {
    const opened = await window.eqoustics.openNotebook()

    if (!opened) {
      return
    }

    const parsed = parseNotebookFromLatex(opened.content, titleFromPath(opened.path))
    replaceDocument(parsed, opened.path)
    await refreshRecentFiles()
    setStatusMessage(`Opened ${opened.path}.`)
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

    setStatusMessage(`Exported PDF to ${result.path}.`)
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
      setStatusMessage(`Saved ${result.path}.`)
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
    setStatusMessage(`Saved ${result.path}.`)
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

  const handleInsertSnippet = (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template') => {
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

  return (
    <main className="app-shell">
      <EditorToolbar
        hasActiveCell={activeCellId !== null}
        onInsertSnippet={handleInsertSnippet}
        canSave={Boolean(document)}
        isDirty={isDirty}
        title={document.metadata.title}
        onExportPdf={() => void handleExportPdf()}
        onNewNotebook={handleNewNotebook}
        onOpenNotebook={handleOpenNotebook}
        onSaveNotebook={() => void persistDocument(false)}
        onSaveNotebookAs={() => void persistDocument(true)}
        onTitleChange={(title) => {
          updateDocument((current) => ({
            ...current,
            metadata: {
              ...current.metadata,
              title,
            },
          }))
        }}
      />
      <section className="document-shell">
        <div className="document-status-row">
          <span className="document-path">{filePath ?? 'Not saved yet'}</span>
          <span className="document-status-message">{statusMessage}</span>
        </div>
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
    </main>
  )
}

export default App
