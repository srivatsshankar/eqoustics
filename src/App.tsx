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
import type { CellChangeKind, CellChangeMetadata, CellInsertHandle, EditorSelectionState, TextFormatCommand } from './components/cell/CellEditor'

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

const HISTORY_LIMIT = 100
const TYPING_GROUP_TIMEOUT_MS = 1200

interface HistoryEntry {
  document: NotebookDocument
  activeCellId: string | null
  selection: EditorSelectionState | null
}

interface UpdateDocumentOptions {
  captureVisibleEditorState?: boolean
  changedCellId?: string
  changeKind?: CellChangeKind
  selectionBefore?: EditorSelectionState | null
  inputType?: string
  data?: string | null
}

interface TypingHistoryGroup {
  cellId: string
  kind: 'typing' | 'delete'
  lastAt: number
  lastDataWasWhitespace: boolean
}

function cloneDocument(document: NotebookDocument): NotebookDocument {
  return {
    ...document,
    metadata: { ...document.metadata },
    cells: document.cells.map((cell) => ({ ...cell })),
  }
}

function documentsMatch(left: NotebookDocument, right: NotebookDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function App() {
  const [document, setDocument] = useState<NotebookDocument | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [, setRecentFiles] = useState<RecentFileEntry[]>([])
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const [pendingSelectionRestore, setPendingSelectionRestore] = useState<EditorSelectionState | null>(null)
  const activeCellHandleRef = useRef<CellInsertHandle | null>(null)
  const typingHistoryGroupRef = useRef<TypingHistoryGroup | null>(null)
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

  const documentWithVisibleEditorState = useCallback((sourceDocument: NotebookDocument): NotebookDocument => {
    const activeLatex = activeCellId ? activeCellHandleRef.current?.getLatex() : null
    if (!activeCellId || activeLatex === null || activeLatex === undefined) {
      return sourceDocument
    }

    return {
      ...sourceDocument,
      cells: sourceDocument.cells.map((cell) => (cell.id === activeCellId ? { ...cell, latex: activeLatex } : cell)),
    }
  }, [activeCellId])

  const replaceDocument = (nextDocument: NotebookDocument, nextPath: string | null) => {
    setDocument(nextDocument)
    setFilePath(nextPath)
    setDocumentRevision((current) => current + 1)
    setActiveCellId(nextDocument.cells[0]?.id ?? null)
    setUndoStack([])
    setRedoStack([])
    setPendingSelectionRestore(null)
    typingHistoryGroupRef.current = null
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

    const currentDocument = documentWithVisibleEditorState(document)

    const nextDocument: NotebookDocument = {
      ...currentDocument,
      metadata: {
        ...currentDocument.metadata,
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
  }, [document, documentWithVisibleEditorState, filePath, refreshRecentFiles])

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

  const updateDocument = (
    updater: (current: NotebookDocument) => NotebookDocument,
    options: UpdateDocumentOptions = {},
  ) => {
    setDocument((current) => {
      if (!current) {
        return current
      }

      const historySource = options.captureVisibleEditorState ? documentWithVisibleEditorState(current) : current
      const next = updater(historySource)
      if (documentsMatch(historySource, next)) {
        return current
      }

      const now = Date.now()
      const changedCellId = options.changedCellId ?? activeCellId
      const changeKind = options.changeKind ?? 'other'
      const isGroupedChange = (changeKind === 'typing' || changeKind === 'delete') && Boolean(changedCellId)
      const previousGroup = typingHistoryGroupRef.current
      const currentDataIsWhitespace = changeKind === 'typing' && Boolean(options.data) && /\s/.test(options.data ?? '')
      const startsWordAfterWhitespace = changeKind === 'typing'
        && Boolean(options.data)
        && !/\s/.test(options.data ?? '')
        && Boolean(previousGroup?.lastDataWasWhitespace)
      const canReuseHistoryEntry = Boolean(
        isGroupedChange
        && previousGroup
        && previousGroup.cellId === changedCellId
        && previousGroup.kind === changeKind
        && now - previousGroup.lastAt <= TYPING_GROUP_TIMEOUT_MS
        && !startsWordAfterWhitespace,
      )

      if (!canReuseHistoryEntry) {
        const previousEntry: HistoryEntry = {
          document: cloneDocument(historySource),
          activeCellId,
          selection: options.selectionBefore ?? activeCellHandleRef.current?.getSelection() ?? null,
        }
        setUndoStack((stack) => [...stack.slice(Math.max(0, stack.length - HISTORY_LIMIT + 1)), previousEntry])
      }

      if (isGroupedChange && changedCellId) {
        typingHistoryGroupRef.current = {
          cellId: changedCellId,
          kind: changeKind === 'delete' ? 'delete' : 'typing',
          lastAt: now,
          lastDataWasWhitespace: currentDataIsWhitespace,
        }
      } else {
        typingHistoryGroupRef.current = null
      }

      setRedoStack([])
      setIsDirty(true)
      return next
    })
  }

  const restoreHistoryEntry = useCallback((entry: HistoryEntry) => {
    const nextDocument = cloneDocument(entry.document)
    setDocument(nextDocument)
    setDocumentRevision((current) => current + 1)
    setActiveCellId(entry.activeCellId && nextDocument.cells.some((cell) => cell.id === entry.activeCellId)
      ? entry.activeCellId
      : nextDocument.cells[0]?.id ?? null)
    setPendingSelectionRestore(entry.selection)
    activeCellHandleRef.current = null
    typingHistoryGroupRef.current = null
    setIsDirty(true)
  }, [])

  const handleUndo = useCallback(() => {
    if (!document || undoStack.length === 0) {
      return
    }

    const previousEntry = undoStack[undoStack.length - 1]
    const currentEntry: HistoryEntry = {
      document: cloneDocument(documentWithVisibleEditorState(document)),
      activeCellId,
      selection: activeCellHandleRef.current?.getSelection() ?? null,
    }

    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack.slice(Math.max(0, stack.length - HISTORY_LIMIT + 1)), currentEntry])
    restoreHistoryEntry(previousEntry)
  }, [activeCellId, document, documentWithVisibleEditorState, restoreHistoryEntry, undoStack])

  const handleRedo = useCallback(() => {
    if (!document || redoStack.length === 0) {
      return
    }

    const nextEntry = redoStack[redoStack.length - 1]
    const currentEntry: HistoryEntry = {
      document: cloneDocument(documentWithVisibleEditorState(document)),
      activeCellId,
      selection: activeCellHandleRef.current?.getSelection() ?? null,
    }

    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack.slice(Math.max(0, stack.length - HISTORY_LIMIT + 1)), currentEntry])
    restoreHistoryEntry(nextEntry)
  }, [activeCellId, document, documentWithVisibleEditorState, redoStack, restoreHistoryEntry])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleRedo, handleUndo])

  const handleCellChange = (cellId: string, cell: NotebookCell, metadata?: CellChangeMetadata) => {
    updateDocument((current) => ({
      ...current,
      cells: current.cells.map((c) => (c.id === cellId ? cell : c)),
    }), {
      changedCellId: cellId,
      changeKind: metadata?.kind,
      selectionBefore: metadata?.selectionBefore,
      inputType: metadata?.inputType,
      data: metadata?.data,
    })
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
    }, { captureVisibleEditorState: true })
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
    }, { captureVisibleEditorState: true })
  }

  const handleAddCell = (targetCellId: string, position: 'before' | 'after', initialLatex = '') => {
    const nextCell = createNotebookCell(initialLatex)
    setActiveCellId(nextCell.id)

    updateDocument((current) => {
      const targetIndex = current.cells.findIndex((cell) => cell.id === targetCellId)

      if (targetIndex < 0) {
        return current
      }

      const nextCells = [...current.cells]
      nextCells.splice(targetIndex + (position === 'after' ? 1 : 0), 0, nextCell)

      return {
        ...current,
        cells: nextCells,
      }
    }, { captureVisibleEditorState: true })
  }

  const handleAddCellBelow = (targetCellId: string, initialLatex = '') => {
    handleAddCell(targetCellId, 'after', initialLatex)
  }

  const handleAddCellAbove = (targetCellId: string, initialLatex = '') => {
    handleAddCell(targetCellId, 'before', initialLatex)
  }

  const handleInsertSnippet = (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template' | 'func-slot') => {
    activeCellHandleRef.current?.insert(snippet, mode)
  }

  const handleFormatText = (format: TextFormatCommand) => {
    activeCellHandleRef.current?.format(format)
  }

  const handleFocusCell = (cellId: string) => {
    typingHistoryGroupRef.current = null
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
        onFormatText={handleFormatText}
        canSave={Boolean(document)}
        onExportPdf={() => void handleExportPdf()}
        onExportLatex={() => void persistDocument(true)}
        onNewNotebook={handleNewNotebook}
        onOpenNotebook={handleOpenNotebook}
        onSaveNotebook={() => void persistDocument(false)}
        onSaveNotebookAs={() => void persistDocument(true)}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
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
            onAddCellAbove={handleAddCellAbove}
            onAddCellBelow={handleAddCellBelow}
            onCellChange={handleCellChange}
            onInsertHandleReady={(handle) => { activeCellHandleRef.current = handle }}
            pendingSelectionRestore={pendingSelectionRestore}
            onSelectionRestoreComplete={() => setPendingSelectionRestore(null)}
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
