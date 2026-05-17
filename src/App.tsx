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
import type { CellChangeKind, CellChangeMetadata, CellInsertHandle, CorrectionHighlightRange, EditorSelectionState, TextFormatCommand } from './components/cell/CellEditor'
import type { SpeechRecognitionResult } from './speech/pythonSpeech'

import './App.css'
import { copyCells, type CopyAsFormat } from './clipboard/editorClipboard'
import { renderPrintableNotebook } from './print/renderPrintableNotebook'
import { parseNotebookFromLatex } from './serialization/latexParser'
import { serializeNotebookToLatex } from './serialization/latexSerializer'
import type { AppSettingsPayload, AppSettingsUpdatePayload, FileMenuAction, SpeechRecognitionCommand } from './shared/ipc/channels'
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
  speechAcceleration: 'gpu',
  speechInferenceRuntime: 'litert',
  transformersMtp: true,
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

type SpeechCorrectionHighlight = ({ cellId: string } & CorrectionHighlightRange) | null
type HelpMenuRequest = { id: number; action: 'toggle' | 'close' }

interface LastSpeechInsertion {
  cellId: string
  start: number
  end: number
}

const HEADING_COMMANDS: Array<{ command: string; level: TableOfContentsHeading['level'] }> = [
  { command: '\\section', level: 1 },
  { command: '\\subsection', level: 2 },
  { command: '\\subsubsection', level: 3 },
  { command: '\\paragraph', level: 4 },
]

const INLINE_SPEECH_FORMATS = {
  bold: ['\\textbf{', '}'],
  italic: ['\\textit{', '}'],
  underline: ['\\underline{', '}'],
} as const

const LIST_SPEECH_FORMATS = {
  bulletList: ['\\begin{itemize}\\item ', '\\end{itemize}'],
  numberedList: ['\\begin{enumerate}\\item ', '\\end{enumerate}'],
} as const

const HEADING_COMMAND_BY_LEVEL: Record<1 | 2 | 3 | 4, string> = {
  1: '\\section',
  2: '\\subsection',
  3: '\\subsubsection',
  4: '\\paragraph',
}

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

function lastLatexTokenRange(latex: string): { start: number; end: number } | null {
  const end = latex.search(/\s*$/)
  const body = latex.slice(0, end)
  if (!body) return null

  const match = /(?:\\[a-zA-Z]+|[A-Za-z0-9]+|[^\s])$/.exec(body)
  if (!match) return null

  return {
    start: match.index,
    end,
  }
}

function wrapLatexRange(latex: string, range: { start: number; end: number }, format: keyof typeof INLINE_SPEECH_FORMATS): string {
  const [open, close] = INLINE_SPEECH_FORMATS[format]
  return `${latex.slice(0, range.start)}${open}${latex.slice(range.start, range.end)}${close}${latex.slice(range.end)}`
}

function stripHeadingWrapper(latex: string): string {
  const trimmed = latex.trim()
  for (const { command } of HEADING_COMMANDS) {
    if (!trimmed.startsWith(command)) continue

    const afterCommand = trimmed.slice(command.length)
    if (afterCommand && !/^\s*(?:\{|$)/.test(afterCommand)) continue

    return readLatexGroup(trimmed, command.length) ?? afterCommand.trim()
  }

  return latex
}

function formatWholeRowLatex(latex: string, format: TextFormatCommand): string {
  if (format === 'heading1' || format === 'heading2' || format === 'heading3' || format === 'heading4') {
    const level = Number(format.slice(-1)) as 1 | 2 | 3 | 4
    return `${HEADING_COMMAND_BY_LEVEL[level]}{${stripHeadingWrapper(latex)}}`
  }

  if (format === 'bulletList' || format === 'numberedList') {
    const [open, close] = LIST_SPEECH_FORMATS[format]
    return `${open}${latex || ' '}${close}`
  }

  const inlineFormat = format === 'bold' || format === 'italic' || format === 'underline' ? format : null
  if (!inlineFormat) return latex

  const [open, close] = INLINE_SPEECH_FORMATS[inlineFormat]
  return `${open}${latex}${close}`
}

type RowCaseTransform = 'capitalizeWords' | 'sentenceCase' | 'lowercase'

function transformLatexRowTextCase(latex: string, transform: RowCaseTransform): string {
  let result = ''
  let capitalizeNextWord = transform === 'capitalizeWords' || transform === 'sentenceCase'
  let transformedSentenceStart = false

  for (let index = 0; index < latex.length; index += 1) {
    const char = latex[index]
    const commandMatch = /^\\[A-Za-z]+/.exec(latex.slice(index))
    if (commandMatch) {
      result += commandMatch[0]
      index += commandMatch[0].length - 1
      continue
    }

    if (!/[A-Za-z]/.test(char)) {
      result += char
      capitalizeNextWord = transform === 'capitalizeWords'
        || (transform === 'sentenceCase' && !transformedSentenceStart)
      continue
    }

    if (transform === 'lowercase') {
      result += char.toLowerCase()
      continue
    }

    if (capitalizeNextWord && (transform !== 'sentenceCase' || !transformedSentenceStart)) {
      result += char.toUpperCase()
      transformedSentenceStart = true
    } else {
      result += char
    }
    capitalizeNextWord = false
  }

  return result
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

function speechPlainTextToLatex(text: string): string {
  return Array.from(text).map((char) => {
    if (char === '\\') return '\\textbackslash{}'
    if (char === '{' || char === '}') return `\\${char}`
    return char
  }).join('')
}

function changedLatexRange(previousLatex: string, nextLatex: string): CorrectionHighlightRange | null {
  if (previousLatex === nextLatex) return null

  let prefixLength = 0
  const maxPrefixLength = Math.min(previousLatex.length, nextLatex.length)
  while (prefixLength < maxPrefixLength && previousLatex[prefixLength] === nextLatex[prefixLength]) {
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < previousLatex.length - prefixLength
    && suffixLength < nextLatex.length - prefixLength
    && previousLatex[previousLatex.length - 1 - suffixLength] === nextLatex[nextLatex.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  let start = prefixLength
  let end = nextLatex.length - suffixLength
  if (end <= start) {
    if (nextLatex.length === 0) return null
    start = Math.max(0, Math.min(start, nextLatex.length - 1))
    end = Math.min(nextLatex.length, start + 1)
  }

  return {
    start,
    end,
    revision: Date.now(),
  }
}

function confirmDeleteRows(rowCount: number): boolean {
  if (rowCount <= 0) return false

  return window.confirm(rowCount === 1
    ? 'Delete this row?'
    : `Delete ${rowCount} selected rows?`)
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
  const initialSpeechAccelerationRef = useRef<AppSettingsPayload['speechAcceleration']>(FALLBACK_APP_SETTINGS.speechAcceleration)
  const initialSpeechInferenceRuntimeRef = useRef<AppSettingsPayload['speechInferenceRuntime']>(FALLBACK_APP_SETTINGS.speechInferenceRuntime)
  const initialTransformersMtpRef = useRef(FALLBACK_APP_SETTINGS.transformersMtp)
  const [isDirty, setIsDirty] = useState(false)
  const [isTableOfContentsOpen, setIsTableOfContentsOpen] = useState(readStoredTableOfContentsOpen)
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false)
  const [linkPrompt, setLinkPrompt] = useState<{ selection: EditorSelectionState | null; url: string } | null>(null)
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(() => new Set())
  const [copyDefaultFormat, setCopyDefaultFormat] = useState<CopyAsFormat>('png')
  const [speechCorrectionHighlight, setSpeechCorrectionHighlight] = useState<SpeechCorrectionHighlight>(null)
  const [isGemmaProcessing, setIsGemmaProcessing] = useState(false)
  const [helpMenuRequest, setHelpMenuRequest] = useState<HelpMenuRequest | null>(null)
  const rowSelectionAnchorRef = useRef<string | null>(null)
  const lastActiveCellIdRef = useRef<string | null>(null)
  const speechDocumentRef = useRef<NotebookDocument | null>(null)
  const speechActiveCellIdRef = useRef<string | null>(null)
  const lastSpeechInsertionRef = useRef<LastSpeechInsertion | null>(null)
  const allowWindowCloseRef = useRef(false)

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
      initialSpeechAccelerationRef.current = settings.speechAcceleration
      initialSpeechInferenceRuntimeRef.current = settings.speechInferenceRuntime
      initialTransformersMtpRef.current = settings.transformersMtp
      setDocument(nextDocument)
      speechDocumentRef.current = nextDocument
      setFilePath(null)
      setDocumentRevision((current) => current + 1)
      setActiveCellId(nextDocument.cells[0]?.id ?? null)
      speechActiveCellIdRef.current = nextDocument.cells[0]?.id ?? null
      lastActiveCellIdRef.current = nextDocument.cells[0]?.id ?? null
      setIsDirty(false)
      setIsBootstrapped(true)
    })()
  }, [])

  useEffect(() => {
    speechDocumentRef.current = document
  }, [document])

  useEffect(() => {
    speechActiveCellIdRef.current = activeCellId
    if (activeCellId !== null) {
      lastActiveCellIdRef.current = activeCellId
    }
  }, [activeCellId])

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
    if (update.speechModelSize || update.speechAcceleration || update.speechInferenceRuntime || update.transformersMtp !== undefined) {
      setIsModelRestartRequired(
        nextSettings.speechModelSize !== initialSpeechModelSizeRef.current
        || nextSettings.speechAcceleration !== initialSpeechAccelerationRef.current
        || nextSettings.speechInferenceRuntime !== initialSpeechInferenceRuntimeRef.current
        || nextSettings.transformersMtp !== initialTransformersMtpRef.current,
      )
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
    speechDocumentRef.current = nextDocument
    setFilePath(nextPath)
    setDocumentRevision((current) => current + 1)
    setActiveCellId(nextDocument.cells[0]?.id ?? null)
    speechActiveCellIdRef.current = nextDocument.cells[0]?.id ?? null
    lastActiveCellIdRef.current = nextDocument.cells[0]?.id ?? null
    setUndoStack([])
    setRedoStack([])
    setPendingSelectionRestore(null)
    setSelectedCellIds(new Set())
    setSpeechCorrectionHighlight(null)
    rowSelectionAnchorRef.current = null
    typingHistoryGroupRef.current = null
    lastSpeechInsertionRef.current = null
    setIsDirty(false)
  }

  const hasUnsavedDocumentRequiringConfirmation = useCallback(() => {
    if (!document || !isDirty) return false

    const currentDocument = documentWithVisibleEditorState(document)
    return Boolean(filePath) || !isDocumentBlank(currentDocument)
  }, [document, documentWithVisibleEditorState, filePath, isDirty])

  const confirmCloseCurrentDocument = useCallback(() => {
    if (!hasUnsavedDocumentRequiringConfirmation()) return true

    return window.confirm('Close without saving?\n\nUnsaved changes will be discarded.')
  }, [hasUnsavedDocumentRequiringConfirmation])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowWindowCloseRef.current || !hasUnsavedDocumentRequiringConfirmation()) return

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedDocumentRequiringConfirmation])

  const handleNewNotebook = async () => {
    if (!confirmCloseCurrentDocument()) return

    const nextDocument = await window.eqoustics.createNotebook()
    replaceDocument(nextDocument, null)
  }

  const handleOpenNotebook = async () => {
    if (!confirmCloseCurrentDocument()) return

    const opened = await window.eqoustics.openNotebook()

    if (!opened) {
      return
    }

    const parsed = parseNotebookFromLatex(opened.content, titleFromPath(opened.path))
    replaceDocument(parsed, opened.path)
    await refreshRecentFiles()
  }

  const handleOpenRecentFile = async (recentFilePath: string) => {
    if (!confirmCloseCurrentDocument()) return

    const opened = await window.eqoustics.openNotebookAtPath(recentFilePath)
    const parsed = parseNotebookFromLatex(opened.content, titleFromPath(opened.path))
    replaceDocument(parsed, opened.path)
    await refreshRecentFiles()
  }

  const handleCloseWindow = useCallback(() => {
    if (!confirmCloseCurrentDocument()) return

    allowWindowCloseRef.current = true
    void window.eqoustics.windowControl('close')
  }, [confirmCloseCurrentDocument])

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
      speechDocumentRef.current = nextDocument
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
    speechDocumentRef.current = nextDocument
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
    speechDocumentRef.current = nextDocument
    setDocumentRevision((current) => current + 1)
    const nextActiveCellId = entry.activeCellId && nextDocument.cells.some((cell) => cell.id === entry.activeCellId)
      ? entry.activeCellId
      : nextDocument.cells[0]?.id ?? null
    setActiveCellId(nextActiveCellId)
    speechActiveCellIdRef.current = nextActiveCellId
    lastActiveCellIdRef.current = nextActiveCellId
    setPendingSelectionRestore(entry.selection)
    activeCellHandleRef.current = null
    typingHistoryGroupRef.current = null
    lastSpeechInsertionRef.current = null
    setSpeechCorrectionHighlight(null)
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
    setSpeechCorrectionHighlight(null)
    lastSpeechInsertionRef.current = null
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

  const focusCellEditorById = useCallback((cellId: string) => {
    window.requestAnimationFrame(() => {
      const row = documentShellRef.current?.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
      const editor = row?.querySelector<HTMLElement>('.visual-math-editor, .latex-source-editor')
      if (!row || !editor) return

      row.scrollIntoView({ block: 'nearest' })
      editor.focus()

      if (editor instanceof HTMLTextAreaElement) {
        const end = editor.value.length
        editor.setSelectionRange(end, end)
        return
      }

      const selection = window.getSelection()
      if (!selection) return

      const range = window.document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    })
  }, [])

  const handleRemoveCell = (cellId: string) => {
    if (!document) {
      return
    }

    if (!confirmDeleteRows(1)) {
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
    speechActiveCellIdRef.current = nextCell.id
    lastActiveCellIdRef.current = nextCell.id
    focusCellEditorById(nextCell.id)

    const speechDocument = speechDocumentRef.current
    if (speechDocument) {
      const targetIndex = speechDocument.cells.findIndex((cell) => cell.id === targetCellId)
      if (targetIndex >= 0) {
        const cells = [...speechDocument.cells]
        cells.splice(targetIndex + (position === 'after' ? 1 : 0), 0, nextCell)
        speechDocumentRef.current = { ...speechDocument, cells }
      }
    }

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
    speechActiveCellIdRef.current = nextCells[nextCells.length - 1].id
    lastActiveCellIdRef.current = nextCells[nextCells.length - 1].id
    focusCellEditorById(nextCells[nextCells.length - 1].id)

    const speechDocument = speechDocumentRef.current
    if (speechDocument) {
      const targetIndex = speechDocument.cells.findIndex((cell) => cell.id === targetCellId)
      if (targetIndex >= 0) {
        const cells = [...speechDocument.cells]
        cells.splice(targetIndex + 1, 0, ...nextCells)
        speechDocumentRef.current = { ...speechDocument, cells }
      }
    }

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

  const fallbackCellId = useCallback((sourceDocument: NotebookDocument) => {
    if (speechActiveCellIdRef.current && sourceDocument.cells.some((cell) => cell.id === speechActiveCellIdRef.current)) {
      return speechActiveCellIdRef.current
    }
    if (activeCellId && sourceDocument.cells.some((cell) => cell.id === activeCellId)) {
      return activeCellId
    }
    if (lastActiveCellIdRef.current && sourceDocument.cells.some((cell) => cell.id === lastActiveCellIdRef.current)) {
      return lastActiveCellIdRef.current
    }

    return sourceDocument.cells[0]?.id ?? null
  }, [activeCellId])

  const activateCellForExternalInput = useCallback((cellId: string | null) => {
    if (!cellId) return

    speechActiveCellIdRef.current = cellId
    lastActiveCellIdRef.current = cellId
    setActiveCellId(cellId)
    setSelectedCellIds(new Set())
    rowSelectionAnchorRef.current = null
    window.requestAnimationFrame(() => {
      documentShellRef.current
        ?.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }, [])

  const appendToCellLatex = useCallback((cellId: string, text: string, sourceDocument: NotebookDocument, trackSpeechInsertion = false) => {
    const visibleDocument = documentWithVisibleEditorState(sourceDocument)
    const currentCell = visibleDocument.cells.find((cell) => cell.id === cellId)
    const currentLatex = currentCell?.latex ?? ''
    const separator = currentLatex.length > 0 && text.length > 0 && !/\s$/.test(currentLatex) ? ' ' : ''
    const nextLatex = `${currentLatex}${separator}${text}`
    const insertedStart = currentLatex.length + separator.length
    const nextDocument = {
      ...visibleDocument,
      cells: visibleDocument.cells.map((cell) => (
        cell.id === cellId ? { ...cell, latex: nextLatex } : cell
      )),
    }

    setSpeechCorrectionHighlight(null)
    activateCellForExternalInput(cellId)
    speechDocumentRef.current = nextDocument
    updateDocument((current) => ({ ...current, cells: nextDocument.cells }), { captureVisibleEditorState: false, changedCellId: cellId, changeKind: 'insert' })
    lastSpeechInsertionRef.current = trackSpeechInsertion
      ? { cellId, start: insertedStart, end: insertedStart + text.length }
      : null
    focusCellEditorById(cellId)
  }, [activateCellForExternalInput, documentWithVisibleEditorState, focusCellEditorById, updateDocument])

  const handleInsertSnippet = (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template' | 'func-slot') => {
    const targetCellId = document ? fallbackCellId(document) : null
    if (activeCellId === null && document) {
      activateCellForExternalInput(targetCellId)
    }

    if (!activeCellHandleRef.current && targetCellId && document) {
      appendToCellLatex(targetCellId, snippet, document)
      return
    }

    activeCellHandleRef.current?.insert(snippet, mode)
  }

  const updateCurrentRowLatexFromSpeechCommand = useCallback((
    cellId: string,
    updater: (latex: string) => string,
    changeKind: CellChangeKind = 'format',
  ) => {
    const sourceDocument = speechDocumentRef.current ?? document
    if (!sourceDocument) return

    const visibleDocument = documentWithVisibleEditorState(sourceDocument)
    const currentCell = visibleDocument.cells.find((cell) => cell.id === cellId)
    if (!currentCell) return

    const nextLatex = updater(currentCell.latex ?? '')
    const nextDocument = {
      ...visibleDocument,
      cells: visibleDocument.cells.map((cell) => (
        cell.id === cellId ? { ...cell, latex: nextLatex } : cell
      )),
    }
    setSpeechCorrectionHighlight(null)
    activateCellForExternalInput(cellId)
    speechDocumentRef.current = nextDocument
    updateDocument((current) => ({ ...current, cells: nextDocument.cells }), { captureVisibleEditorState: false, changedCellId: cellId, changeKind })
    focusCellEditorById(cellId)
  }, [activateCellForExternalInput, document, documentWithVisibleEditorState, focusCellEditorById, updateDocument])

  const handleFormatThatCommand = useCallback((cellId: string, format: keyof typeof INLINE_SPEECH_FORMATS) => {
    updateCurrentRowLatexFromSpeechCommand(cellId, (latex) => {
      const speechRange = lastSpeechInsertionRef.current?.cellId === cellId ? lastSpeechInsertionRef.current : null
      const range = speechRange && speechRange.end <= latex.length
        ? { start: speechRange.start, end: speechRange.end }
        : lastLatexTokenRange(latex)
      if (!range || range.start === range.end) return latex

      const nextLatex = wrapLatexRange(latex, range, format)
      const [open, close] = INLINE_SPEECH_FORMATS[format]
      lastSpeechInsertionRef.current = {
        cellId,
        start: range.start,
        end: range.end + open.length + close.length,
      }
      return nextLatex
    })
  }, [updateCurrentRowLatexFromSpeechCommand])

  const handleDeleteThatCommand = useCallback((cellId: string) => {
    updateCurrentRowLatexFromSpeechCommand(cellId, (latex) => {
      const speechRange = lastSpeechInsertionRef.current?.cellId === cellId ? lastSpeechInsertionRef.current : null
      const range = speechRange && speechRange.end <= latex.length
        ? { start: speechRange.start, end: speechRange.end }
        : lastLatexTokenRange(latex)
      lastSpeechInsertionRef.current = null
      if (!range) return latex

      const prefix = latex.slice(0, range.start).replace(/\s+$/, '')
      const suffix = latex.slice(range.end).replace(/^\s+/, '')
      if (!prefix) return suffix
      if (!suffix) return prefix
      return `${prefix} ${suffix}`
    }, 'delete')
  }, [updateCurrentRowLatexFromSpeechCommand])

  const handleFormatRowCommand = useCallback((cellId: string, format: TextFormatCommand) => {
    lastSpeechInsertionRef.current = null
    updateCurrentRowLatexFromSpeechCommand(cellId, (latex) => formatWholeRowLatex(latex, format))
  }, [updateCurrentRowLatexFromSpeechCommand])

  const handleRowCaseCommand = useCallback((cellId: string, transform: RowCaseTransform) => {
    lastSpeechInsertionRef.current = null
    updateCurrentRowLatexFromSpeechCommand(cellId, (latex) => transformLatexRowTextCase(latex, transform))
  }, [updateCurrentRowLatexFromSpeechCommand])

  const handleClearRowCommand = useCallback((cellId: string) => {
    lastSpeechInsertionRef.current = null
    updateCurrentRowLatexFromSpeechCommand(cellId, () => '', 'delete')
  }, [updateCurrentRowLatexFromSpeechCommand])

  const handleDeleteRowCommand = useCallback((cellId: string) => {
    const sourceDocument = speechDocumentRef.current ?? document
    if (!sourceDocument) return

    const visibleDocument = documentWithVisibleEditorState(sourceDocument)
    const deletedIndex = visibleDocument.cells.findIndex((cell) => cell.id === cellId)
    if (deletedIndex < 0) return

    const remainingCells = visibleDocument.cells.filter((cell) => cell.id !== cellId)
    const safeCells = remainingCells.length > 0 ? remainingCells : [createNotebookCell()]
    const nextFocusIndex = Math.max(0, Math.min(deletedIndex, safeCells.length - 1))
    const nextFocusCellId = safeCells[nextFocusIndex]?.id ?? null
    const nextDocument = { ...visibleDocument, cells: safeCells }

    lastSpeechInsertionRef.current = null
    setSelectedCellIds(new Set())
    rowSelectionAnchorRef.current = null
    setActiveCellId(nextFocusCellId)
    speechActiveCellIdRef.current = nextFocusCellId
    lastActiveCellIdRef.current = nextFocusCellId
    speechDocumentRef.current = nextDocument
    updateDocument((current) => ({ ...current, cells: nextDocument.cells }), { captureVisibleEditorState: false, changedCellId: cellId, changeKind: 'delete' })
    if (nextFocusCellId) focusCellEditorById(nextFocusCellId)
  }, [document, documentWithVisibleEditorState, focusCellEditorById, updateDocument])

  const handleSpeechCommand = useCallback((command: SpeechRecognitionCommand, targetCellId: string, rowNumber?: number) => {
    if (!document) return

    switch (command) {
      case 'new-line':
        handleAddCellBelow(targetCellId)
        return
      case 'new-paragraph':
        handleAddCellsBelow(targetCellId, ['', ''])
        return
      case 'go-to-row': {
        const rowIndex = Math.max(0, (rowNumber ?? 1) - 1)
        const nextCellId = document.cells[rowIndex]?.id ?? targetCellId
        activateCellForExternalInput(nextCellId)
        focusCellEditorById(nextCellId)
        return
      }
      case 'go-to-end': {
        const nextCellId = document.cells[document.cells.length - 1]?.id ?? targetCellId
        activateCellForExternalInput(nextCellId)
        focusCellEditorById(nextCellId)
        return
      }
      case 'bold-that':
        handleFormatThatCommand(targetCellId, 'bold')
        return
      case 'italic-that':
        handleFormatThatCommand(targetCellId, 'italic')
        return
      case 'underline-that':
        handleFormatThatCommand(targetCellId, 'underline')
        return
      case 'bold-row':
        handleFormatRowCommand(targetCellId, 'bold')
        return
      case 'italic-row':
        handleFormatRowCommand(targetCellId, 'italic')
        return
      case 'underline-row':
        handleFormatRowCommand(targetCellId, 'underline')
        return
      case 'capitalize-row':
        handleRowCaseCommand(targetCellId, 'capitalizeWords')
        return
      case 'sentence-case-row':
        handleRowCaseCommand(targetCellId, 'sentenceCase')
        return
      case 'lowercase-row':
        handleRowCaseCommand(targetCellId, 'lowercase')
        return
      case 'heading-1':
        handleFormatRowCommand(targetCellId, 'heading1')
        return
      case 'heading-2':
        handleFormatRowCommand(targetCellId, 'heading2')
        return
      case 'heading-3':
        handleFormatRowCommand(targetCellId, 'heading3')
        return
      case 'heading-4':
        handleFormatRowCommand(targetCellId, 'heading4')
        return
      case 'delete-that':
        handleDeleteThatCommand(targetCellId)
        return
      case 'delete-row':
        handleDeleteRowCommand(targetCellId)
        return
      case 'clear-row':
        handleClearRowCommand(targetCellId)
        return
      case 'bullet-that':
        handleFormatRowCommand(targetCellId, 'bulletList')
        return
      case 'number-that':
        handleFormatRowCommand(targetCellId, 'numberedList')
        return
      case 'save-document':
        void persistDocument(false)
        return
      case 'save-document-as':
        void persistDocument(true)
        return
      case 'open-document':
        void handleOpenNotebook()
        return
      case 'undo-that':
        handleUndo()
        return
      case 'redo-that':
        handleRedo()
        return
      case 'help-me':
        setHelpMenuRequest({ id: Date.now(), action: 'toggle' })
        return
      case 'close-help':
        setHelpMenuRequest({ id: Date.now(), action: 'close' })
        return
      case 'minimize-window':
        void window.eqoustics.windowControl('minimize')
        return
      case 'maximize-window':
        void window.eqoustics.windowControl('toggleMaximize')
        return
      case 'close-window':
        handleCloseWindow()
        return
      case 'type-text':
      case 'correction':
      case 'type-correction':
      case 'silence':
      case 'listen':
      case 'deactivate-microphone':
        return
    }
  }, [
    activateCellForExternalInput,
    document,
    focusCellEditorById,
    handleAddCellBelow,
    handleAddCellsBelow,
    handleCloseWindow,
    handleClearRowCommand,
    handleDeleteRowCommand,
    handleDeleteThatCommand,
    handleFormatRowCommand,
    handleFormatThatCommand,
    handleRowCaseCommand,
    handleOpenNotebook,
    handleRedo,
    handleUndo,
    persistDocument,
  ])

  const handleSpeechResult = useCallback((result: SpeechRecognitionResult) => {
    const sourceDocument = speechDocumentRef.current ?? document
    if (!sourceDocument) return

    const targetCellId = fallbackCellId(sourceDocument)
    if (!targetCellId) return
    const { action } = result
    setSpeechCorrectionHighlight(null)

    if (action.type === 'command') {
      handleSpeechCommand(action.command, targetCellId, action.rowNumber)
      return
    }

    if (action.type === 'replace-row') {
      const { latex } = action
      const visibleDocument = documentWithVisibleEditorState(sourceDocument)
      const previousLatex = visibleDocument.cells.find((cell) => cell.id === targetCellId)?.latex ?? ''
      const highlightRange = changedLatexRange(previousLatex, latex)
      const nextDocument = {
        ...visibleDocument,
        cells: visibleDocument.cells.map((cell) => (
          cell.id === targetCellId ? { ...cell, latex } : cell
        )),
      }
      activateCellForExternalInput(targetCellId)
      speechDocumentRef.current = nextDocument
      updateDocument((current) => ({ ...current, cells: nextDocument.cells }), { captureVisibleEditorState: false, changedCellId: targetCellId, changeKind: 'insert' })
      lastSpeechInsertionRef.current = { cellId: targetCellId, start: 0, end: latex.length }
      setSpeechCorrectionHighlight(highlightRange ? { cellId: targetCellId, ...highlightRange } : null)
      focusCellEditorById(targetCellId)
      return
    }

    if (action.type === 'insert') {
      appendToCellLatex(
        targetCellId,
        action.insertMode === 'text' ? speechPlainTextToLatex(action.text) : action.text,
        sourceDocument,
        true,
      )
    }
  }, [activateCellForExternalInput, appendToCellLatex, document, documentWithVisibleEditorState, fallbackCellId, focusCellEditorById, handleSpeechCommand, updateDocument])

  const getCurrentSpeechRowLatex = useCallback(() => {
    const sourceDocument = speechDocumentRef.current ?? document
    if (!sourceDocument) return ''

    const targetCellId = fallbackCellId(sourceDocument)
    if (targetCellId && targetCellId === activeCellId) {
      return activeCellHandleRef.current?.getLatex() ?? sourceDocument.cells.find((cell) => cell.id === targetCellId)?.latex ?? ''
    }

    return targetCellId ? sourceDocument.cells.find((cell) => cell.id === targetCellId)?.latex ?? '' : ''
  }, [activeCellId, document, fallbackCellId])

  const handlePrepareSpeechInput = useCallback(() => {
    if (!document) return
    activateCellForExternalInput(fallbackCellId(document))
  }, [activateCellForExternalInput, document, fallbackCellId])

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
    lastActiveCellIdRef.current = cellId
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

  const handleDeleteSelectedCells = useCallback((skipConfirmation = false) => {
    if (!document || selectedCellIds.size === 0) return

    const selectedRows = document.cells.filter((cell) => selectedCellIds.has(cell.id))
    if (selectedRows.length === 0) return

    if (!skipConfirmation && !confirmDeleteRows(selectedRows.length)) return

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

    if (!document) return

    const selectedRows = document.cells.filter((cell) => selectedCellIds.has(cell.id))
    if (selectedRows.length === 0 || !confirmDeleteRows(selectedRows.length)) return

    await handleCopySelection()
    handleDeleteSelectedCells(true)
  }, [document, handleCopySelection, handleDeleteSelectedCells, selectedCellIds, selectedCellIds.size])

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
            onClick={handleCloseWindow}
            aria-label="Close window"
            title="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </header>
      <EditorToolbar
        hasActiveCell={document.cells.length > 0}
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
        helpMenuRequest={helpMenuRequest}
      />
      <div className="document-scroll-region">
        <FloatingSpeechControl
          disabled={document.cells.length === 0}
          microphoneDeviceId={appSettings.microphoneDeviceId}
          getCurrentRowLatex={getCurrentSpeechRowLatex}
          onBeforeListen={handlePrepareSpeechInput}
          onProcessingChange={setIsGemmaProcessing}
          onSpeechResult={handleSpeechResult}
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
            correctionHighlight={speechCorrectionHighlight}
          />
        </section>
        <CustomScrollbar targetRef={documentShellRef} />
        {isGemmaProcessing ? (
          <span className="gemma-processing-indicator cell-button-tooltip-wrap" role="status" aria-label="Gemma Processing">
            <span className="gemma-processing-spinner" aria-hidden="true" />
            <span className="cell-button-tooltip gemma-processing-tooltip">Gemma Processing</span>
          </span>
        ) : null}
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
