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
import { FloatingSpeechControl } from './components/speech/FloatingSpeechControl'
import { EditorToolbar } from './components/toolbar/EditorToolbar'
import type { CellChangeKind, CellChangeMetadata, CellInsertHandle, EditorSelectionState, TextFormatCommand } from './components/cell/CellEditor'

import './App.css'
import { copyCells, type CopyAsFormat } from './clipboard/editorClipboard'
import { renderPrintableNotebook } from './print/renderPrintableNotebook'
import { parseNotebookFromLatex } from './serialization/latexParser'
import { serializeNotebookToLatex } from './serialization/latexSerializer'
import type { AppSettingsPayload, AppSettingsUpdatePayload, FileMenuAction } from './shared/ipc/channels'
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
const TABLE_OF_CONTENTS_OPEN_STORAGE_KEY = 'eqoustics.tableOfContentsOpen'

const FALLBACK_APP_SETTINGS: AppSettingsPayload = {
  microphoneDeviceId: null,
  appearance: 'system',
  speechModelSize: '2b',
  totalMemoryBytes: 0,
}

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

interface TableOfContentsHeading {
  cellId: string
  level: 1 | 2 | 3 | 4
  title: string
}

const HEADING_COMMANDS: Array<{ command: string; level: TableOfContentsHeading['level'] }> = [
  { command: '\\section', level: 1 },
  { command: '\\subsection', level: 2 },
  { command: '\\subsubsection', level: 3 },
  { command: '\\paragraph', level: 4 },
]

function readLatexGroup(source: string, startIndex: number): string | null {
  const openIndex = source.indexOf('{', startIndex)
  if (openIndex < 0) return null

  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    const escaped = index > 0 && source[index - 1] === '\\'
    if (escaped) continue

    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(openIndex + 1, index)
      }
    }
  }

  return null
}

function textFromHeadingLatex(latex: string): string {
  let text = latex

  for (let pass = 0; pass < 4; pass += 1) {
    text = text.replace(/\\(?:textbf|textit|underline|emph|text)\{([^{}]*)\}/g, '$1')
  }

  return text
    .replace(/\\([{}$&_#%])/g, '$1')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, (command) => command.replace(/\*?(?:\[[^\]]*\])?$/, '').slice(1))
    .replace(/[{}$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function headingFromCell(cell: NotebookCell): TableOfContentsHeading | null {
  const latex = cell.latex.trim()

  for (const { command, level } of HEADING_COMMANDS) {
    if (!latex.startsWith(command)) continue

    const afterCommand = latex.slice(command.length)
    if (afterCommand && !/^\s*(?:\{|$)/.test(afterCommand)) continue

    const body = readLatexGroup(latex, command.length) ?? latex.slice(command.length).trim()
    const title = textFromHeadingLatex(body)
    return { cellId: cell.id, level, title: title || 'Untitled heading' }
  }

  return null
}

function readStoredTableOfContentsOpen(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(TABLE_OF_CONTENTS_OPEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
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
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([])
  const [appSettings, setAppSettings] = useState<AppSettingsPayload>(FALLBACK_APP_SETTINGS)
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [isModelRestartRequired, setIsModelRestartRequired] = useState(false)
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const [pendingSelectionRestore, setPendingSelectionRestore] = useState<EditorSelectionState | null>(null)
  const activeCellHandleRef = useRef<CellInsertHandle | null>(null)
  const typingHistoryGroupRef = useRef<TypingHistoryGroup | null>(null)
  const documentShellRef = useRef<HTMLElement | null>(null)
  const initialSpeechModelSizeRef = useRef<AppSettingsPayload['speechModelSize']>(FALLBACK_APP_SETTINGS.speechModelSize)
  const [isDirty, setIsDirty] = useState(false)
  const [isTableOfContentsOpen, setIsTableOfContentsOpen] = useState(readStoredTableOfContentsOpen)
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false)
  const [linkPrompt, setLinkPrompt] = useState<{ selection: EditorSelectionState | null; url: string } | null>(null)
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(() => new Set())
  const [copyDefaultFormat, setCopyDefaultFormat] = useState<CopyAsFormat>('png')
  const rowSelectionAnchorRef = useRef<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [recent, settings] = await Promise.all([
        window.eqoustics.listRecentFiles(),
        window.eqoustics.getSettings(),
      ])
      const nextDocument = await window.eqoustics.createNotebook()
      setRecentFiles(recent)
      setAppSettings(settings)
      initialSpeechModelSizeRef.current = settings.speechModelSize
      setDocument(nextDocument)
      setFilePath(null)
      setDocumentRevision((current) => current + 1)
      setActiveCellId(nextDocument.cells[0]?.id ?? null)
      setIsDirty(false)
      setIsBootstrapped(true)
    })()
  }, [])

  const refreshMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return

    const devices = await navigator.mediaDevices.enumerateDevices()
    setMicrophones(devices.filter((device) => device.kind === 'audioinput'))
  }, [])

  useEffect(() => {
    void refreshMicrophones()
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshMicrophones)
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshMicrophones)
    }
  }, [refreshMicrophones])

  useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const applyAppearance = () => {
      const resolvedAppearance = appSettings.appearance === 'system'
        ? mediaQuery.matches ? 'dark' : 'light'
        : appSettings.appearance
      root.dataset.appearance = resolvedAppearance
      root.style.colorScheme = resolvedAppearance
    }

    applyAppearance()
    if (appSettings.appearance !== 'system') return undefined

    mediaQuery.addEventListener('change', applyAppearance)
    return () => mediaQuery.removeEventListener('change', applyAppearance)
  }, [appSettings.appearance])

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

  const updateAppSettings = useCallback(async (update: AppSettingsUpdatePayload) => {
    const nextSettings = await window.eqoustics.updateSettings(update)
    setAppSettings(nextSettings)
    if (update.speechModelSize) {
      setIsModelRestartRequired(nextSettings.speechModelSize !== initialSpeechModelSizeRef.current)
    }
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
    setSelectedCellIds(new Set())
    rowSelectionAnchorRef.current = null
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

  const handleOpenRecentFile = async (recentFilePath: string) => {
    const opened = await window.eqoustics.openNotebookAtPath(recentFilePath)
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

  useEffect(() => {
    if (!document) return

    const liveCellIds = new Set(document.cells.map((cell) => cell.id))
    setSelectedCellIds((current) => {
      const next = new Set(Array.from(current).filter((cellId) => liveCellIds.has(cellId)))
      return next.size === current.size ? current : next
    })

    if (rowSelectionAnchorRef.current && !liveCellIds.has(rowSelectionAnchorRef.current)) {
      rowSelectionAnchorRef.current = null
    }
  }, [document])

  const updateDocument = useCallback((
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
  }, [activeCellId, documentWithVisibleEditorState])

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

  const handleAddCellsBelow = (targetCellId: string, initialLatexRows: string[]) => {
    const nextCells = initialLatexRows.map((initialLatex) => createNotebookCell(initialLatex))
    if (nextCells.length === 0) return

    setActiveCellId(nextCells[nextCells.length - 1].id)

    updateDocument((current) => {
      const targetIndex = current.cells.findIndex((cell) => cell.id === targetCellId)

      if (targetIndex < 0) {
        return current
      }

      const cells = [...current.cells]
      cells.splice(targetIndex + 1, 0, ...nextCells)

      return {
        ...current,
        cells,
      }
    }, { captureVisibleEditorState: true })
  }

  const handleAddCellAbove = (targetCellId: string, initialLatex = '') => {
    handleAddCell(targetCellId, 'before', initialLatex)
  }

  const handleInsertSnippet = (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template' | 'func-slot') => {
    activeCellHandleRef.current?.insert(snippet, mode)
  }

  const handleSpeechTranscript = useCallback((transcript: string) => {
    activeCellHandleRef.current?.insert(transcript, 'write')
  }, [])

  const getCurrentSpeechRowLatex = useCallback(() => {
    return activeCellHandleRef.current?.getLatex() ?? ''
  }, [])

  const handlePrepareSpeechInput = useCallback(() => {
    if (!document) return
    if (activeCellId !== null) return
    setActiveCellId(document.cells[0]?.id ?? null)
  }, [activeCellId, document])

  const handleFormatText = (format: TextFormatCommand) => {
    activeCellHandleRef.current?.format(format)
  }

  const handleCreateLink = () => {
    const handle = activeCellHandleRef.current
    if (!handle) return

    setLinkPrompt({ selection: handle.getSelection(), url: '' })
  }

  const handleSubmitLinkPrompt = () => {
    const handle = activeCellHandleRef.current
    const trimmedUrl = linkPrompt?.url.trim()
    if (!handle || !linkPrompt || !trimmedUrl) return

    if (linkPrompt.selection) {
      handle.restoreSelection(linkPrompt.selection)
    }
    handle.link(trimmedUrl)
    setLinkPrompt(null)
  }

  const handleFocusCell = (cellId: string) => {
    typingHistoryGroupRef.current = null
    setSelectedCellIds(new Set())
    rowSelectionAnchorRef.current = null
    setActiveCellId(cellId)
  }

  const cellIdRange = useCallback((startCellId: string, endCellId: string, sourceDocument: NotebookDocument): Set<string> => {
    const startIndex = sourceDocument.cells.findIndex((cell) => cell.id === startCellId)
    const endIndex = sourceDocument.cells.findIndex((cell) => cell.id === endCellId)
    if (startIndex < 0 || endIndex < 0) return new Set([endCellId])

    const from = Math.min(startIndex, endIndex)
    const to = Math.max(startIndex, endIndex)
    return new Set(sourceDocument.cells.slice(from, to + 1).map((cell) => cell.id))
  }, [])

  const handleSelectCellRows = useCallback((cellId: string, mode: 'replace' | 'toggle' | 'range') => {
    if (!document) return

    if (mode === 'range') {
      const anchorCellId = rowSelectionAnchorRef.current ?? cellId
      setSelectedCellIds(cellIdRange(anchorCellId, cellId, document))
      return
    }

    rowSelectionAnchorRef.current = cellId
    if (mode === 'toggle') {
      setSelectedCellIds((current) => {
        const next = new Set(current)
        if (next.has(cellId)) {
          next.delete(cellId)
        } else {
          next.add(cellId)
        }
        return next
      })
      return
    }

    setSelectedCellIds(new Set([cellId]))
  }, [cellIdRange, document])

  const handleExtendCellRowSelection = useCallback((cellId: string) => {
    if (!document) return

    const anchorCellId = rowSelectionAnchorRef.current ?? cellId
    setSelectedCellIds(cellIdRange(anchorCellId, cellId, document))
  }, [cellIdRange, document])

  const selectedCellsForClipboard = useCallback((): NotebookCell[] => {
    if (!document) return []

    const currentDocument = documentWithVisibleEditorState(document)
    const selectedRows = currentDocument.cells.filter((cell) => selectedCellIds.has(cell.id))
    if (selectedRows.length > 0) return selectedRows

    const activeCell = activeCellId ? currentDocument.cells.find((cell) => cell.id === activeCellId) : null
    return activeCell ? [activeCell] : []
  }, [activeCellId, document, documentWithVisibleEditorState, selectedCellIds])

  const handleCopySelection = useCallback(async (format: CopyAsFormat = copyDefaultFormat) => {
    const cells = selectedCellsForClipboard()
    if (cells.length === 0) return

    try {
      await copyCells(cells, format)
    } catch (error) {
      console.error(error)
    }
  }, [copyDefaultFormat, selectedCellsForClipboard])

  const handleCopySelectionAs = useCallback(async (format: CopyAsFormat) => {
    setCopyDefaultFormat(format)
    await handleCopySelection(format)
  }, [handleCopySelection])

  const handleDeleteSelectedCells = useCallback(() => {
    if (!document || selectedCellIds.size === 0) return

    const selectedRows = document.cells.filter((cell) => selectedCellIds.has(cell.id))
    if (selectedRows.length === 0) return

    const firstSelectedIndex = document.cells.findIndex((cell) => selectedCellIds.has(cell.id))
    const remainingCells = document.cells.filter((cell) => !selectedCellIds.has(cell.id))
    const safeCells = remainingCells.length > 0 ? remainingCells : [createNotebookCell()]
    const nextFocusIndex = Math.max(0, Math.min(firstSelectedIndex, safeCells.length - 1))

    setSelectedCellIds(new Set())
    rowSelectionAnchorRef.current = null
    setActiveCellId(safeCells[nextFocusIndex]?.id ?? null)

    updateDocument((current) => {
      const cells = current.cells.filter((cell) => !selectedCellIds.has(cell.id))
      return {
        ...current,
        cells: cells.length > 0 ? cells : safeCells,
      }
    }, { captureVisibleEditorState: true, changeKind: 'delete' })
  }, [document, selectedCellIds, updateDocument])

  const handleCutSelection = useCallback(async () => {
    if (selectedCellIds.size === 0) {
      window.document.execCommand('cut')
      return
    }

    await handleCopySelection()
    handleDeleteSelectedCells()
  }, [handleCopySelection, handleDeleteSelectedCells, selectedCellIds.size])

  useEffect(() => {
    const handleEditorCommandKeyDown = (event: KeyboardEvent) => {
      if (linkPrompt) return

      const target = event.target instanceof Node ? event.target : null
      const targetIsInEditor = Boolean(target && documentShellRef.current?.contains(target))
      const hasSelectedRows = selectedCellIds.size > 0

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'c' && (hasSelectedRows || targetIsInEditor)) {
        const cells = selectedCellsForClipboard()
        if (cells.length === 0) return

        event.preventDefault()
        void handleCopySelection()
        return
      }

      if (
        hasSelectedRows
        && (event.key === 'Backspace' || event.key === 'Delete')
        && !event.altKey
        && !event.ctrlKey
        && !event.metaKey
      ) {
        event.preventDefault()
        handleDeleteSelectedCells()
      }
    }

    window.addEventListener('keydown', handleEditorCommandKeyDown)
    return () => window.removeEventListener('keydown', handleEditorCommandKeyDown)
  }, [handleCopySelection, handleDeleteSelectedCells, linkPrompt, selectedCellIds.size, selectedCellsForClipboard])

  const tableOfContentsHeadings = document?.cells
    .map(headingFromCell)
    .filter((heading): heading is TableOfContentsHeading => Boolean(heading)) ?? []

  const handleToggleTableOfContents = () => {
    setIsTableOfContentsOpen((current) => {
      const next = !current
      try {
        window.localStorage.setItem(TABLE_OF_CONTENTS_OPEN_STORAGE_KEY, String(next))
      } catch {
        // Ignore storage failures; the in-memory state still updates.
      }
      return next
    })
  }

  const handleNavigateToHeading = (cellId: string) => {
    const target = documentShellRef.current?.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
    if (!target) return

    target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setActiveCellId(cellId)
  }

  if (!isBootstrapped) {
    return <main className="app-shell loading-shell">Loading Eqoustics...</main>
  }

  if (!document) {
    return <main className="app-shell loading-shell">Loading notebook...</main>
  }

  const isSaved = Boolean(filePath) && !isDirty
  const canCopyContent = selectedCellIds.size > 0 || activeCellId !== null

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
        onCreateLink={handleCreateLink}
        canSave={Boolean(document)}
        onExportPdf={() => void handleExportPdf()}
        onExportLatex={() => void persistDocument(true)}
        onNewNotebook={handleNewNotebook}
        onOpenNotebook={handleOpenNotebook}
        onSaveNotebook={() => void persistDocument(false)}
        onSaveNotebookAs={() => void persistDocument(true)}
        recentFiles={recentFiles}
        onOpenRecentFile={(recentFilePath) => void handleOpenRecentFile(recentFilePath)}
        appSettings={appSettings}
        microphones={microphones}
        isModelRestartRequired={isModelRestartRequired}
        onUpdateSettings={(update) => void updateAppSettings(update)}
        onRefreshMicrophones={() => void refreshMicrophones()}
        onRestartApp={() => void window.eqoustics.restartApp()}
        onDismissModelRestart={() => setIsModelRestartRequired(false)}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canCopyContent={canCopyContent}
        canDeleteSelection={selectedCellIds.size > 0}
        onCopyContent={handleCopySelection}
        onCopyAs={handleCopySelectionAs}
        onCutContent={handleCutSelection}
        onDeleteSelection={handleDeleteSelectedCells}
        onMenuVisibilityChange={setIsToolbarMenuOpen}
      />
      <div className="document-scroll-region">
        <FloatingSpeechControl
          disabled={document.cells.length === 0}
          microphoneDeviceId={appSettings.microphoneDeviceId}
          getCurrentRowLatex={getCurrentSpeechRowLatex}
          onBeforeListen={handlePrepareSpeechInput}
          onTranscript={handleSpeechTranscript}
        />
        {tableOfContentsHeadings.length > 0 ? (
          <aside
            className={`table-of-contents${isToolbarMenuOpen ? ' table-of-contents-muted' : ''}`}
            aria-hidden={isToolbarMenuOpen}
          >
            <span className="cell-button-tooltip-wrap tooltip-edge-safe-left">
              <button
                type="button"
                className={`toc-toggle-button${isTableOfContentsOpen ? ' toc-toggle-button-active' : ''}`}
                aria-label="Table of Contents"
                aria-expanded={isTableOfContentsOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleToggleTableOfContents}
              >
                <span aria-hidden="true" className="toc-toggle-lines">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <span className="cell-button-tooltip">Table of Contents</span>
            </span>
            {isTableOfContentsOpen ? (
              <nav className="toc-panel" aria-label="Table of Contents">
                {tableOfContentsHeadings.map((heading) => (
                  <button
                    key={heading.cellId}
                    type="button"
                    className={`toc-heading toc-heading-level-${heading.level}`}
                    onClick={() => handleNavigateToHeading(heading.cellId)}
                  >
                    {heading.title}
                  </button>
                ))}
              </nav>
            ) : null}
          </aside>
        ) : null}
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
            onAddCellsBelow={handleAddCellsBelow}
            onCellChange={handleCellChange}
            onInsertHandleReady={(handle) => { activeCellHandleRef.current = handle }}
            pendingSelectionRestore={pendingSelectionRestore}
            onSelectionRestoreComplete={() => setPendingSelectionRestore(null)}
            onMoveCell={handleMoveCell}
            onRemoveCell={handleRemoveCell}
            onFocusCell={handleFocusCell}
            selectedCellIds={selectedCellIds}
            onSelectCellRows={handleSelectCellRows}
            onExtendCellRowSelection={handleExtendCellRowSelection}
          />
        </section>
        <CustomScrollbar targetRef={documentShellRef} />
      </div>
      {linkPrompt ? (
        <div className="link-prompt-backdrop" role="presentation" onMouseDown={() => setLinkPrompt(null)}>
          <form
            className="link-prompt"
            aria-label="Add hyperlink"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmitLinkPrompt()
            }}
          >
            <label className="link-prompt-label" htmlFor="link-prompt-url">URL</label>
            <input
              id="link-prompt-url"
              className="link-prompt-input"
              autoFocus
              value={linkPrompt.url}
              placeholder="https://example.com"
              onChange={(event) => setLinkPrompt((current) => current ? { ...current, url: event.target.value } : current)}
            />
            <div className="link-prompt-actions">
              <button type="button" className="link-prompt-button" onClick={() => setLinkPrompt(null)}>Cancel</button>
              <button type="submit" className="link-prompt-button link-prompt-button-primary" disabled={!linkPrompt.url.trim()}>Add</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default App
