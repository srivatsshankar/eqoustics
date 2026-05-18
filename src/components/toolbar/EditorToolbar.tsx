import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSquare as faSquareRegular } from '@fortawesome/free-regular-svg-icons'
import {
  faBold,
  faChevronDown,
  faFile,
  faFloppyDisk,
  faFolderOpen,
  faHeading,
  faItalic,
  faLink,
  faListOl,
  faListUl,
  faArrowRotateLeft,
  faArrowRotateRight,
  faSquareRootVariable,
  faUnderline,
  faFileExport,
  faFilePdf,
  faFileCode,
  faCopy,
  faScissors,
  faPaste,
  faTrash,
  faMicrophone,
  faPalette,
  faBrain,
  faCheck,
  faPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { CustomScrollbar } from '../scrollbar/CustomScrollbar'
import { CasesDropdown } from './CasesDropdown'
import { MatrixDropdown } from './MatrixDropdown'
import type { TextFormatCommand } from '../cell/CellEditor'
import type { CopyAsFormat } from '../../clipboard/editorClipboard'
import helpMarkdown from '../../help/eqoustics-help.md?raw'
import { LATEX_COMMAND_PREVIEWS } from '../../shared/latexCommandPreviews'
import type { RecentFileEntry } from '../../shared/types/notebook'
import type { AppSettingsPayload, AppSettingsUpdatePayload, SpeechCommandInfo } from '../../shared/ipc/channels'
import packageMetadata from '../../../package.json'

interface EditorToolbarProps {
  hasActiveCell: boolean
  canSave: boolean
  onInsertSnippet: (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template' | 'func-slot') => void
  onFormatText: (format: TextFormatCommand) => void
  onCreateLink: () => void
  onNewNotebook: () => void
  onOpenNotebook: () => void
  onExportPdf: () => void
  onExportLatex: () => void
  onSaveNotebook: () => void
  onSaveNotebookAs: () => void
  recentFiles: RecentFileEntry[]
  onOpenRecentFile: (filePath: string) => void | Promise<void>
  appSettings: AppSettingsPayload
  microphones: MediaDeviceInfo[]
  isModelRestartRequired: boolean
  onUpdateSettings: (update: AppSettingsUpdatePayload) => void | Promise<void>
  onRefreshMicrophones: () => void | Promise<void>
  onRestartApp: () => void | Promise<void>
  onDismissModelRestart: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  canCopyContent: boolean
  canDeleteSelection: boolean
  onCopyContent: () => void | Promise<void>
  onCopyAs: (format: CopyAsFormat) => void | Promise<void>
  onCutContent: () => void | Promise<void>
  onDeleteSelection: () => void
  onMenuVisibilityChange?: (isOpen: boolean) => void
  helpMenuRequest?: { id: number; action: 'toggle' | 'close' } | null
}

interface SymbolItem {
  display: React.ReactNode
  /** The LaTeX string to insert */
  value: string
  title: string
  /**
   * 'cmd'  → structural command (e.g. \frac creates a fraction with empty slots).
   * 'write' → literal LaTeX symbols, operators, etc.
   */
  mode: 'cmd' | 'write' | 'template'
}

interface SymbolGroup {
  label: string
  items: SymbolItem[]
}

interface DelimiterPairOption {
  id: string
  label: string
  preview: React.ReactNode
  left: string
  right: string
}

interface DelimiterSizePreset {
  id: string
  label: string
  left: string
  right: string
}

interface HelpSearchState {
  query: string
  activeIndex: number
  currentIndex: number
}

const SPEECH_COMMAND_CATEGORY_GROUPS: Array<{ category: SpeechCommandInfo['category']; label: string }> = [
  { category: 'navigation', label: 'Navigation' },
  { category: 'formatting', label: 'Formatting' },
  { category: 'microphone', label: 'Microphone' },
]

function commandDisplay(value: string): string {
  if (LATEX_COMMAND_PREVIEWS[value]) return LATEX_COMMAND_PREVIEWS[value]
  if (value.startsWith('\\')) return value.slice(1)
  return value
}

function commandTitle(value: string, label = commandDisplay(value)): string {
  return `${label} (${value})`
}

function commandItems(values: string[]): SymbolItem[] {
  return values.map((value) => ({
    display: commandDisplay(value),
    value,
    title: commandTitle(value),
    mode: value.startsWith('\\') ? 'cmd' : 'write',
  }))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countTextMatches(text: string, query: string): number {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return 0

  return Array.from(text.matchAll(new RegExp(escapeRegExp(normalizedQuery), 'gi'))).length
}

function renderSearchText(text: string, searchState?: HelpSearchState, keyPrefix = 'text'): React.ReactNode[] {
  const query = searchState?.query.trim()
  if (!searchState || !query) return [text]

  const nodes: React.ReactNode[] = []
  const regex = new RegExp(escapeRegExp(query), 'gi')
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    const matchIndex = searchState.currentIndex
    searchState.currentIndex += 1
    nodes.push(
      <mark
        key={`${keyPrefix}-${match.index}-${matchIndex}`}
        className={matchIndex === searchState.activeIndex ? 'help-search-match help-search-match-active' : 'help-search-match'}
      >
        {match[0]}
      </mark>,
    )
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function renderInlineMarkdown(text: string, searchState?: HelpSearchState): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(...renderSearchText(text.slice(cursor, match.index), searchState, `plain-${match.index}`))
    }

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(<code key={`code-${match.index}`}>{renderSearchText(token.slice(1, -1), searchState, `code-${match.index}`)}</code>)
    } else {
      const label = match[2] ?? ''
      const href = match[3] ?? ''
      const isSafeHref = /^(https?:|mailto:)/i.test(href)
      nodes.push(
        <a key={`link-${match.index}`} href={isSafeHref ? href : undefined} target="_blank" rel="noreferrer">
          {renderSearchText(label, searchState, `link-${match.index}`)}
        </a>,
      )
    }

    cursor = match.index + token.length
  }

  if (cursor < text.length) {
    nodes.push(...renderSearchText(text.slice(cursor), searchState, `tail-${cursor}`))
  }

  return nodes
}

function countInlineMarkdownMatches(text: string, query: string): number {
  const pattern = /(`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g
  let cursor = 0
  let count = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      count += countTextMatches(text.slice(cursor, match.index), query)
    }

    count += countTextMatches(match[0].startsWith('`') ? match[0].slice(1, -1) : match[2] ?? '', query)
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    count += countTextMatches(text.slice(cursor), query)
  }

  return count
}

function splitMarkdownTableRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let escaped = false

  for (const char of line.trim()) {
    if (escaped) {
      current += char === '|' ? char : `\\${char}`
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  if (escaped) {
    cells[cells.length - 1] += '\\'
  }
  return cells.slice(1, -1)
}

function renderHelpMarkdown(markdown: string, searchState?: HelpSearchState): React.ReactNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const nodes: React.ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      const children = renderInlineMarkdown(headingMatch[2], searchState)
      if (level === 1) nodes.push(<h1 key={index}>{children}</h1>)
      else if (level === 2) nodes.push(<h2 key={index}>{children}</h2>)
      else if (level === 3) nodes.push(<h3 key={index}>{children}</h3>)
      else nodes.push(<h4 key={index}>{children}</h4>)
      index += 1
      continue
    }

    if (
      trimmed.startsWith('|')
      && index + 1 < lines.length
      && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      const headerCells = splitMarkdownTableRow(trimmed)
      const rows: string[][] = []
      index += 2

      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitMarkdownTableRow(lines[index]))
        index += 1
      }

      nodes.push(
        <table key={index}>
          <thead>
            <tr>
              {headerCells.map((cell, cellIndex) => (
                <th key={cellIndex}>{renderInlineMarkdown(cell, searchState)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {headerCells.map((_cell, cellIndex) => (
                  <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] ?? '', searchState)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    const listMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(trimmed)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1])
      const items: string[] = []
      while (index < lines.length) {
        const itemMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(lines[index].trim())
        if (!itemMatch || /\d+\./.test(itemMatch[1]) !== ordered) break
        items.push(itemMatch[2])
        index += 1
      }

      const listItems = items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderInlineMarkdown(item, searchState)}</li>
      ))
      nodes.push(ordered ? <ol key={index}>{listItems}</ol> : <ul key={index}>{listItems}</ul>)
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,4})\s+/.test(lines[index].trim())
      && !/^([-*]|\d+\.)\s+/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }

    nodes.push(<p key={index}>{renderInlineMarkdown(paragraphLines.join(' '), searchState)}</p>)
  }

  return nodes
}

function countHelpMarkdownMatches(markdown: string, query: string): number {
  if (!query.trim()) return 0

  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let index = 0
  let count = 0

  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (!trimmed) {
      index += 1
      continue
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      count += countInlineMarkdownMatches(headingMatch[2], query)
      index += 1
      continue
    }

    if (
      trimmed.startsWith('|')
      && index + 1 < lines.length
      && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      splitMarkdownTableRow(trimmed).forEach((cell) => {
        count += countInlineMarkdownMatches(cell, query)
      })
      index += 2

      while (index < lines.length && lines[index].trim().startsWith('|')) {
        splitMarkdownTableRow(lines[index]).forEach((cell) => {
          count += countInlineMarkdownMatches(cell, query)
        })
        index += 1
      }
      continue
    }

    const listMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(trimmed)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1])
      while (index < lines.length) {
        const itemMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(lines[index].trim())
        if (!itemMatch || /\d+\./.test(itemMatch[1]) !== ordered) break
        count += countInlineMarkdownMatches(itemMatch[2], query)
        index += 1
      }
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,4})\s+/.test(lines[index].trim())
      && !/^([-*]|\d+\.)\s+/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    count += countInlineMarkdownMatches(paragraphLines.join(' '), query)
  }

  return count
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+|mailto:[^)]+)\)/g, '<a href="$2">$1</a>')
}

function helpMarkdownToPdfHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const headings = lines
    .map((line) => /^(#{2,4})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match, index) => ({
      id: `section-${index + 1}`,
      level: match[1].length,
      title: match[2],
    }))
  let headingIndex = 0
  let index = 0
  const blocks: string[] = []

  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (!trimmed || /^#\s+/.test(trimmed)) {
      index += 1
      continue
    }

    const headingMatch = /^(#{2,4})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      const heading = headings[headingIndex]
      headingIndex += 1
      const tag = `h${Math.min(level, 4)}`
      blocks.push(`<section class="manual-section"><${tag} id="${heading.id}">${inlineMarkdownToHtml(heading.title)}</${tag}>`)
      index += 1
      continue
    }

    if (
      trimmed.startsWith('|')
      && index + 1 < lines.length
      && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      const headerCells = splitMarkdownTableRow(trimmed)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitMarkdownTableRow(lines[index]))
        index += 1
      }
      blocks.push(`<table><thead><tr>${headerCells.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headerCells.map((_cell, cellIndex) => `<td>${inlineMarkdownToHtml(row[cellIndex] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }

    const listMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(trimmed)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1])
      const tag = ordered ? 'ol' : 'ul'
      const items: string[] = []
      while (index < lines.length) {
        const itemMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(lines[index].trim())
        if (!itemMatch || /\d+\./.test(itemMatch[1]) !== ordered) break
        items.push(`<li>${inlineMarkdownToHtml(itemMatch[2])}</li>`)
        index += 1
      }
      blocks.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,4})\s+/.test(lines[index].trim())
      && !/^([-*]|\d+\.)\s+/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    blocks.push(`<p>${inlineMarkdownToHtml(paragraphLines.join(' '))}</p>`)
  }

  const closedBlocks = blocks.join('\n').replace(/(<section class="manual-section">)/g, '</section>$1').replace(/^<\/section>/, '') + '</section>'
  const toc = headings.map((heading) => `<li class="toc-level-${heading.level}"><a href="#${heading.id}">${inlineMarkdownToHtml(heading.title)}</a></li>`).join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Eqoustics Manual</title>
    <style>
      body { margin: 0; padding: 48px 56px; color: #111827; font-family: "Segoe UI", Arial, sans-serif; line-height: 1.45; }
      h1 { margin: 0 0 1rem; font-size: 32px; }
      h2 { font-size: 24px; margin: 0 0 1rem; }
      h3 { font-size: 18px; margin: 1rem 0 0.5rem; }
      h4 { font-size: 15px; margin: 0.9rem 0 0.45rem; }
      p { margin: 0 0 0.75rem; }
      code { font-family: Consolas, "Liberation Mono", monospace; background: #f1f5f9; padding: 0.06rem 0.18rem; border-radius: 3px; }
      .manual-cover { break-after: page; }
      .manual-toc { break-after: page; }
      .manual-toc ol { padding-left: 1.25rem; }
      .toc-level-3 { margin-left: 1rem; }
      .toc-level-4 { margin-left: 2rem; }
      .manual-section { break-before: page; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 5px; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #f8fafc; text-align: left; }
      tr { break-inside: avoid; }
      @page { margin: 0.55in; }
    </style>
  </head>
  <body>
    <section class="manual-cover">
      <h1>Eqoustics Manual</h1>
      <p>Reference instructions for using Eqoustics.</p>
    </section>
    <nav class="manual-toc">
      <h2>Table of Contents</h2>
      <ol>${toc}</ol>
    </nav>
    ${closedBlocks}
  </body>
</html>`
}

function latexSlotItem(display: React.ReactNode, value: string, title = commandTitle(value, typeof display === 'string' ? display : value)): SymbolItem {
  return { display, value, title, mode: 'write' }
}

const Slot = () => (
  <span className="symbol-dropdown-item-variant-slot" aria-hidden="true">
    <FontAwesomeIcon icon={faSquareRegular} />
  </span>
)

const FractionDisplay = () => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', fontSize: '0.8em', lineHeight: 1 }}>
    <Slot />
    <div style={{ width: '100%', height: '1px', backgroundColor: 'currentColor', margin: '2px 0' }} />
    <Slot />
  </div>
)

const DefiniteIntegralDisplay = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', lineHeight: 1 }}>
    <span style={{ fontSize: '1.35em', lineHeight: 1 }}>∫</span>
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginLeft: '1px', fontSize: '0.68em' }}>
      <Slot />
      <Slot />
    </span>
  </span>
)

const TextFractionDisplay = ({ numerator, denominator }: { numerator: string; denominator: string }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', fontSize: '0.8em', lineHeight: 1 }}>
    <span>{numerator}</span>
    <div style={{ width: '100%', height: '1px', backgroundColor: 'currentColor', margin: '2px 0' }} />
    <span>{denominator}</span>
  </div>
)

const ExtensibleArrow = ({ arrow }: { arrow: string }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', lineHeight: 1, gap: '2px' }}>
    <Slot />
    <span>{arrow}</span>
  </div>
)

const CancelPreview = ({ kind }: { kind: 'cancel' | 'bcancel' | 'xcancel' | 'sout' }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '1px 3px',
      lineHeight: 1,
    }}
  >
    <Slot />
    {(kind === 'cancel' || kind === 'xcancel') && (
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid currentColor', transform: 'rotate(-18deg)' }} />
    )}
    {(kind === 'bcancel' || kind === 'xcancel') && (
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid currentColor', transform: 'rotate(18deg)' }} />
    )}
    {kind === 'sout' && (
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid currentColor' }} />
    )}
  </span>
)

const SpaceDisplay = ({ width, label, isNegative = false }: { width: number; label: string; isNegative?: boolean }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', gap: '2px' }} title={label}>
    <div style={{
      width: `${width}px`,
      minWidth: '2px',
      height: '10px',
      borderLeft: '1px solid currentColor',
      borderRight: '1px solid currentColor',
      backgroundColor: isNegative ? 'rgba(255, 0, 0, 0.2)' : 'currentColor',
      opacity: isNegative ? 1 : 0.3,
      position: 'relative'
    }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', backgroundColor: 'currentColor', transform: 'translateY(-50%)' }} />
    </div>
    <span style={{ fontSize: '0.6em', opacity: 0.7, whiteSpace: 'nowrap' }}>{label}</span>
  </div>
)

const NewlineDisplay = ({ label }: { label: string }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', gap: '2px' }} title={label}>
    <span style={{ fontSize: '1.1em', lineHeight: 1 }}>{'\u21b5'}</span>
    <span style={{ fontSize: '0.6em', opacity: 0.7, whiteSpace: 'nowrap' }}>{label}</span>
  </div>
)


// SVG components for accent marks in toolbar previews
const s = { height: '1em', display: 'block', width: '100%' } as const
const sd = { height: '0.6em', display: 'block', width: '100%' } as const
const WideHatSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 60" style={s}><polyline points="4,56 50,4 96,56" fill="none" stroke="currentColor" strokeWidth={7} strokeLinejoin="miter" /></svg>
const WideTildeSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 45" style={s}><path d="M4,36 C18,8 38,8 50,22 C62,36 82,36 96,8" fill="none" stroke="currentColor" strokeWidth={7} /></svg>
const LineSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 8" style={{ height: '0.14em', display: 'block', width: '100%' }}><line x1="0" y1="4" x2="100" y2="4" stroke="currentColor" strokeWidth={8} /></svg>
const GraveSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 55 80" style={s}><line x1="44" y1="6" x2="11" y2="74" stroke="currentColor" strokeWidth={11} strokeLinecap="round" /></svg>
const AcuteSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 55 80" style={s}><line x1="11" y1="74" x2="44" y2="6" stroke="currentColor" strokeWidth={11} strokeLinecap="round" /></svg>
const BreveSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 55" style={{ ...s, height: '0.9em' }}><path d="M5,8 C5,52 95,52 95,8" fill="none" stroke="currentColor" strokeWidth={9} /></svg>
const CheckSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 60" style={{ ...s, height: '0.9em' }}><polyline points="4,5 50,55 96,5" fill="none" stroke="currentColor" strokeWidth={9} strokeLinejoin="miter" /></svg>
const DotSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 30" style={sd}><circle cx="50" cy="15" r="14" fill="currentColor" /></svg>
const DdotSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 30" style={sd}><circle cx="28" cy="15" r="12" fill="currentColor" /><circle cx="72" cy="15" r="12" fill="currentColor" /></svg>
const DddotSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 30" style={sd}><circle cx="16" cy="15" r="11" fill="currentColor" /><circle cx="50" cy="15" r="11" fill="currentColor" /><circle cx="84" cy="15" r="11" fill="currentColor" /></svg>
const DdddotSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 30" style={sd}><circle cx="12" cy="15" r="9" fill="currentColor" /><circle cx="37" cy="15" r="9" fill="currentColor" /><circle cx="63" cy="15" r="9" fill="currentColor" /><circle cx="88" cy="15" r="9" fill="currentColor" /></svg>
const RingSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 70" style={s}><circle cx="50" cy="35" r="26" fill="none" stroke="currentColor" strokeWidth={12} /></svg>
const DoubleAcuteSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 80" style={s}><line x1="10" y1="72" x2="40" y2="8" stroke="currentColor" strokeWidth={10} strokeLinecap="round" /><line x1="60" y1="72" x2="90" y2="8" stroke="currentColor" strokeWidth={10} strokeLinecap="round" /></svg>
const LeftArrowSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 20" style={s}><line x1="8" y1="10" x2="99" y2="10" stroke="currentColor" strokeWidth={5} /><polyline points="30,2 8,10 30,18" fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="miter" /></svg>
const RightArrowSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 20" style={s}><line x1="1" y1="10" x2="92" y2="10" stroke="currentColor" strokeWidth={5} /><polyline points="70,2 92,10 70,18" fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="miter" /></svg>
const LeftRightArrowSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 20" style={s}><line x1="8" y1="10" x2="92" y2="10" stroke="currentColor" strokeWidth={5} /><polyline points="30,2 8,10 30,18" fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="miter" /><polyline points="70,2 92,10 70,18" fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="miter" /></svg>
const LeftHarpoonSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 18" style={s}><line x1="8" y1="10" x2="99" y2="10" stroke="currentColor" strokeWidth={5} /><line x1="8" y1="10" x2="30" y2="2" stroke="currentColor" strokeWidth={5} /></svg>
const RightHarpoonSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 18" style={s}><line x1="1" y1="10" x2="92" y2="10" stroke="currentColor" strokeWidth={5} /><line x1="92" y1="10" x2="70" y2="2" stroke="currentColor" strokeWidth={5} /></svg>
const OverbraceSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 30" style={{ height: '0.7em', display: 'block', width: '100%' }}><path d="M2,28 C2,12 42,10 50,2 C58,10 98,12 98,28" fill="none" stroke="currentColor" strokeWidth={3.5} /></svg>
const UnderbraceSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 30" style={{ height: '0.7em', display: 'block', width: '100%' }}><path d="M2,2 C2,18 42,20 50,28 C58,20 98,18 98,2" fill="none" stroke="currentColor" strokeWidth={3.5} /></svg>
const OverbracketSvg = () => <svg preserveAspectRatio="none" viewBox="0 0 100 28" style={{ height: '0.7em', display: 'block', width: '100%' }}><polyline points="4,26 4,4 96,4 96,26" fill="none" stroke="currentColor" strokeWidth={4} strokeLinejoin="miter" strokeLinecap="square" /></svg>

const MathAccentPreview = ({ mark, markEl, placement = 'over', wide = false }: { mark?: string; markEl?: React.ReactNode; placement?: 'over' | 'under'; wide?: boolean }) => {
  const markContent = markEl ?? mark
  return (
    <span className={`math-accent math-accent-${placement}`} style={{ fontSize: '0.72em' }}>
      {placement === 'over' && <span className="math-accent-mark" style={{ color: 'currentColor' }}>{markContent}</span>}
      <span style={{ fontStyle: 'italic' }}>{wide ? 'xp' : 'x'}</span>
      {placement === 'under' && <span className="math-accent-mark" style={{ color: 'currentColor' }}>{markContent}</span>}
    </span>
  )
}

const OverbracePreview = ({ withAnnotation = true }: { withAnnotation?: boolean }) => (
  <span className="math-accent math-brace-accent math-accent-over" style={{ fontSize: '0.72em', verticalAlign: 'middle' }}>
    {withAnnotation ? <span className="math-slot" data-slot="annotation" style={{ fontStyle: 'italic', fontSize: '0.68em' }}>n</span> : null}
    <span className="math-accent-mark math-brace-accent-mark" style={{ color: 'currentColor' }}><OverbraceSvg /></span>
    <span style={{ fontStyle: 'italic' }}>xp</span>
  </span>
)

const UnderbracePreview = ({ withAnnotation = true }: { withAnnotation?: boolean }) => (
  <span className="math-accent math-brace-accent math-accent-under" style={{ fontSize: '0.72em', verticalAlign: 'middle' }}>
    <span style={{ fontStyle: 'italic' }}>xp</span>
    <span className="math-accent-mark math-brace-accent-mark" style={{ color: 'currentColor' }}><UnderbraceSvg /></span>
    {withAnnotation ? <span className="math-slot" data-slot="annotation" style={{ fontStyle: 'italic', fontSize: '0.68em' }}>n</span> : null}
  </span>
)

const OverbracketPreview = ({ withAnnotation = true }: { withAnnotation?: boolean }) => (
  <span className="math-accent math-brace-accent math-accent-over" style={{ fontSize: '0.72em', verticalAlign: 'middle' }}>
    {withAnnotation ? <span className="math-slot" data-slot="annotation" style={{ fontStyle: 'italic', fontSize: '0.68em' }}>n</span> : null}
    <span className="math-accent-mark math-brace-accent-mark" style={{ color: 'currentColor' }}><OverbracketSvg /></span>
    <span style={{ fontStyle: 'italic' }}>xp</span>
  </span>
)

function slotTemplateKey(value: string): string {
  return value.replace(/\{\s*(?:#\?)?\s*\}/g, '{#?}')
}

function symbolItemDisplay(item: SymbolItem): React.ReactNode {
  return cleanSymbolItemDisplay(item)
}

function symbolItemTitle(item: SymbolItem): string {
  return item.mode === 'cmd' ? commandTitle(item.value) : item.title
}

function cleanSymbolItemDisplay(item: SymbolItem): React.ReactNode {
  if (typeof item.display === 'object' && item.display !== null) return item.display
  if (item.mode === 'cmd') return commandDisplay(item.value)
  if (!item.value.startsWith('\\') && !item.value.includes('#?')) return item.value
  if (item.value === '\\frac{dy}{dx}') return <TextFractionDisplay numerator="dy" denominator="dx" />
  if (item.value.startsWith('\\operatorname')) return item.display

  const key = slotTemplateKey(item.value)
  switch (key) {
    case '\\frac{#?}{#?}':
      return <FractionDisplay />
    case '\\tfrac{#?}{#?}':
      return <span style={{ fontSize: '0.85em' }}><FractionDisplay /></span>
    case '\\dfrac{#?}{#?}':
      return <span style={{ fontSize: '1.15em' }}><FractionDisplay /></span>
    case '\\binom{#?}{#?}':
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', fontSize: '0.8em', lineHeight: 1 }}>
          <span style={{ fontSize: '1.5em', fontWeight: 300, marginRight: '2px' }}>(</span>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}><Slot /><Slot /></div>
          <span style={{ fontSize: '1.5em', fontWeight: 300, marginLeft: '2px' }}>)</span>
        </div>
      )
    case '\\tilde{#?}':
    case '\\~{#?}':
      return <MathAccentPreview markEl={<WideTildeSvg />} />
    case '\\widetilde{#?}':
      return <MathAccentPreview markEl={<WideTildeSvg />} wide />
    case '\\acute{#?}':
    case "\\'{#?}":
      return <MathAccentPreview markEl={<AcuteSvg />} />
    case '\\bar{#?}':
    case '\\={#?}':
      return <MathAccentPreview markEl={<LineSvg />} />
    case '\\breve{#?}':
    case '\\u{#?}':
      return <MathAccentPreview markEl={<BreveSvg />} />
    case '\\check{#?}':
    case '\\v{#?}':
      return <MathAccentPreview markEl={<CheckSvg />} />
    case '\\dot{#?}':
    case '\\.{#?}':
      return <MathAccentPreview markEl={<DotSvg />} />
    case '\\ddot{#?}':
    case '\\"{#?}':
      return <MathAccentPreview markEl={<DdotSvg />} />
    case '\\dddot{#?}':
      return <MathAccentPreview markEl={<DddotSvg />} />
    case '\\ddddot{#?}':
      return <MathAccentPreview markEl={<DdddotSvg />} />
    case '\\grave{#?}':
    case '\\`{#?}':
      return <MathAccentPreview markEl={<GraveSvg />} />
    case '\\hat{#?}':
    case '\\^{#?}':
      return <MathAccentPreview markEl={<WideHatSvg />} />
    case '\\widehat{#?}':
      return <MathAccentPreview markEl={<WideHatSvg />} wide />
    case '\\H{#?}':
      return <MathAccentPreview markEl={<DoubleAcuteSvg />} />
    case '\\mathring{#?}':
    case '\\r{#?}':
      return <MathAccentPreview markEl={<RingSvg />} />
    case '\\vec{#?}':
      return <MathAccentPreview markEl={<RightArrowSvg />} />
    case '\\overrightarrow{#?}':
      return <MathAccentPreview markEl={<RightArrowSvg />} wide />
    case '\\overline{#?}':
      return <MathAccentPreview markEl={<LineSvg />} wide />
    case '\\underline{#?}':
    case '\\underbar{#?}':
      return <MathAccentPreview markEl={<LineSvg />} placement="under" wide />
    case '\\overbrace{#?}^{#?}':
      return <OverbracePreview />
    case '\\overbrace{#?}':
      return <OverbracePreview withAnnotation={false} />
    case '\\underbrace{#?}_{#?}':
      return <UnderbracePreview />
    case '\\underbrace{#?}':
      return <UnderbracePreview withAnnotation={false} />
    case '\\overbracket{#?}^{#?}':
      return <OverbracketPreview />
    case '\\overbracket{#?}':
      return <OverbracketPreview withAnnotation={false} />
    case '\\overleftarrow{#?}':
      return <MathAccentPreview markEl={<LeftArrowSvg />} wide />
    case '\\underleftarrow{#?}':
      return <MathAccentPreview markEl={<LeftArrowSvg />} placement="under" wide />
    case '\\underrightarrow{#?}':
      return <MathAccentPreview markEl={<RightArrowSvg />} placement="under" wide />
    case '\\overleftrightarrow{#?}':
      return <MathAccentPreview markEl={<LeftRightArrowSvg />} wide />
    case '\\underleftrightarrow{#?}':
      return <MathAccentPreview markEl={<LeftRightArrowSvg />} placement="under" wide />
    case '\\overleftharpoon{#?}':
      return <MathAccentPreview markEl={<LeftHarpoonSvg />} wide />
    case '\\overrightharpoon{#?}':
      return <MathAccentPreview markEl={<RightHarpoonSvg />} wide />
    case '{#?} \\pmod{#?}':
      return <><Slot /> (mod <Slot />)</>
    case '{#?} \\pod{#?}':
      return <><Slot /> (<Slot />)</>
    case '{#?}\\mod {#?}':
      return <><Slot /> mod <Slot /></>
    case '\\int_{#?}^{#?}':
      return <DefiniteIntegralDisplay />
    case '\\left\\langle{#?}\\right\\rangle':
      return <>{'\u27e8'}<Slot />{'\u27e9'}</>
    case '\\left\\lvert{#?}\\right\\rangle':
      return <>|<Slot />{'\u27e9'}</>
    case '\\left\\langle{#?}\\right\\rvert':
      return <>{'\u27e8'}<Slot />|</>
    case '\\left\\lbrace{#?}\\right\\rbrace':
      return <>{'{'}<Slot />{'}'}</>
    case '\\boxed{#?}':
      return <span style={{ border: '1px solid currentColor', padding: '2px', display: 'inline-block', lineHeight: 1 }}><Slot /></span>
    case '\\stackrel{#?}{#?}':
      return <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', lineHeight: 1, gap: '2px' }}><span style={{ fontSize: '0.7em' }}><Slot /></span><Slot /></div>
    case '\\phantom{#?}':
      return <span style={{ opacity: 0.65, border: '1px dashed currentColor', padding: '1px' }}><Slot /></span>
    case '\\hphantom{#?}':
      return <span style={{ opacity: 0.65, borderTop: '1px dashed currentColor', borderBottom: '1px dashed currentColor', padding: '1px' }}>{'\u2194'}<Slot />{'\u2194'}</span>
    case '\\vphantom{#?}':
      return <span style={{ opacity: 0.65, borderLeft: '1px dashed currentColor', borderRight: '1px dashed currentColor', padding: '1px' }}>{'\u2195'}<Slot />{'\u2195'}</span>
    case '\\hspace{#?}':
      return <>{'\u2194'} <Slot /></>
    case '\\hspace*{#?}':
      return <>{'\u2194'}* <Slot /></>
    default: {
      const command = key.match(/^\\[a-zA-Z]+\*?/)?.[0] ?? ''
      if (command.startsWith('\\x')) return <ExtensibleArrow arrow={LATEX_COMMAND_PREVIEWS[command] ?? '\u2192'} />
      return command ? commandDisplay(command) : item.display
    }
  }
}

function delimiterPreview(option: DelimiterPairOption): React.ReactNode {
  switch (option.id) {
    case 'paren':
      return <>(<Slot />)</>
    case 'bracket':
      return <>[<Slot />]</>
    case 'brace':
      return <>{'{'}<Slot />{'}'}</>
    case 'angle':
      return <>{'\u27e8'}<Slot />{'\u27e9'}</>
    case 'single-bar':
      return <>|<Slot />|</>
    case 'double-bar':
      return <>{'\u2016'}<Slot />{'\u2016'}</>
    case 'ceiling':
      return <>{'\u2308'}<Slot />{'\u2309'}</>
    case 'floor':
      return <>{'\u230a'}<Slot />{'\u230b'}</>
    case 'double-bracket':
      return <>{'\u27e6'}<Slot />{'\u27e7'}</>
    default:
      return option.preview
  }
}

const GREEK_ALIAS_VALUES = [
  '\\Alpha', '\\Beta', '\\Epsilon', '\\Zeta', '\\Eta', '\\Iota', '\\Kappa', '\\Mu', '\\Nu',
  '\\Omicron', '\\Rho', '\\Tau', '\\Chi', '\\omicron', '\\thetasym', '\\varGamma', '\\varDelta',
  '\\varTheta', '\\varLambda', '\\varXi', '\\varPi', '\\varSigma', '\\varUpsilon', '\\varPhi',
  '\\varPsi', '\\varOmega',
]

const DELIMITER_PAIR_OPTIONS: DelimiterPairOption[] = [
  { id: 'paren', label: 'Parentheses', preview: <>(<Slot />)</>, left: '(', right: ')' },
  { id: 'bracket', label: 'Brackets', preview: <>[<Slot />]</>, left: '[', right: ']' },
  { id: 'brace', label: 'Braces', preview: <>{'{'}<Slot />{'}'}</>, left: '\\lbrace', right: '\\rbrace' },
  { id: 'angle', label: 'Angles', preview: <>⟨<Slot />⟩</>, left: '\\langle', right: '\\rangle' },
  { id: 'single-bar', label: 'Bars', preview: <>|<Slot />|</>, left: '\\lvert', right: '\\rvert' },
  { id: 'double-bar', label: 'Double bars', preview: <>‖<Slot />‖</>, left: '\\lVert', right: '\\rVert' },
  { id: 'ceiling', label: 'Ceiling', preview: <>⌈<Slot />⌉</>, left: '\\lceil', right: '\\rceil' },
  { id: 'floor', label: 'Floor', preview: <>⌊<Slot />⌋</>, left: '\\lfloor', right: '\\rfloor' },
  { id: 'double-bracket', label: 'Double brackets', preview: <>⟦<Slot />⟧</>, left: '\\llbracket', right: '\\rrbracket' },
]

const DELIMITER_SIZE_PRESETS: DelimiterSizePreset[] = [
  { id: 'small', label: 'Small', left: '\\bigl', right: '\\bigr' },
  { id: 'medium', label: 'Medium', left: '\\Bigl', right: '\\Bigr' },
  { id: 'large', label: 'Large', left: '\\biggl', right: '\\biggr' },
  { id: 'largest', label: 'Largest', left: '\\Biggl', right: '\\Biggr' },
]

const RELATIONS_COMMON_ITEMS: SymbolItem[] = [
  { display: '=', value: '=', title: 'Equals', mode: 'write' },
  { display: commandDisplay('\\ne'), value: '\\ne', title: 'Not equal', mode: 'cmd' },
  { display: commandDisplay('\\le'), value: '\\le', title: 'Less or equal', mode: 'cmd' },
  { display: commandDisplay('\\ge'), value: '\\ge', title: 'Greater or equal', mode: 'cmd' },
  { display: commandDisplay('\\approx'), value: '\\approx', title: 'Approximately', mode: 'cmd' },
  { display: commandDisplay('\\propto'), value: '\\propto', title: 'Proportional to', mode: 'cmd' },
]

const RELATIONS_OTHER_VALUES = [
  '<', '>', ':', '\\leq', '\\geq', '\\neq', '\\lt', '\\gt', '\\doteqdot', '\\eqcirc', '\\eqcolon',
  '\\minuscolon', '\\Eqcolon', '\\minuscoloncolon', '\\eqqcolon', '\\equalscolon', '\\Eqqcolon',
  '\\equalscoloncolon', '\\approxcolon', '\\approxcoloncolon', '\\approxeq', '\\asymp', '\\backepsilon',
  '\\backsim', '\\backsimeq', '\\between', '\\bowtie', '\\bumpeq', '\\Bumpeq', '\\circeq',
  '\\colonapprox', '\\Colonapprox', '\\coloncolonapprox', '\\coloneq', '\\colonminus', '\\Coloneq',
  '\\coloncolonminus', '\\coloneqq', '\\colonequals', '\\Coloneqq', '\\coloncolonequals',
  '\\colonsim', '\\Colonsim', '\\coloncolonsim', '\\cong', '\\curlyeqprec', '\\curlyeqsucc',
  '\\dashv', '\\dblcolon', '\\coloncolon', '\\doteq', '\\Doteq', '\\eqsim', '\\eqslantgtr',
  '\\eqslantless', '\\equiv', '\\fallingdotseq', '\\frown', '\\geqq', '\\geqslant', '\\gg',
  '\\ggg', '\\gggtr', '\\gtrapprox', '\\gtreqless', '\\gtreqqless', '\\gtrless', '\\gtrsim',
  '\\imageof', '\\Join', '\\leqq', '\\leqslant', '\\lessapprox', '\\lesseqgtr', '\\lesseqqgtr',
  '\\lessgtr', '\\lesssim', '\\ll', '\\lll', '\\llless', '\\models', '\\multimap', '\\origof',
  '\\owns', '\\parallel', '\\perp', '\\pitchfork', '\\prec', '\\precapprox', '\\preccurlyeq',
  '\\preceq', '\\precsim', '\\risingdotseq', '\\shortmid', '\\shortparallel', '\\sim', '\\simeq',
  '\\smallfrown', '\\smallsmile', '\\smile', '\\sqsubset', '\\sqsubseteq', '\\sqsupset',
  '\\sqsupseteq', '\\sub', '\\sube', '\\Subset', '\\subseteqq', '\\succ', '\\succapprox',
  '\\succcurlyeq', '\\succeq', '\\succsim', '\\supe', '\\Supset', '\\supseteqq', '\\thickapprox',
  '\\thicksim', '\\trianglelefteq', '\\triangleq', '\\trianglerighteq', '\\varpropto',
  '\\vartriangle', '\\vartriangleleft', '\\vartriangleright', '\\vcentcolon', '\\ratio',
  '\\vdash', '\\vDash', '\\Vdash', '\\Vvdash',
]

const RELATIONS_NEGATED_VALUES = [
  '\\not', '\\gnapprox', '\\gneq', '\\gneqq', '\\gnsim', '\\gvertneqq', '\\lnapprox', '\\lneq',
  '\\lneqq', '\\lnsim', '\\lvertneqq', '\\ncong', '\\ne', '\\neq', '\\ngeq', '\\ngeqq',
  '\\ngeqslant', '\\ngtr', '\\nleq', '\\nleqq', '\\nleqslant', '\\nless', '\\nmid',
  '\\notin', '\\notni', '\\nparallel', '\\nprec', '\\npreceq', '\\nshortmid',
  '\\nshortparallel', '\\nsim', '\\nsubseteq', '\\nsubseteqq', '\\nsucc', '\\nsucceq',
  '\\nsupseteq', '\\nsupseteqq', '\\ntriangleleft', '\\ntrianglelefteq', '\\ntriangleright',
  '\\ntrianglerighteq', '\\nvdash', '\\nvDash', '\\nVDash', '\\nVdash', '\\precnapprox',
  '\\precneqq', '\\precnsim', '\\subsetneq', '\\subsetneqq', '\\succnapprox', '\\succneqq',
  '\\succnsim', '\\supsetneq', '\\supsetneqq', '\\varsubsetneq', '\\varsubsetneqq',
  '\\varsupsetneq', '\\varsupsetneqq',
]

const OPERATORS_COMMON_VALUES = [
  '\\sum', '\\prod', '\\coprod', '\\int', '\\intop', '\\smallint', '\\iint', '\\iiint', '\\oint',
  '\\oiint', '\\oiiint', '\\bigotimes', '\\bigoplus', '\\bigodot', '\\biguplus', '\\bigsqcup',
  '\\bigvee', '\\bigwedge', '\\bigcap', '\\bigcup',
]

const OPERATORS_COMMON_ITEMS = commandItems(OPERATORS_COMMON_VALUES)

const OPERATORS_MISC_ITEMS: SymbolItem[] = [
  { display: '+', value: '+', title: 'Plus (+)', mode: 'write' },
  { display: commandDisplay('\\cdot'), value: '\\cdot', title: commandTitle('\\cdot'), mode: 'cmd' },
  { display: commandDisplay('\\gtrdot'), value: '\\gtrdot', title: commandTitle('\\gtrdot'), mode: 'cmd' },
  { display: <><Slot /> (mod <Slot />)</>, value: '{#?} \\pmod{#?}', title: '\\pmod with slots', mode: 'write' },
  { display: '-', value: '-', title: 'Minus (-)', mode: 'write' },
  { display: commandDisplay('\\cdotp'), value: '\\cdotp', title: commandTitle('\\cdotp'), mode: 'cmd' },
  { display: commandDisplay('\\intercal'), value: '\\intercal', title: commandTitle('\\intercal'), mode: 'cmd' },
  { display: <><Slot /> (<Slot />)</>, value: '{#?} \\pod{#?}', title: '\\pod with slots', mode: 'write' },
  { display: '/', value: '/', title: 'Slash (/)', mode: 'write' },
  { display: commandDisplay('\\centerdot'), value: '\\centerdot', title: commandTitle('\\centerdot'), mode: 'cmd' },
  { display: commandDisplay('\\land'), value: '\\land', title: commandTitle('\\land'), mode: 'cmd' },
  { display: commandDisplay('\\rhd'), value: '\\rhd', title: commandTitle('\\rhd'), mode: 'cmd' },
  { display: commandDisplay('*'), value: '*', title: 'Asterisk (*)', mode: 'write' },
  { display: commandDisplay('\\circ'), value: '\\circ', title: commandTitle('\\circ'), mode: 'cmd' },
  { display: commandDisplay('\\leftthreetimes'), value: '\\leftthreetimes', title: commandTitle('\\leftthreetimes'), mode: 'cmd' },
  { display: commandDisplay('\\rightthreetimes'), value: '\\rightthreetimes', title: commandTitle('\\rightthreetimes'), mode: 'cmd' },
  { display: commandDisplay('\\amalg'), value: '\\amalg', title: commandTitle('\\amalg'), mode: 'cmd' },
  { display: commandDisplay('\\circledast'), value: '\\circledast', title: commandTitle('\\circledast'), mode: 'cmd' },
  { display: '..', value: '\\ldotp', title: commandTitle('\\ldotp', '..'), mode: 'cmd' },
  { display: commandDisplay('\\rtimes'), value: '\\rtimes', title: commandTitle('\\rtimes'), mode: 'cmd' },
  { display: '&', value: '\\And', title: commandTitle('\\And', '&'), mode: 'cmd' },
  { display: commandDisplay('\\circledcirc'), value: '\\circledcirc', title: commandTitle('\\circledcirc'), mode: 'cmd' },
  { display: commandDisplay('\\lor'), value: '\\lor', title: commandTitle('\\lor'), mode: 'cmd' },
  { display: commandDisplay('\\setminus'), value: '\\setminus', title: commandTitle('\\setminus'), mode: 'cmd' },
  { display: commandDisplay('\\ast'), value: '\\ast', title: commandTitle('\\ast'), mode: 'cmd' },
  { display: commandDisplay('\\circleddash'), value: '\\circleddash', title: commandTitle('\\circleddash'), mode: 'cmd' },
  { display: commandDisplay('\\lessdot'), value: '\\lessdot', title: commandTitle('\\lessdot'), mode: 'cmd' },
  { display: commandDisplay('\\smallsetminus'), value: '\\smallsetminus', title: commandTitle('\\smallsetminus'), mode: 'cmd' },
  { display: commandDisplay('\\barwedge'), value: '\\barwedge', title: commandTitle('\\barwedge'), mode: 'cmd' },
  { display: commandDisplay('\\Cup'), value: '\\Cup', title: commandTitle('\\Cup'), mode: 'cmd' },
  { display: commandDisplay('\\lhd'), value: '\\lhd', title: commandTitle('\\lhd'), mode: 'cmd' },
  { display: commandDisplay('\\sqcap'), value: '\\sqcap', title: commandTitle('\\sqcap'), mode: 'cmd' },
  { display: commandDisplay('\\bigcirc'), value: '\\bigcirc', title: commandTitle('\\bigcirc'), mode: 'cmd' },
  { display: commandDisplay('\\cup'), value: '\\cup', title: commandTitle('\\cup'), mode: 'cmd' },
  { display: commandDisplay('\\ltimes'), value: '\\ltimes', title: commandTitle('\\ltimes'), mode: 'cmd' },
  { display: commandDisplay('\\sqcup'), value: '\\sqcup', title: commandTitle('\\sqcup'), mode: 'cmd' },
  { display: '%', value: '\\bmod', title: commandTitle('\\bmod', '%'), mode: 'cmd' },
  { display: commandDisplay('\\curlyvee'), value: '\\curlyvee', title: commandTitle('\\curlyvee'), mode: 'cmd' },
  { display: <><Slot /> mod <Slot /></>, value: '{#?}\\mod {#?}', title: '\\mod with slots', mode: 'write' },
  { display: commandDisplay('\\times'), value: '\\times', title: commandTitle('\\times'), mode: 'cmd' },
  { display: commandDisplay('\\boxdot'), value: '\\boxdot', title: commandTitle('\\boxdot'), mode: 'cmd' },
  { display: commandDisplay('\\curlywedge'), value: '\\curlywedge', title: commandTitle('\\curlywedge'), mode: 'cmd' },
  { display: commandDisplay('\\mp'), value: '\\mp', title: commandTitle('\\mp'), mode: 'cmd' },
  { display: commandDisplay('\\unlhd'), value: '\\unlhd', title: commandTitle('\\unlhd'), mode: 'cmd' },
  { display: commandDisplay('\\boxminus'), value: '\\boxminus', title: commandTitle('\\boxminus'), mode: 'cmd' },
  { display: commandDisplay('\\div'), value: '\\div', title: commandTitle('\\div'), mode: 'cmd' },
  { display: commandDisplay('\\odot'), value: '\\odot', title: commandTitle('\\odot'), mode: 'cmd' },
  { display: commandDisplay('\\unrhd'), value: '\\unrhd', title: commandTitle('\\unrhd'), mode: 'cmd' },
  { display: commandDisplay('\\boxplus'), value: '\\boxplus', title: commandTitle('\\boxplus'), mode: 'cmd' },
  { display: commandDisplay('\\divideontimes'), value: '\\divideontimes', title: commandTitle('\\divideontimes'), mode: 'cmd' },
  { display: commandDisplay('\\ominus'), value: '\\ominus', title: commandTitle('\\ominus'), mode: 'cmd' },
  { display: commandDisplay('\\uplus'), value: '\\uplus', title: commandTitle('\\uplus'), mode: 'cmd' },
  { display: commandDisplay('\\boxtimes'), value: '\\boxtimes', title: commandTitle('\\boxtimes'), mode: 'cmd' },
  { display: commandDisplay('\\dotplus'), value: '\\dotplus', title: commandTitle('\\dotplus'), mode: 'cmd' },
  { display: commandDisplay('\\oplus'), value: '\\oplus', title: commandTitle('\\oplus'), mode: 'cmd' },
  { display: commandDisplay('\\vee'), value: '\\vee', title: commandTitle('\\vee'), mode: 'cmd' },
  { display: commandDisplay('\\bullet'), value: '\\bullet', title: commandTitle('\\bullet'), mode: 'cmd' },
  { display: commandDisplay('\\doublebarwedge'), value: '\\doublebarwedge', title: commandTitle('\\doublebarwedge'), mode: 'cmd' },
  { display: commandDisplay('\\otimes'), value: '\\otimes', title: commandTitle('\\otimes'), mode: 'cmd' },
  { display: commandDisplay('\\veebar'), value: '\\veebar', title: commandTitle('\\veebar'), mode: 'cmd' },
  { display: commandDisplay('\\Cap'), value: '\\Cap', title: commandTitle('\\Cap'), mode: 'cmd' },
  { display: commandDisplay('\\doublecap'), value: '\\doublecap', title: commandTitle('\\doublecap'), mode: 'cmd' },
  { display: commandDisplay('\\oslash'), value: '\\oslash', title: commandTitle('\\oslash'), mode: 'cmd' },
  { display: commandDisplay('\\wedge'), value: '\\wedge', title: commandTitle('\\wedge'), mode: 'cmd' },
  { display: commandDisplay('\\cap'), value: '\\cap', title: commandTitle('\\cap'), mode: 'cmd' },
  { display: commandDisplay('\\doublecup'), value: '\\doublecup', title: commandTitle('\\doublecup'), mode: 'cmd' },
  { display: commandDisplay('\\pm'), value: '\\pm', title: commandTitle('\\pm'), mode: 'cmd' },
  { display: commandDisplay('\\plusmn'), value: '\\plusmn', title: commandTitle('\\plusmn'), mode: 'cmd' },
  { display: commandDisplay('\\wr'), value: '\\wr', title: commandTitle('\\wr'), mode: 'cmd' },
]

const ARROWS_COMMON_ITEMS: SymbolItem[] = [
  { display: commandDisplay('\\rightarrow'), value: '\\rightarrow', title: 'Right arrow', mode: 'cmd' },
  { display: commandDisplay('\\leftarrow'), value: '\\leftarrow', title: 'Left arrow', mode: 'cmd' },
  { display: commandDisplay('\\leftrightarrow'), value: '\\leftrightarrow', title: 'Both arrows', mode: 'cmd' },
  { display: commandDisplay('\\uparrow'), value: '\\uparrow', title: 'Up arrow', mode: 'cmd' },
  { display: commandDisplay('\\downarrow'), value: '\\downarrow', title: 'Down arrow', mode: 'cmd' },
  { display: commandDisplay('\\updownarrow'), value: '\\updownarrow', title: 'Up-down arrow', mode: 'cmd' },
  { display: commandDisplay('\\Rightarrow'), value: '\\Rightarrow', title: 'Implies', mode: 'cmd' },
  { display: commandDisplay('\\Leftarrow'), value: '\\Leftarrow', title: 'Implied by', mode: 'cmd' },
  { display: commandDisplay('\\Leftrightarrow'), value: '\\Leftrightarrow', title: 'If and only if', mode: 'cmd' },
  { display: commandDisplay('\\Uparrow'), value: '\\Uparrow', title: 'Double up arrow', mode: 'cmd' },
  { display: commandDisplay('\\Downarrow'), value: '\\Downarrow', title: 'Double down arrow', mode: 'cmd' },
  { display: commandDisplay('\\Updownarrow'), value: '\\Updownarrow', title: 'Double up-down arrow', mode: 'cmd' },
  { display: commandDisplay('\\mapsto'), value: '\\mapsto', title: 'Maps to', mode: 'cmd' },
]

const ARROWS_MORE_VALUES = [
  '\\circlearrowleft', '\\circlearrowright', '\\curvearrowleft', '\\curvearrowright',
  '\\dashleftarrow', '\\dashrightarrow', '\\downdownarrows', '\\downharpoonleft',
  '\\downharpoonright', '\\gets', '\\hookleftarrow', '\\hookrightarrow', '\\iff',
  '\\impliedby', '\\implies', '\\leadsto', '\\Leftarrow', '\\leftarrowtail', '\\leftharpoondown',
  '\\leftharpoonup', '\\leftleftarrows', '\\leftrightarrows', '\\leftrightharpoons',
  '\\leftrightsquigarrow', '\\Lleftarrow', '\\longleftarrow', '\\Longleftarrow',
  '\\longleftrightarrow', '\\Longleftrightarrow', '\\longmapsto', '\\longrightarrow',
  '\\Longrightarrow', '\\looparrowleft', '\\looparrowright', '\\Lsh', '\\mapsto',
  '\\nearrow', '\\nleftarrow', '\\nLeftarrow', '\\nleftrightarrow', '\\nLeftrightarrow',
  '\\nrightarrow', '\\nRightarrow', '\\nwarrow', '\\restriction', '\\rightarrowtail',
  '\\rightharpoondown', '\\rightharpoonup', '\\rightleftarrows', '\\rightleftharpoons',
  '\\rightrightarrows', '\\rightsquigarrow', '\\Rrightarrow', '\\Rsh', '\\searrow',
  '\\swarrow', '\\to', '\\twoheadleftarrow', '\\twoheadrightarrow', '\\upharpoonleft',
  '\\upharpoonright', '\\upuparrows',
]
const ARROWS_MORE_ITEMS = commandItems(ARROWS_MORE_VALUES)

const ARROWS_EXTENSIBLE_ITEMS: SymbolItem[] = [
  latexSlotItem('←', '\\xleftarrow{#?}'),
  latexSlotItem('→', '\\xrightarrow{#?}'),
  latexSlotItem('⇐', '\\xLeftarrow{#?}'),
  latexSlotItem('⇒', '\\xRightarrow{#?}'),
  latexSlotItem('↔', '\\xleftrightarrow{#?}'),
  latexSlotItem('⇔', '\\xLeftrightarrow{#?}'),
  latexSlotItem('↩', '\\xhookleftarrow{#?}'),
  latexSlotItem('↪', '\\xhookrightarrow{#?}'),
  latexSlotItem('↞', '\\xtwoheadleftarrow{#?}'),
  latexSlotItem('↠', '\\xtwoheadrightarrow{#?}'),
  latexSlotItem('↼', '\\xleftharpoonup{#?}'),
  latexSlotItem('⇀', '\\xrightharpoonup{#?}'),
  latexSlotItem('↽', '\\xleftharpoondown{#?}'),
  latexSlotItem('⇁', '\\xrightharpoondown{#?}'),
  latexSlotItem('⇋', '\\xleftrightharpoons{#?}'),
  latexSlotItem('⇌', '\\xrightleftharpoons{#?}'),
  latexSlotItem('⇄', '\\xtofrom{#?}'),
  latexSlotItem('↦', '\\xmapsto{#?}'),
  latexSlotItem('=', '\\xlongequal{#?}'),
]

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    label: 'Relations',
    items: [
      ...RELATIONS_COMMON_ITEMS,
      ...commandItems(RELATIONS_OTHER_VALUES),
      ...commandItems(RELATIONS_NEGATED_VALUES),
    ],
  },
  {
    label: 'Arithmetic',
    items: [
      { display: '+', value: '+', title: 'Plus', mode: 'write' },
      { display: '-', value: '-', title: 'Minus', mode: 'write' },
      { display: commandDisplay('\\times'), value: '\\times', title: 'Multiplication (cross)', mode: 'cmd' },
      { display: commandDisplay('\\cdot'), value: '\\cdot', title: 'Multiplication (dot)', mode: 'cmd' },
      { display: commandDisplay('\\div'), value: '\\div', title: 'Division', mode: 'cmd' },
    ],
  },
  {
    label: 'Greek',
    items: [
      { display: commandDisplay('\\alpha'), value: '\\alpha', title: 'Alpha (\\alpha)', mode: 'cmd' },
      { display: commandDisplay('\\beta'), value: '\\beta', title: 'Beta (\\beta)', mode: 'cmd' },
      { display: commandDisplay('\\gamma'), value: '\\gamma', title: 'Gamma (\\gamma)', mode: 'cmd' },
      { display: commandDisplay('\\delta'), value: '\\delta', title: 'Delta (\\delta)', mode: 'cmd' },
      { display: commandDisplay('\\epsilon'), value: '\\epsilon', title: 'Epsilon (\\epsilon)', mode: 'cmd' },
      { display: commandDisplay('\\varepsilon'), value: '\\varepsilon', title: 'Variant epsilon (\\varepsilon)', mode: 'cmd' },
      { display: commandDisplay('\\zeta'), value: '\\zeta', title: 'Zeta (\\zeta)', mode: 'cmd' },
      { display: commandDisplay('\\eta'), value: '\\eta', title: 'Eta (\\eta)', mode: 'cmd' },
      { display: commandDisplay('\\theta'), value: '\\theta', title: 'Theta (\\theta)', mode: 'cmd' },
      { display: commandDisplay('\\vartheta'), value: '\\vartheta', title: 'Variant theta (\\vartheta)', mode: 'cmd' },
      { display: commandDisplay('\\iota'), value: '\\iota', title: 'Iota (\\iota)', mode: 'cmd' },
      { display: commandDisplay('\\kappa'), value: '\\kappa', title: 'Kappa (\\kappa)', mode: 'cmd' },
      { display: commandDisplay('\\varkappa'), value: '\\varkappa', title: 'Variant kappa (\\varkappa)', mode: 'cmd' },
      { display: commandDisplay('\\lambda'), value: '\\lambda', title: 'Lambda (\\lambda)', mode: 'cmd' },
      { display: commandDisplay('\\mu'), value: '\\mu', title: 'Mu (\\mu)', mode: 'cmd' },
      { display: commandDisplay('\\nu'), value: '\\nu', title: 'Nu (\\nu)', mode: 'cmd' },
      { display: 'o', value: 'o', title: 'Omicron', mode: 'write' },
      { display: commandDisplay('\\xi'), value: '\\xi', title: 'Xi (\\xi)', mode: 'cmd' },
      { display: commandDisplay('\\pi'), value: '\\pi', title: 'Pi (\\pi)', mode: 'cmd' },
      { display: commandDisplay('\\varpi'), value: '\\varpi', title: 'Variant pi (\\varpi)', mode: 'cmd' },
      { display: commandDisplay('\\rho'), value: '\\rho', title: 'Rho (\\rho)', mode: 'cmd' },
      { display: commandDisplay('\\varrho'), value: '\\varrho', title: 'Variant rho (\\varrho)', mode: 'cmd' },
      { display: commandDisplay('\\sigma'), value: '\\sigma', title: 'Sigma (\\sigma)', mode: 'cmd' },
      { display: commandDisplay('\\varsigma'), value: '\\varsigma', title: 'Final sigma (\\varsigma)', mode: 'cmd' },
      { display: commandDisplay('\\tau'), value: '\\tau', title: 'Tau (\\tau)', mode: 'cmd' },
      { display: commandDisplay('\\upsilon'), value: '\\upsilon', title: 'Upsilon (\\upsilon)', mode: 'cmd' },
      { display: commandDisplay('\\phi'), value: '\\phi', title: 'Phi (\\phi)', mode: 'cmd' },
      { display: commandDisplay('\\varphi'), value: '\\varphi', title: 'Variant phi (\\varphi)', mode: 'cmd' },
      { display: commandDisplay('\\chi'), value: '\\chi', title: 'Chi (\\chi)', mode: 'cmd' },
      { display: commandDisplay('\\psi'), value: '\\psi', title: 'Psi (\\psi)', mode: 'cmd' },
      { display: commandDisplay('\\omega'), value: '\\omega', title: 'Omega (\\omega)', mode: 'cmd' },
      { display: commandDisplay('\\digamma'), value: '\\digamma', title: 'Digamma (\\digamma)', mode: 'cmd' },
      { display: commandDisplay('\\Gamma'), value: '\\Gamma', title: 'Gamma (upper) (\\Gamma)', mode: 'cmd' },
      { display: commandDisplay('\\Delta'), value: '\\Delta', title: 'Delta (upper) (\\Delta)', mode: 'cmd' },
      { display: commandDisplay('\\Theta'), value: '\\Theta', title: 'Theta (upper) (\\Theta)', mode: 'cmd' },
      { display: commandDisplay('\\Lambda'), value: '\\Lambda', title: 'Lambda (upper) (\\Lambda)', mode: 'cmd' },
      { display: commandDisplay('\\Xi'), value: '\\Xi', title: 'Xi (upper) (\\Xi)', mode: 'cmd' },
      { display: commandDisplay('\\Pi'), value: '\\Pi', title: 'Pi (upper) (\\Pi)', mode: 'cmd' },
      { display: commandDisplay('\\Sigma'), value: '\\Sigma', title: 'Sigma (upper) (\\Sigma)', mode: 'cmd' },
      { display: commandDisplay('\\Upsilon'), value: '\\Upsilon', title: 'Upsilon (upper) (\\Upsilon)', mode: 'cmd' },
      { display: commandDisplay('\\Phi'), value: '\\Phi', title: 'Phi (upper) (\\Phi)', mode: 'cmd' },
      { display: commandDisplay('\\Psi'), value: '\\Psi', title: 'Psi (upper) (\\Psi)', mode: 'cmd' },
      { display: commandDisplay('\\Omega'), value: '\\Omega', title: 'Omega (upper) (\\Omega)', mode: 'cmd' },
      { display: commandDisplay('\\aleph'), value: '\\aleph', title: 'Aleph (\\aleph)', mode: 'cmd' },
      { display: commandDisplay('\\beth'), value: '\\beth', title: 'Beth (\\beth)', mode: 'cmd' },
      { display: commandDisplay('\\gimel'), value: '\\gimel', title: 'Gimel (\\gimel)', mode: 'cmd' },
      { display: commandDisplay('\\daleth'), value: '\\daleth', title: 'Daleth (\\daleth)', mode: 'cmd' },
      { display: commandDisplay('\\imath'), value: '\\imath', title: 'Dotless i (\\imath)', mode: 'cmd' },
      { display: commandDisplay('\\jmath'), value: '\\jmath', title: 'Dotless j (\\jmath)', mode: 'cmd' },
      { display: commandDisplay('\\nabla'), value: '\\nabla', title: 'Nabla (\\nabla)', mode: 'cmd' },
      { display: commandDisplay('\\partial'), value: '\\partial', title: 'Partial derivative (\\partial)', mode: 'cmd' },
      { display: commandDisplay('\\Im'), value: '\\Im', title: 'Imaginary part (\\Im)', mode: 'cmd' },
      { display: commandDisplay('\\image'), value: '\\image', title: 'Imaginary part (\\image)', mode: 'cmd' },
      { display: commandDisplay('\\Re'), value: '\\Re', title: 'Real part (\\Re)', mode: 'cmd' },
      { display: commandDisplay('\\real'), value: '\\real', title: 'Real part (\\real)', mode: 'cmd' },
      { display: commandDisplay('\\Reals'), value: '\\Reals', title: 'Real numbers (\\Reals)', mode: 'cmd' },
      { display: commandDisplay('\\R'), value: '\\R', title: 'Real numbers (\\R)', mode: 'cmd' },
      { display: commandDisplay('\\reals'), value: '\\reals', title: 'Real numbers (\\reals)', mode: 'cmd' },
      { display: commandDisplay('\\N'), value: '\\N', title: 'Natural numbers (\\N)', mode: 'cmd' },
      { display: commandDisplay('\\natnums'), value: '\\natnums', title: 'Natural numbers (\\natnums)', mode: 'cmd' },
      { display: commandDisplay('\\Z'), value: '\\Z', title: 'Integers (\\Z)', mode: 'cmd' },
      { display: commandDisplay('\\cnums'), value: '\\cnums', title: 'Complex numbers (\\cnums)', mode: 'cmd' },
      { display: commandDisplay('\\Complex'), value: '\\Complex', title: 'Complex numbers (\\Complex)', mode: 'cmd' },
      { display: commandDisplay('\\Bbbk'), value: '\\Bbbk', title: 'Blackboard bold k (\\Bbbk)', mode: 'cmd' },
      { display: commandDisplay('\\ell'), value: '\\ell', title: 'Script ell (\\ell)', mode: 'cmd' },
      { display: commandDisplay('\\hbar'), value: '\\hbar', title: 'h-bar (\\hbar)', mode: 'cmd' },
      { display: commandDisplay('\\hslash'), value: '\\hslash', title: 'h-slash (\\hslash)', mode: 'cmd' },
      { display: commandDisplay('\\wp'), value: '\\wp', title: 'Weierstrass p (\\wp)', mode: 'cmd' },
      { display: commandDisplay('\\weierp'), value: '\\weierp', title: 'Weierstrass p (\\weierp)', mode: 'cmd' },
      { display: commandDisplay('\\Game'), value: '\\Game', title: 'Game (\\Game)', mode: 'cmd' },
      { display: commandDisplay('\\Finv'), value: '\\Finv', title: 'Turned F (\\Finv)', mode: 'cmd' },
      { display: commandDisplay('\\eth'), value: '\\eth', title: 'Eth (\\eth)', mode: 'cmd' },
      { display: commandDisplay('\\OE'), value: '\\OE', title: 'OE ligature (\\OE)', mode: 'cmd' },
      { display: commandDisplay('\\o'), value: '\\o', title: 'o slash (\\o)', mode: 'cmd' },
      { display: commandDisplay('\\O'), value: '\\O', title: 'O slash (\\O)', mode: 'cmd' },
      { display: commandDisplay('\\ss'), value: '\\ss', title: 'Eszett (\\ss)', mode: 'cmd' },
      { display: commandDisplay('\\aa'), value: '\\aa', title: 'a ring (\\aa)', mode: 'cmd' },
      { display: commandDisplay('\\AA'), value: '\\AA', title: 'A ring (\\AA)', mode: 'cmd' },
      { display: commandDisplay('\\i'), value: '\\i', title: 'Dotless i (\\i)', mode: 'cmd' },
      { display: commandDisplay('\\j'), value: '\\j', title: 'Dotless j (\\j)', mode: 'cmd' },
      { display: commandDisplay('\\ae'), value: '\\ae', title: 'ae ligature (\\ae)', mode: 'cmd' },
      { display: commandDisplay('\\AE'), value: '\\AE', title: 'AE ligature (\\AE)', mode: 'cmd' },
      { display: commandDisplay('\\oe'), value: '\\oe', title: 'oe ligature (\\oe)', mode: 'cmd' },
      { display: commandDisplay('\\alef'), value: '\\alef', title: 'Aleph (\\alef)', mode: 'cmd' },
      { display: commandDisplay('\\alefsym'), value: '\\alefsym', title: 'Aleph (\\alefsym)', mode: 'cmd' },
      ...commandItems(GREEK_ALIAS_VALUES),
    ],
  },
  {
    label: 'Calculus',
    items: [
      { display: commandDisplay('\\partial'), value: '\\partial', title: 'Partial derivative', mode: 'cmd' },
      { display: commandDisplay('\\nabla'), value: '\\nabla', title: 'Nabla / Del', mode: 'cmd' },
      { display: commandDisplay('\\infty'), value: '\\infty', title: 'Infinity', mode: 'cmd' },
      { display: 'dy/dx', value: '\\frac{dy}{dx}', title: 'Derivative', mode: 'write' },
      { display: commandDisplay('\\int_{ }^{ }'), value: '\\int_{ }^{ }', title: 'Definite integral — type the bounds', mode: 'write' },
    ],
  },
  {
    label: 'Sets & Logic',
    items: [
      { display: commandDisplay('\\in'), value: '\\in', title: 'Element of', mode: 'cmd' },
      { display: commandDisplay('\\notin'), value: '\\notin', title: 'Not element of', mode: 'cmd' },
      { display: commandDisplay('\\emptyset'), value: '\\emptyset', title: 'Empty set', mode: 'cmd' },
      { display: commandDisplay('\\subset'), value: '\\subset', title: 'Subset', mode: 'cmd' },
      { display: commandDisplay('\\subseteq'), value: '\\subseteq', title: 'Subset or equal', mode: 'cmd' },
      { display: commandDisplay('\\supset'), value: '\\supset', title: 'Superset', mode: 'cmd' },
      { display: commandDisplay('\\cup'), value: '\\cup', title: 'Union', mode: 'cmd' },
      { display: commandDisplay('\\cap'), value: '\\cap', title: 'Intersection', mode: 'cmd' },
      { display: commandDisplay('\\forall'), value: '\\forall', title: 'For all', mode: 'cmd' },
      { display: commandDisplay('\\exists'), value: '\\exists', title: 'There exists', mode: 'cmd' },
      { display: commandDisplay('\\neg'), value: '\\neg', title: 'Logical not', mode: 'cmd' },
      { display: commandDisplay('\\wedge'), value: '\\wedge', title: 'Logical and', mode: 'cmd' },
      { display: commandDisplay('\\vee'), value: '\\vee', title: 'Logical or', mode: 'cmd' },
    ],
  },
  {
    label: 'Arrows',
    items: [
      ...ARROWS_COMMON_ITEMS,
      ...ARROWS_MORE_ITEMS,
      ...ARROWS_EXTENSIBLE_ITEMS,
    ],
  },
  {
    label: 'Functions',
    items: [
      { display: 'arcsin', value: '\\arcsin', title: 'arcsin (\\arcsin)', mode: 'cmd' },
      { display: 'arccos', value: '\\arccos', title: 'arccos (\\arccos)', mode: 'cmd' },
      { display: 'arctan', value: '\\arctan', title: 'arctan (\\arctan)', mode: 'cmd' },
      { display: 'arctg', value: '\\arctg', title: 'arctg (\\arctg)', mode: 'cmd' },
      { display: 'arcctg', value: '\\arcctg', title: 'arcctg (\\arcctg)', mode: 'cmd' },
      { display: 'arg', value: '\\arg', title: 'arg (\\arg)', mode: 'cmd' },
      { display: 'ch', value: '\\ch', title: 'ch (\\ch)', mode: 'cmd' },
      { display: 'cos', value: '\\cos', title: 'cos (\\cos)', mode: 'cmd' },
      { display: 'cosec', value: '\\cosec', title: 'cosec (\\cosec)', mode: 'cmd' },
      { display: 'cosh', value: '\\cosh', title: 'cosh (\\cosh)', mode: 'cmd' },
      { display: 'cot', value: '\\cot', title: 'cot (\\cot)', mode: 'cmd' },
      { display: 'cotg', value: '\\cotg', title: 'cotg (\\cotg)', mode: 'cmd' },
      { display: 'coth', value: '\\coth', title: 'coth (\\coth)', mode: 'cmd' },
      { display: 'csc', value: '\\csc', title: 'csc (\\csc)', mode: 'cmd' },
      { display: 'ctg', value: '\\ctg', title: 'ctg (\\ctg)', mode: 'cmd' },
      { display: 'cth', value: '\\cth', title: 'cth (\\cth)', mode: 'cmd' },
      { display: 'deg', value: '\\deg', title: 'deg (\\deg)', mode: 'cmd' },
      { display: 'dim', value: '\\dim', title: 'dim (\\dim)', mode: 'cmd' },
      { display: 'exp', value: '\\exp', title: 'exp (\\exp)', mode: 'cmd' },
      { display: 'hom', value: '\\hom', title: 'hom (\\hom)', mode: 'cmd' },
      { display: 'ker', value: '\\ker', title: 'ker (\\ker)', mode: 'cmd' },
      { display: 'lg', value: '\\lg', title: 'lg (\\lg)', mode: 'cmd' },
      { display: 'ln', value: '\\ln', title: 'ln (\\ln)', mode: 'cmd' },
      { display: 'log', value: '\\log', title: 'log (\\log)', mode: 'cmd' },
      { display: 'sec', value: '\\sec', title: 'sec (\\sec)', mode: 'cmd' },
      { display: 'sin', value: '\\sin', title: 'sin (\\sin)', mode: 'cmd' },
      { display: 'sinh', value: '\\sinh', title: 'sinh (\\sinh)', mode: 'cmd' },
      { display: 'sh', value: '\\sh', title: 'sh (\\sh)', mode: 'cmd' },
      { display: 'tan', value: '\\tan', title: 'tan (\\tan)', mode: 'cmd' },
      { display: 'tanh', value: '\\tanh', title: 'tanh (\\tanh)', mode: 'cmd' },
      { display: 'tg', value: '\\tg', title: 'tg (\\tg)', mode: 'cmd' },
      { display: 'th', value: '\\th', title: 'th (\\th)', mode: 'cmd' },
      { display: 'f', value: '\\operatorname{f}', title: 'f (\\operatorname{f})', mode: 'write' },
      { display: 'argmax', value: '\\argmax', title: 'argmax (\\argmax)', mode: 'cmd' },
      { display: 'argmin', value: '\\argmin', title: 'argmin (\\argmin)', mode: 'cmd' },
      { display: 'det', value: '\\det', title: 'det (\\det)', mode: 'cmd' },
      { display: 'gcd', value: '\\gcd', title: 'gcd (\\gcd)', mode: 'cmd' },
      { display: 'inf', value: '\\inf', title: 'inf (\\inf)', mode: 'cmd' },
      { display: 'injlim', value: '\\injlim', title: 'injlim (\\injlim)', mode: 'cmd' },
      { display: 'lim', value: '\\lim', title: 'lim (\\lim)', mode: 'cmd' },
      { display: 'liminf', value: '\\liminf', title: 'liminf (\\liminf)', mode: 'cmd' },
      { display: 'limsup', value: '\\limsup', title: 'limsup (\\limsup)', mode: 'cmd' },
      { display: 'max', value: '\\max', title: 'max (\\max)', mode: 'cmd' },
      { display: 'min', value: '\\min', title: 'min (\\min)', mode: 'cmd' },
      { display: 'plim', value: '\\plim', title: 'plim (\\plim)', mode: 'cmd' },
      { display: 'Pr', value: '\\Pr', title: 'Pr (\\Pr)', mode: 'cmd' },
      { display: 'projlim', value: '\\projlim', title: 'projlim (\\projlim)', mode: 'cmd' },
      { display: 'sup', value: '\\sup', title: 'sup (\\sup)', mode: 'cmd' },
      { display: 'varinjlim', value: '\\varinjlim', title: 'varinjlim (\\varinjlim)', mode: 'cmd' },
      { display: 'varliminf', value: '\\varliminf', title: 'varliminf (\\varliminf)', mode: 'cmd' },
      { display: 'varlimsup', value: '\\varlimsup', title: 'varlimsup (\\varlimsup)', mode: 'cmd' },
      { display: 'varprojlim', value: '\\varprojlim', title: 'varprojlim (\\varprojlim)', mode: 'cmd' },
      { display: 'f*', value: '\\operatorname*{f}', title: 'f (\\operatorname*{f})', mode: 'write' },
      { display: 'f limits', value: '\\operatornamewithlimits{f}', title: 'f (\\operatornamewithlimits{f})', mode: 'write' },
    ],
  },
  {
    label: 'Accents',
    items: [
      { display: 'tilde', value: '\\tilde{ }', title: 'Tilde (\\tilde)', mode: 'write' },
      { display: 'widetilde', value: '\\widetilde{ }', title: 'Wide tilde (\\widetilde)', mode: 'write' },
      { display: 'acute', value: '\\acute{ }', title: 'Acute accent (\\acute)', mode: 'write' },
      { display: 'bar', value: '\\bar{ }', title: 'Bar / macron (\\bar)', mode: 'write' },
      { display: 'breve', value: '\\breve{ }', title: 'Breve (\\breve)', mode: 'write' },
      { display: 'check', value: '\\check{ }', title: 'Check / caron (\\check)', mode: 'write' },
      { display: 'dot', value: '\\dot{ }', title: 'Dot above (\\dot)', mode: 'write' },
      { display: 'ddot', value: '\\ddot{ }', title: 'Double dot / umlaut (\\ddot)', mode: 'write' },
      { display: 'dddot', value: '\\dddot{ }', title: 'Triple dot (\\dddot)', mode: 'write' },
      { display: 'ddddot', value: '\\ddddot{ }', title: 'Quadruple dot (\\ddddot)', mode: 'write' },
      { display: 'grave', value: '\\grave{ }', title: 'Grave accent (\\grave)', mode: 'write' },
      { display: 'hat', value: '\\hat{ }', title: 'Hat / circumflex (\\hat)', mode: 'write' },
      { display: 'widehat', value: '\\widehat{ }', title: 'Wide hat (\\widehat)', mode: 'write' },
      { display: 'mathring', value: '\\mathring{ }', title: 'Ring above (\\mathring)', mode: 'write' },
      { display: 'vec', value: '\\vec{ }', title: 'Vector arrow (\\vec)', mode: 'write' },
      { display: 'overline', value: '\\overline{ }', title: 'Overline (\\overline)', mode: 'write' },
      { display: 'underline', value: '\\underline{ }', title: 'Underline (\\underline)', mode: 'write' },
      { display: 'underbar', value: '\\underbar{ }', title: 'Underbar (\\underbar)', mode: 'write' },
      { display: 'overbrace', value: '\\overbrace{ }^{ }', title: 'Overbrace with label (\\overbrace)', mode: 'write' },
      { display: 'underbrace', value: '\\underbrace{ }_{ }', title: 'Underbrace with label (\\underbrace)', mode: 'write' },
      { display: 'overbracket', value: '\\overbracket{ }^{ }', title: 'Overbracket with label (\\overbracket)', mode: 'write' },
      { display: 'overbrace', value: '\\overbrace{ }', title: 'Overbrace without label (\\overbrace)', mode: 'write' },
      { display: 'underbrace', value: '\\underbrace{ }', title: 'Underbrace without label (\\underbrace)', mode: 'write' },
      { display: 'overbracket', value: '\\overbracket{ }', title: 'Overbracket without label (\\overbracket)', mode: 'write' },
      { display: 'overleftarrow', value: '\\overleftarrow{ }', title: 'Left arrow over (\\overleftarrow)', mode: 'write' },
      { display: 'overrightarrow', value: '\\overrightarrow{ }', title: 'Right arrow over (\\overrightarrow)', mode: 'write' },
      { display: 'underleftarrow', value: '\\underleftarrow{ }', title: 'Left arrow under (\\underleftarrow)', mode: 'write' },
      { display: 'underrightarrow', value: '\\underrightarrow{ }', title: 'Right arrow under (\\underrightarrow)', mode: 'write' },
      { display: 'overleftrightarrow', value: '\\overleftrightarrow{ }', title: 'Bidirectional arrow over (\\overleftrightarrow)', mode: 'write' },
      { display: 'underleftrightarrow', value: '\\underleftrightarrow{ }', title: 'Bidirectional arrow under (\\underleftrightarrow)', mode: 'write' },
      { display: 'overleftharpoon', value: '\\overleftharpoon{ }', title: 'Left harpoon over (\\overleftharpoon)', mode: 'write' },
      { display: 'overrightharpoon', value: '\\overrightharpoon{ }', title: 'Right harpoon over (\\overrightharpoon)', mode: 'write' },
      latexSlotItem(<CancelPreview kind="cancel" />, '\\cancel{#?}', '\\cancel'),
      latexSlotItem(<CancelPreview kind="bcancel" />, '\\bcancel{#?}', '\\bcancel'),
      latexSlotItem(<CancelPreview kind="xcancel" />, '\\xcancel{#?}', '\\xcancel'),
      latexSlotItem(<CancelPreview kind="sout" />, '\\sout{#?}', '\\sout'),
      latexSlotItem(<span className="math-phase math-phase-phase" style={{ margin: 0 }}><svg className="math-phase-angle-svg" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><polyline points="24,3 3,23 100,23" /></svg><Slot /></span>, '\\phase{#?}', '\\phase'),
      latexSlotItem(<span className="math-phase math-phase-angln" style={{ margin: 0 }}><Slot /></span>, '\\angln{#?}', '\\angln'),
      { display: "acute'", value: "\\'{ }", title: "Acute accent (\\')", mode: "write" },
      { display: 'grave`', value: '\\`{ }', title: 'Grave accent (\\`)', mode: 'write' },
      { display: 'hat^', value: '\\^{ }', title: 'Circumflex / hat (\\^)', mode: 'write' },
      { display: 'tilde~', value: '\\~{ }', title: 'Tilde (\\~)', mode: 'write' },
      { display: 'macron=', value: '\\={ }', title: 'Macron / bar (\\=)', mode: 'write' },
      { display: 'breveu', value: '\\u{ }', title: 'Breve (\\u)', mode: 'write' },
      { display: 'dot.', value: '\\.{ }', title: 'Dot above (\\.)', mode: 'write' },
      { display: 'ringr', value: '\\r{ }', title: 'Ring above (\\r)', mode: 'write' },
      { display: 'doubleacuteH', value: '\\H{ }', title: 'Double acute (\\H)', mode: 'write' },
      { display: 'caronv', value: '\\v{ }', title: 'Caron / check (\\v)', mode: 'write' },
      { display: 'umlaut"', value: '\\"{ }', title: 'Umlaut / double dot (\\")', mode: 'write' },
    ],
  },
  {
    label: 'Delimiters',
    items: [
      ...commandItems([
        '\\backslash',
      ]),
    ],
  },
  {
    label: 'Operators',
    items: [
      ...OPERATORS_COMMON_ITEMS,
      ...OPERATORS_MISC_ITEMS,
    ],
  },
  {
    label: 'Fractions',
    items: [
      latexSlotItem(<FractionDisplay />, '\\frac{#?}{#?}', '\\frac'),
      latexSlotItem(<span style={{ fontSize: '0.85em' }}><FractionDisplay /></span>, '\\tfrac{#?}{#?}', '\\tfrac'),
      latexSlotItem(<span style={{ fontSize: '1.15em' }}><FractionDisplay /></span>, '\\dfrac{#?}{#?}', '\\dfrac'),
      latexSlotItem(<div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', fontSize: '0.8em', lineHeight: 1 }}><span style={{ fontSize: '1.5em', fontWeight: 300, marginRight: '2px' }}>(</span><div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}><Slot /><Slot /></div><span style={{ fontSize: '1.5em', fontWeight: 300, marginLeft: '2px' }}>)</span></div>, '\\binom{#?}{#?}', '\\binom'),
    ],
  },
  {
    label: 'Notation',
    items: [
      latexSlotItem(<>{'\u27e8'}<Slot />{'\u27e9'}</>, '\\left\\langle{#?}\\right\\rangle', '\\left\\langle{#?}\\right\\rangle'),
      latexSlotItem(<>|<Slot />{'\u27e9'}</>, '\\left\\lvert{#?}\\right\\rangle', '\\left\\lvert{#?}\\right\\rangle'),
      latexSlotItem(<>{'\u27e8'}<Slot />|</>, '\\left\\langle{#?}\\right\\rvert', '\\left\\langle{#?}\\right\\rvert'),
      latexSlotItem(<>{'{'}<Slot />{'}'}</>, '\\left\\lbrace{#?}\\right\\rbrace', '\\left\\lbrace{#?}\\right\\rbrace'),
      ...commandItems([
        '\\complement', '\\therefore', '\\because', '\\emptyset', '\\varnothing', '\\exists',
        '\\nexists', '\\mid', '\\in', '\\ni', '\\lnot',
      ]),
    ],
  },
  {
    label: 'Layout',
    items: [
      latexSlotItem(<div style={{ border: '1px solid currentColor', padding: '2px', display: 'inline-block', lineHeight: 1 }}><Slot /></div>, '\\boxed{#?}', '\\boxed'),
      latexSlotItem(<div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', lineHeight: 1, gap: '2px' }}><span style={{ fontSize: '0.7em' }}><Slot /></span><Slot /></div>, '\\stackrel{#?}{#?}', '\\stackrel'),
      latexSlotItem(<span style={{ opacity: 0.5, border: '1px dashed currentColor', padding: '1px' }}><Slot /></span>, '\\phantom{#?}', '\\phantom'),
      latexSlotItem(<span style={{ opacity: 0.5, borderTop: '1px dashed currentColor', borderBottom: '1px dashed currentColor', padding: '1px' }}>{'\u2194'}<Slot />{'\u2194'}</span>, '\\hphantom{#?}', '\\hphantom'),
      latexSlotItem(<span style={{ opacity: 0.5, borderLeft: '1px dashed currentColor', borderRight: '1px dashed currentColor', padding: '1px' }}>{'\u2195'}<Slot />{'\u2195'}</span>, '\\vphantom{#?}', '\\vphantom'),
      latexSlotItem(<>{'\u2194'} <Slot /></>, '\\hspace{#?}', '\\hspace'),
      latexSlotItem(<>{'\u2194'}* <Slot /></>, '\\hspace*{#?}', '\\hspace*'),
      { display: <NewlineDisplay label="\\" />, value: '\\\\', title: 'Newline (\\\\)', mode: 'cmd' },
      { display: <NewlineDisplay label="\\newline" />, value: '\\newline', title: 'Newline (\\newline)', mode: 'cmd' },
      { display: <SpaceDisplay width={4} label="\\," />, value: '\\,', title: 'Thin space (\\,)', mode: 'cmd' },
      { display: <SpaceDisplay width={4} label="\\thinspace" />, value: '\\thinspace', title: 'Thin space (\\thinspace)', mode: 'cmd' },
      { display: <SpaceDisplay width={6} label="\\:" />, value: '\\:', title: 'Medium space (\\:)', mode: 'cmd' },
      { display: <SpaceDisplay width={6} label="\\medspace" />, value: '\\medspace', title: 'Medium space (\\medspace)', mode: 'cmd' },
      { display: <SpaceDisplay width={8} label="\\;" />, value: '\\;', title: 'Thick space (\\;)', mode: 'cmd' },
      { display: <SpaceDisplay width={8} label="\\thickspace" />, value: '\\thickspace', title: 'Thick space (\\thickspace)', mode: 'cmd' },
      { display: <SpaceDisplay width={12} label="\\enspace" />, value: '\\enspace', title: 'En space (\\enspace)', mode: 'cmd' },
      { display: <SpaceDisplay width={24} label="\\quad" />, value: '\\quad', title: 'Quad space (\\quad)', mode: 'cmd' },
      { display: <SpaceDisplay width={48} label="\\qquad" />, value: '\\qquad', title: 'Double quad space (\\qquad)', mode: 'cmd' },
      { display: <SpaceDisplay width={4} label="\\!" isNegative />, value: '\\!', title: 'Negative thin space (\\!)', mode: 'cmd' },
      { display: <SpaceDisplay width={4} label="\\negthinspace" isNegative />, value: '\\negthinspace', title: 'Negative thin space (\\negthinspace)', mode: 'cmd' },
      { display: <SpaceDisplay width={6} label="~" />, value: '~', title: 'Non-breaking space (~)', mode: 'cmd' },
    ],
  },
  {
    label: 'Symbols',
    items: commandItems([
      '\\dots', '\\cdots', '\\ddots', '\\ldots', '\\vdots', '\\dotsb', '\\dotsc', '\\dotsi',
      '\\dotsm', '\\dotso', '\\mathellipsis', '\\%', '\\#', '\\&',
      '\\_', '\\$', '\\infin', '\\checkmark', '\\dag', '\\dagger', '\\ddag', '\\ddagger', '\\Dagger',
      '\\Box', '\\square', '\\angle', '\\measuredangle', '\\sphericalangle', '\\top', '\\bot',
      '\\colon', '\\backprime', '\\prime', '\\lq', '\\rq', '\\bigtriangledown', '\\bigtriangleup',
      '\\blacktriangle', '\\blacktriangledown', '\\blacktriangleleft', '\\blacktriangleright',
      '\\triangle', '\\triangledown', '\\triangleleft', '\\triangleright', '\\diamond', '\\Diamond',
      '\\lozenge', '\\blacklozenge', '\\star', '\\bigstar', '\\clubsuit', '\\clubs', '\\diamondsuit',
      '\\diamonds', '\\heartsuit', '\\hearts', '\\spadesuit', '\\spades', '\\maltese', '\\flat',
      '\\natural', '\\sharp', '\\surd', '\\degree', '\\mho', '\\diagdown', '\\diagup', '\\P', '\\S',
      '\\sect', '\\copyright', '\\circledR', '\\circledS', '\\pounds', '\\mathsterling', '\\yen',
      '\\minuso',
    ]),
  },

]

const DROPDOWN_GROUP_LABELS = [
  'Greek',
  'Accents',
  'Delimiters',
  'Operators',
  'Fractions',
  'Relations',
  'Sets & Logic',
  'Arrows',
  'Notation',
  'Layout',
  'Symbols',
  'Functions',
]
const DROPDOWN_GROUP_LABEL_SET = new Set(DROPDOWN_GROUP_LABELS)
const GREEK_ALIAS_SYMBOL_VALUES = new Set(GREEK_ALIAS_VALUES)
const HEBREW_SYMBOL_VALUES = new Set(['\\aleph', '\\beth', '\\gimel', '\\daleth'])
const OTHER_LETTER_SYMBOL_VALUES = new Set([
  '\\imath',
  '\\jmath',
  '\\nabla',
  '\\partial',
  '\\Im',
  '\\image',
  '\\Re',
  '\\real',
  '\\Reals',
  '\\R',
  '\\reals',
  '\\N',
  '\\natnums',
  '\\Z',
  '\\cnums',
  '\\Complex',
  '\\Bbbk',
  '\\ell',
  '\\hbar',
  '\\hslash',
  '\\wp',
  '\\weierp',
  '\\Game',
  '\\Finv',
  '\\eth',
  '\\OE',
  '\\o',
  '\\O',
  '\\ss',
  '\\aa',
  '\\AA',
  '\\i',
  '\\j',
  '\\ae',
  '\\AE',
  '\\oe',
  '\\alef',
  '\\alefsym',
])

const FUNCTION_SECTION_VALUES: Array<{ label: string; values: string[] }> = [
  {
    label: 'Trigonometric',
    values: [
      '\\arccos',
      '\\arcsin',
      '\\arctan',
      '\\arctg',
      '\\arcctg',
      '\\cos',
      '\\cot',
      '\\cosec',
      '\\csc',
      '\\ctg',
      '\\sec',
      '\\sin',
      '\\tan',
      '\\tg',
    ],
  },
  {
    label: 'Hyperbolic',
    values: [
      '\\cosh',
      '\\coth',
      '\\cth',
      '\\sinh',
      '\\tanh',
      '\\ch',
      '\\sh',
      '\\th',
    ],
  },
  {
    label: 'Logarithmic & Exponential',
    values: [
      '\\exp',
      '\\lg',
      '\\ln',
      '\\log',
      '\\deg',
      '\\dim',
    ],
  },
  {
    label: 'Limits & Extrema',
    values: [
      '\\inf',
      '\\lim',
      '\\liminf',
      '\\limsup',
      '\\max',
      '\\min',
      '\\plim',
      '\\sup',
      '\\injlim',
      '\\projlim',
      '\\varinjlim',
      '\\varliminf',
      '\\varlimsup',
      '\\varprojlim',
    ],
  },
  {
    label: 'Algebra & Probability',
    values: [
      '\\arg',
      '\\argmax',
      '\\argmin',
      '\\det',
      '\\gcd',
      '\\hom',
      '\\ker',
      '\\Pr',
    ],
  },
  {
    label: 'Custom Operators',
    values: [
      '\\operatorname{f}',
      '\\operatorname*{f}',
      '\\operatornamewithlimits{f}',
    ],
  },
]

function SymbolDropdown({
  disabled,
  group,
  onInsertSnippet,
}: {
  disabled: boolean
  group: SymbolGroup
  onInsertSnippet: (snippet: string, mode: 'cmd' | 'write' | 'template' | 'func-slot') => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [openVariantKey, setOpenVariantKey] = useState<string | null>(null)
  const [indexedFunctionDefaults, setIndexedFunctionDefaults] = useState<Set<string>>(() => new Set())
  const [delimiterSizeId, setDelimiterSizeId] = useState(DELIMITER_SIZE_PRESETS[1].id)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 320 })
  const [floatingTooltip, setFloatingTooltip] = useState<{ title: string; top: number; left: number; placement: 'above' | 'below' } | null>(null)
  const isFunctionsGroup = group.label === 'Functions'
  const isRelationsGroup = group.label === 'Relations'
  const isOperatorsGroup = group.label === 'Operators'
  const isArrowsGroup = group.label === 'Arrows'
  const isDelimitersGroup = group.label === 'Delimiters'
  const isWideDropdown = isFunctionsGroup || isDelimitersGroup || group.items.some((item) => String(symbolItemTitle(item)).length > 12)
  const delimiterSizePreset = DELIMITER_SIZE_PRESETS.find((option) => option.id === delimiterSizeId) ?? DELIMITER_SIZE_PRESETS[1]
  const buildDelimiterTemplate = (option: DelimiterPairOption) =>
    `${delimiterSizePreset.left}${option.left}{#?}${delimiterSizePreset.right}${option.right}`
  const menuSections = group.label === 'Greek'
    ? [
      {
        label: 'Greek',
        items: group.items.filter((item) =>
          !GREEK_ALIAS_SYMBOL_VALUES.has(item.value)
          && !HEBREW_SYMBOL_VALUES.has(item.value)
          && !OTHER_LETTER_SYMBOL_VALUES.has(item.value)),
      },
      { label: 'Greek aliases', items: group.items.filter((item) => GREEK_ALIAS_SYMBOL_VALUES.has(item.value)) },
      { label: 'Hebrew', items: group.items.filter((item) => HEBREW_SYMBOL_VALUES.has(item.value)) },
      { label: 'Other letters', items: group.items.filter((item) => OTHER_LETTER_SYMBOL_VALUES.has(item.value)) },
    ]
    : isRelationsGroup
      ? [
        { label: 'Common Relations', items: RELATIONS_COMMON_ITEMS },
        { label: 'Other Relations', items: commandItems(RELATIONS_OTHER_VALUES) },
        { label: 'Negated Relations', items: commandItems(RELATIONS_NEGATED_VALUES) },
      ]
      : isOperatorsGroup
        ? [
          { label: 'Common Operators', items: OPERATORS_COMMON_ITEMS },
          { label: 'Miscellaneous Operators', items: OPERATORS_MISC_ITEMS },
        ]
        : isArrowsGroup
          ? [
            { label: 'Arrows', items: ARROWS_COMMON_ITEMS },
            { label: 'More Arrows', items: ARROWS_MORE_ITEMS },
            { label: 'Extensible Arrows', items: ARROWS_EXTENSIBLE_ITEMS },
          ]
          : isFunctionsGroup
            ? (() => {
              const usedValues = new Set<string>()
              const sections = FUNCTION_SECTION_VALUES
                .map((section) => {
                  const sectionItems = section.values
                    .map((value) => group.items.find((item) => item.value === value))
                    .filter((item): item is SymbolItem => Boolean(item))
                  sectionItems.forEach((item) => usedValues.add(item.value))
                  return { label: section.label, items: sectionItems }
                })
                .filter((section) => section.items.length > 0)

              const uncategorized = group.items.filter((item) => !usedValues.has(item.value))
              if (uncategorized.length > 0) {
                sections.push({ label: 'Other', items: uncategorized })
              }

              return sections
            })()
            : [
              { label: null, items: group.items },
            ]

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuWidth = Math.min(isWideDropdown ? 480 : 288, window.innerWidth - 32)
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 16)
    const spaceAbove = Math.max(0, rect.top - 16)
    const prefersAbove = spaceBelow < 220 && spaceAbove > spaceBelow
    const preferredMaxHeight = Math.min(window.innerHeight - 32, isWideDropdown ? 608 : 520)
    const availableHeight = prefersAbove ? spaceAbove : spaceBelow
    const maxHeight = Math.max(180, Math.min(preferredMaxHeight, availableHeight))
    const top = prefersAbove
      ? Math.max(16, rect.top - maxHeight - 6)
      : Math.max(16, Math.min(rect.bottom + 6, window.innerHeight - maxHeight - 16))
    setMenuPosition({
      top,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - menuWidth - 16)),
      maxHeight,
    })
  }, [isWideDropdown])

  const showFloatingTooltip = useCallback((title: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const estimatedHalfWidth = Math.min(Math.max(title.length * 3.8, 42), 150)
    const placement = rect.top > 36 ? 'above' : 'below'
    setFloatingTooltip({
      title,
      top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(estimatedHalfWidth + 8, Math.min(rect.left + rect.width / 2, window.innerWidth - estimatedHalfWidth - 8)),
      placement,
    })
  }, [])
  const menuScrollMaxHeight = Math.max(120, menuPosition.maxHeight - 18)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setOpenVariantKey(null)
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

  useEffect(() => {
    if (!isOpen) {
      setOpenVariantKey(null)
      setFloatingTooltip(null)
    }
  }, [isOpen])

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
        <div
          className={`symbol-dropdown-menu${isWideDropdown ? ' symbol-dropdown-menu-functions' : ''}`}
          role="menu"
          style={menuPosition}
        >
          <div
            ref={menuRef}
            className="symbol-dropdown-menu-scroll custom-scrollbar-target"
            style={{ maxHeight: `${menuScrollMaxHeight}px` }}
          >
            {isDelimitersGroup ? (
              <div className="symbol-dropdown-section">
                <span className="symbol-dropdown-section-title">Bracket pairs</span>
                <div className="symbol-delimiter-size-row" role="radiogroup" aria-label="Bracket size">
                  {DELIMITER_SIZE_PRESETS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`symbol-btn symbol-delimiter-size-button${delimiterSizeId === option.id ? ' symbol-delimiter-size-button-active' : ''}`}
                      aria-pressed={delimiterSizeId === option.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setDelimiterSizeId(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="symbol-delimiter-pair-grid">
                  {DELIMITER_PAIR_OPTIONS.map((option) => {
                    const title = `${option.label} (${delimiterSizePreset.left}${option.left}...${delimiterSizePreset.right}${option.right})`
                    return (
                      <div
                        key={option.id}
                        className="cell-button-tooltip-wrap symbol-dropdown-item-wrap symbol-dropdown-item-wrap-functions"
                        onMouseEnter={(event) => showFloatingTooltip(title, event.currentTarget)}
                        onMouseLeave={() => setFloatingTooltip(null)}
                        onFocusCapture={(event) => showFloatingTooltip(title, event.currentTarget)}
                        onBlurCapture={() => setFloatingTooltip(null)}
                      >
                        <button
                          type="button"
                          className="symbol-btn symbol-dropdown-item symbol-dropdown-item-functions"
                          role="menuitem"
                          title={title}
                          aria-label={title}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onInsertSnippet(buildDelimiterTemplate(option), 'write')
                            setIsOpen(false)
                          }}
                        >
                          {delimiterPreview(option)}
                        </button>
                        <span className="cell-button-tooltip">{title}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {menuSections.map((section) => (
              <div key={section.label ?? group.label} className="symbol-dropdown-section">
                {section.label ? <span className="symbol-dropdown-section-title">{section.label}</span> : null}
                <div className={`symbol-dropdown-section-grid${isWideDropdown ? ' symbol-dropdown-section-grid-functions' : ''}`}>
                  {section.items.map((item) => (
                    <div
                      key={`${section.label ?? group.label}-${item.value}`}
                      className={`cell-button-tooltip-wrap symbol-dropdown-item-wrap${isWideDropdown ? ' symbol-dropdown-item-wrap-functions' : ''}`}
                      onMouseEnter={(event) => showFloatingTooltip(symbolItemTitle(item), event.currentTarget)}
                      onMouseLeave={() => setFloatingTooltip(null)}
                      onFocusCapture={(event) => showFloatingTooltip(symbolItemTitle(item), event.currentTarget)}
                      onBlurCapture={() => setFloatingTooltip(null)}
                    >
                      {isFunctionsGroup ? (
                        <div className="symbol-dropdown-item-pair">
                          <div className="cell-button-tooltip-wrap">
                            <button
                              type="button"
                              className={`symbol-btn symbol-dropdown-item symbol-dropdown-item-functions${indexedFunctionDefaults.has(item.value) ? ' symbol-dropdown-item-functions-indexed-default' : ''}`}
                              role="menuitem"
                              title={symbolItemTitle(item)}
                              aria-label={symbolItemTitle(item)}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const useIndexedDefault = indexedFunctionDefaults.has(item.value)
                                onInsertSnippet(item.value, useIndexedDefault ? 'func-slot' : item.mode)
                                setIsOpen(false)
                              }}
                            >
                              {indexedFunctionDefaults.has(item.value) ? (
                                <span className="symbol-dropdown-item-variant-label">
                                  <span>{symbolItemDisplay(item)}</span>
                                  <span className="symbol-dropdown-item-variant-slot" aria-hidden="true">
                                    <FontAwesomeIcon icon={faSquareRegular} />
                                  </span>
                                </span>
                              ) : symbolItemDisplay(item)}
                            </button>
                            <span className="cell-button-tooltip">{symbolItemTitle(item)}</span>
                          </div>
                          <div className="cell-button-tooltip-wrap symbol-dropdown-item-variant-wrap">
                            <button
                              type="button"
                              className="symbol-btn symbol-dropdown-item-variant-trigger"
                              role="menuitem"
                              title={`${symbolItemTitle(item)} insertion options`}
                              aria-label={`${symbolItemTitle(item)} insertion options`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const key = `${section.label ?? group.label}-${item.value}`
                                setOpenVariantKey((current) => (current === key ? null : key))
                              }}
                            >
                              <FontAwesomeIcon icon={faChevronDown} />
                            </button>
                            {openVariantKey === `${section.label ?? group.label}-${item.value}` ? (
                              <div className="symbol-dropdown-item-variant-menu">
                                <button
                                  type="button"
                                  className="symbol-btn symbol-dropdown-item-variant-option"
                                  role="menuitem"
                                  title={`${symbolItemTitle(item)} with argument slot`}
                                  aria-label={`${symbolItemTitle(item)} with argument slot`}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    onInsertSnippet(item.value, 'func-slot')
                                    setIndexedFunctionDefaults((current) => {
                                      const next = new Set(current)
                                      next.add(item.value)
                                      return next
                                    })
                                    setOpenVariantKey(null)
                                    setIsOpen(false)
                                  }}
                                >
                                  <span className="symbol-dropdown-item-variant-label">
                                    <span>{symbolItemDisplay(item)}</span>
                                    <span className="symbol-dropdown-item-variant-slot" aria-hidden="true">
                                      <FontAwesomeIcon icon={faSquareRegular} />
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="symbol-btn symbol-dropdown-item-variant-option"
                                  role="menuitem"
                                  title={symbolItemTitle(item)}
                                  aria-label={symbolItemTitle(item)}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    onInsertSnippet(item.value, item.mode)
                                    setIndexedFunctionDefaults((current) => {
                                      const next = new Set(current)
                                      next.delete(item.value)
                                      return next
                                    })
                                    setOpenVariantKey(null)
                                    setIsOpen(false)
                                  }}
                                >
                                  {symbolItemDisplay(item)}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`symbol-btn symbol-dropdown-item${isWideDropdown ? ' symbol-dropdown-item-functions' : ''}`}
                            role="menuitem"
                            title={symbolItemTitle(item)}
                            aria-label={symbolItemTitle(item)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              onInsertSnippet(item.value, item.mode)
                              setIsOpen(false)
                            }}
                          >
                            {symbolItemDisplay(item)}
                          </button>
                          <span className="cell-button-tooltip">{symbolItemTitle(item)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <CustomScrollbar targetRef={menuRef} className="custom-scrollbar-menu" />
          {floatingTooltip ? (
            <span
              className={`dropdown-floating-tooltip dropdown-floating-tooltip-${floatingTooltip.placement}`}
              style={{ top: `${floatingTooltip.top}px`, left: `${floatingTooltip.left}px` }}
            >
              {floatingTooltip.title}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function EditorToolbar({
  hasActiveCell,
  canSave,
  onInsertSnippet,
  onFormatText,
  onCreateLink,
  onExportPdf,
  onExportLatex,
  onNewNotebook,
  onOpenNotebook,
  onSaveNotebook,
  onSaveNotebookAs,
  recentFiles,
  onOpenRecentFile,
  appSettings,
  microphones,
  isModelRestartRequired,
  onUpdateSettings,
  onRefreshMicrophones,
  onRestartApp,
  onDismissModelRestart,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canCopyContent,
  canDeleteSelection,
  onCopyContent,
  onCopyAs,
  onCutContent,
  onDeleteSelection,
  onMenuVisibilityChange,
  helpMenuRequest,
}: EditorToolbarProps) {
  const inlineSymbolGroups = SYMBOL_GROUPS.filter((group) => !DROPDOWN_GROUP_LABEL_SET.has(group.label))
  const dropdownSymbolGroups = DROPDOWN_GROUP_LABELS
    .map((label) => SYMBOL_GROUPS.find((group) => group.label === label))
    .filter((group): group is SymbolGroup => Boolean(group))
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false)
  const [isCommandsMenuOpen, setIsCommandsMenuOpen] = useState(false)
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false)
  const [helpSearchQuery, setHelpSearchQuery] = useState('')
  const [activeHelpMatchIndex, setActiveHelpMatchIndex] = useState(0)
  const [isManualPdfExporting, setIsManualPdfExporting] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [isCopyAsMenuOpen, setIsCopyAsMenuOpen] = useState(false)
  const [isMicrophoneMenuOpen, setIsMicrophoneMenuOpen] = useState(false)
  const [speechCommands, setSpeechCommands] = useState<SpeechCommandInfo[] | null>(null)
  const [speechCommandsError, setSpeechCommandsError] = useState<string | null>(null)
  const [activeAliasCommand, setActiveAliasCommand] = useState<string | null>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const [aliasNotice, setAliasNotice] = useState<string | null>(null)
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [aliasSavingCommand, setAliasSavingCommand] = useState<string | null>(null)
  const fileMenuContainerRef = useRef<HTMLElement | null>(null)
  const microphoneMenuRef = useRef<HTMLDivElement | null>(null)
  const aliasInputRef = useRef<HTMLInputElement | null>(null)
  const helpContentRef = useRef<HTMLElement | null>(null)
  const helpSearchInputRef = useRef<HTMLInputElement | null>(null)
  const helpMatchCount = useMemo(() => countHelpMarkdownMatches(helpMarkdown, helpSearchQuery), [helpSearchQuery])
  const renderedHelpMarkdown = useMemo(() => {
    const searchState: HelpSearchState = {
      query: helpSearchQuery,
      activeIndex: activeHelpMatchIndex,
      currentIndex: 0,
    }
    return renderHelpMarkdown(helpMarkdown, searchState)
  }, [activeHelpMatchIndex, helpSearchQuery])
  const speechCommandGroups = useMemo(() => {
    if (!speechCommands) return []

    return SPEECH_COMMAND_CATEGORY_GROUPS
      .map((group) => ({
        ...group,
        commands: speechCommands.filter((command) => command.category === group.category),
      }))
      .filter((group) => group.commands.length > 0)
  }, [speechCommands])

  useEffect(() => {
    onMenuVisibilityChange?.(isFileMenuOpen || isEditMenuOpen || isCommandsMenuOpen || isSettingsMenuOpen || isHelpMenuOpen)
  }, [isCommandsMenuOpen, isEditMenuOpen, isFileMenuOpen, isHelpMenuOpen, isSettingsMenuOpen, onMenuVisibilityChange])

  useEffect(() => {
    if (!helpMenuRequest) return

    setIsHelpMenuOpen((current) => (helpMenuRequest.action === 'toggle' ? !current : false))
    setIsFileMenuOpen(false)
    setIsEditMenuOpen(false)
    setIsCommandsMenuOpen(false)
    setIsSettingsMenuOpen(false)
    setIsExportMenuOpen(false)
    setIsCopyAsMenuOpen(false)
    setIsMicrophoneMenuOpen(false)
  }, [helpMenuRequest])

  useEffect(() => {
    if (helpMatchCount === 0 && activeHelpMatchIndex !== 0) {
      setActiveHelpMatchIndex(0)
    } else if (helpMatchCount > 0 && activeHelpMatchIndex >= helpMatchCount) {
      setActiveHelpMatchIndex(helpMatchCount - 1)
    }
  }, [activeHelpMatchIndex, helpMatchCount])

  useEffect(() => {
    if (!isHelpMenuOpen) return
    helpSearchInputRef.current?.focus()
  }, [isHelpMenuOpen])

  useEffect(() => {
    if (!isHelpMenuOpen || !helpSearchQuery.trim()) return
    helpContentRef.current?.querySelector('.help-search-match-active')?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    })
  }, [activeHelpMatchIndex, helpSearchQuery, isHelpMenuOpen, renderedHelpMarkdown])

  useEffect(() => {
    if (!isFileMenuOpen && !isEditMenuOpen && !isCommandsMenuOpen && !isSettingsMenuOpen && !isHelpMenuOpen) {
      return
    }

    function handleOutsideClick(event: MouseEvent) {
      if (fileMenuContainerRef.current && !fileMenuContainerRef.current.contains(event.target as Node)) {
        setIsFileMenuOpen(false)
        setIsEditMenuOpen(false)
        setIsCommandsMenuOpen(false)
        setIsSettingsMenuOpen(false)
        setIsHelpMenuOpen(false)
        setIsExportMenuOpen(false)
        setIsCopyAsMenuOpen(false)
        setIsMicrophoneMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isCommandsMenuOpen, isEditMenuOpen, isFileMenuOpen, isHelpMenuOpen, isSettingsMenuOpen])

  useEffect(() => {
    if (!isMicrophoneMenuOpen) return

    function handleOutsideMicrophoneClick(event: MouseEvent) {
      if (!microphoneMenuRef.current?.contains(event.target as Node)) {
        setIsMicrophoneMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideMicrophoneClick)
    return () => document.removeEventListener('mousedown', handleOutsideMicrophoneClick)
  }, [isMicrophoneMenuOpen])

  useEffect(() => {
    if (!isCommandsMenuOpen || speechCommands) return

    let isMounted = true
    setSpeechCommandsError(null)
    void window.eqoustics.listSpeechCommands()
      .then((commands) => {
        if (isMounted) {
          setSpeechCommands(commands)
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setSpeechCommandsError(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      isMounted = false
    }
  }, [isCommandsMenuOpen, speechCommands])

  useEffect(() => {
    if (!activeAliasCommand) return
    aliasInputRef.current?.focus()
  }, [activeAliasCommand])

  const beginAliasCreation = (command: SpeechCommandInfo) => {
    if (!command.canCreateAliases) return
    setActiveAliasCommand(command.command)
    setAliasDraft('')
    setAliasNotice(`Create a text snippet that functions as an alias for "${command.name}".`)
    setAliasError(null)
  }

  const cancelAliasCreation = () => {
    setActiveAliasCommand(null)
    setAliasDraft('')
    setAliasNotice(null)
    setAliasError(null)
  }

  const saveAlias = async (command: SpeechCommandInfo) => {
    const alias = aliasDraft.trim()
    if (!alias) {
      setAliasError('Alias cannot be empty.')
      return
    }

    setAliasSavingCommand(command.command)
    setAliasError(null)
    try {
      const commands = await window.eqoustics.addSpeechCommandAlias({ command: command.command, alias })
      setSpeechCommands(commands)
      setActiveAliasCommand(null)
      setAliasDraft('')
      setAliasNotice(null)
    } catch (error) {
      setAliasError(error instanceof Error ? error.message : String(error))
    } finally {
      setAliasSavingCommand(null)
    }
  }

  const deleteAlias = async (command: SpeechCommandInfo, alias: string) => {
    const shouldDelete = window.confirm(`Delete the alias "${alias}"?`)
    if (!shouldDelete) return

    setAliasSavingCommand(command.command)
    setAliasError(null)
    try {
      const commands = await window.eqoustics.deleteSpeechCommandAlias({ command: command.command, alias })
      setSpeechCommands(commands)
      if (activeAliasCommand === command.command) {
        cancelAliasCreation()
      }
    } catch (error) {
      setActiveAliasCommand(command.command)
      setAliasError(error instanceof Error ? error.message : String(error))
    } finally {
      setAliasSavingCommand(null)
    }
  }

  const executeFileAction = (action: () => void | Promise<void>) => {
    void action()
    setIsFileMenuOpen(false)
    setIsEditMenuOpen(false)
    setIsCommandsMenuOpen(false)
    setIsSettingsMenuOpen(false)
    setIsHelpMenuOpen(false)
    setIsExportMenuOpen(false)
    setIsCopyAsMenuOpen(false)
    setIsMicrophoneMenuOpen(false)
  }

  const executeEditAction = (action: () => void | Promise<void>) => {
    void action()
    setIsFileMenuOpen(false)
    setIsEditMenuOpen(false)
    setIsCommandsMenuOpen(false)
    setIsSettingsMenuOpen(false)
    setIsHelpMenuOpen(false)
    setIsExportMenuOpen(false)
    setIsCopyAsMenuOpen(false)
    setIsMicrophoneMenuOpen(false)
  }
  const goToPreviousHelpMatch = () => {
    if (helpMatchCount === 0) return
    setActiveHelpMatchIndex((current) => (current - 1 + helpMatchCount) % helpMatchCount)
  }
  const goToNextHelpMatch = () => {
    if (helpMatchCount === 0) return
    setActiveHelpMatchIndex((current) => (current + 1) % helpMatchCount)
  }
  const exportHelpManualPdf = async () => {
    setIsManualPdfExporting(true)
    try {
      await window.eqoustics.exportNotebookPdf({
        title: 'Eqoustics Manual',
        html: helpMarkdownToPdfHtml(helpMarkdown),
      })
    } finally {
      setIsManualPdfExporting(false)
    }
  }
  const visibleRecentFiles = [...recentFiles]
    .sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt))
    .slice(0, 7)
  const selectedMicrophone = microphones.find((microphone) => microphone.deviceId === appSettings.microphoneDeviceId)
  const selectedMicrophoneLabel = selectedMicrophone?.label || (appSettings.microphoneDeviceId ? 'Selected microphone' : 'System default')

  return (
    <header className="editor-toolbar" ref={fileMenuContainerRef}>
      <div className="toolbar-row toolbar-row-menu">
        <div className="toolbar-group">
          <button
            type="button"
            className={`menu-bar-button${isFileMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isFileMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsFileMenuOpen((current) => !current)
              setIsEditMenuOpen(false)
              setIsCommandsMenuOpen(false)
              setIsSettingsMenuOpen(false)
              setIsHelpMenuOpen(false)
              setIsExportMenuOpen(false)
              setIsCopyAsMenuOpen(false)
              setIsMicrophoneMenuOpen(false)
            }}
          >
            <span>File</span>
          </button>
          <button
            type="button"
            className={`menu-bar-button${isEditMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isEditMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsEditMenuOpen((current) => !current)
              setIsFileMenuOpen(false)
              setIsCommandsMenuOpen(false)
              setIsSettingsMenuOpen(false)
              setIsHelpMenuOpen(false)
              setIsExportMenuOpen(false)
              setIsCopyAsMenuOpen(false)
              setIsMicrophoneMenuOpen(false)
            }}
          >
            <span>Edit</span>
          </button>
          <button
            type="button"
            className={`menu-bar-button${isCommandsMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isCommandsMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsCommandsMenuOpen((current) => !current)
              setIsFileMenuOpen(false)
              setIsEditMenuOpen(false)
              setIsSettingsMenuOpen(false)
              setIsHelpMenuOpen(false)
              setIsExportMenuOpen(false)
              setIsCopyAsMenuOpen(false)
              setIsMicrophoneMenuOpen(false)
            }}
          >
            <span>Commands</span>
          </button>
          <button
            type="button"
            className={`menu-bar-button${isSettingsMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isSettingsMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsSettingsMenuOpen((current) => !current)
              setIsFileMenuOpen(false)
              setIsEditMenuOpen(false)
              setIsCommandsMenuOpen(false)
              setIsHelpMenuOpen(false)
              setIsExportMenuOpen(false)
              setIsCopyAsMenuOpen(false)
              setIsMicrophoneMenuOpen(false)
              void onRefreshMicrophones()
            }}
          >
            <span>Settings</span>
          </button>
          <button
            type="button"
            className={`menu-bar-button${isHelpMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={isHelpMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsHelpMenuOpen((current) => !current)
              setIsFileMenuOpen(false)
              setIsEditMenuOpen(false)
              setIsCommandsMenuOpen(false)
              setIsSettingsMenuOpen(false)
              setIsExportMenuOpen(false)
              setIsCopyAsMenuOpen(false)
              setIsMicrophoneMenuOpen(false)
            }}
          >
            <span>Help</span>
          </button>
        </div>
      </div>
      <div className="toolbar-row toolbar-row-contextual">
        <div className="toolbar-symbols-wrap">
          {/* Quick-access notation buttons */}
          <div className="toolbar-group toolbar-group-bordered">
            <span className="toolbar-group-label">Notation</span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Fraction - creates numerator/denominator slots"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\frac', 'cmd')}
              >
                <TextFractionDisplay numerator="a" denominator="b" />
              </button>
              <span className="cell-button-tooltip">Fraction</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Square root - type inside the radical"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\sqrt', 'cmd')}
              >
                <FontAwesomeIcon icon={faSquareRootVariable} />
              </button>
              <span className="cell-button-tooltip">Square root</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Indexed root - type the root number, then the radicand"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\sqrt[]', 'cmd')}
              >
                <span className="nth-root-symbol">n</span>
                <FontAwesomeIcon icon={faSquareRootVariable} />
              </button>
              <span className="cell-button-tooltip">Indexed root</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Superscript / Power - type the exponent"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('^', 'cmd')}
              >
                <span>x<sup>n</sup></span>
              </button>
              <span className="cell-button-tooltip">Power / Exponent</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Subscript - type the subscript"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('_', 'cmd')}
              >
                <span>x<sub>n</sub></span>
              </button>
              <span className="cell-button-tooltip">Subscript</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Lower bound"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\underset', 'cmd')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: '1px' }}>
                  <span style={{ fontSize: '0.7em' }}>x</span>
                  <span style={{ fontSize: '0.55em' }}>a</span>
                </div>
              </button>
              <span className="cell-button-tooltip">Lower bound</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Upper bound"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\overset', 'cmd')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: '1px' }}>
                  <span style={{ fontSize: '0.55em' }}>b</span>
                  <span style={{ fontSize: '0.7em' }}>x</span>
                </div>
              </button>
              <span className="cell-button-tooltip">Upper bound</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Lower and upper bounds"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\bothset', 'cmd')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: '0px' }}>
                  <span style={{ fontSize: '0.5em' }}>b</span>
                  <span style={{ fontSize: '0.65em' }}>x</span>
                  <span style={{ fontSize: '0.5em' }}>a</span>
                </div>
              </button>
              <span className="cell-button-tooltip">Lower and upper bounds</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Absolute value"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left|\\right|', 'write')}
              >
                |x|
              </button>
              <span className="cell-button-tooltip">Absolute value</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Parentheses"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left(\\right)', 'write')}
              >
                ()
              </button>
              <span className="cell-button-tooltip">Parentheses</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Brackets"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left[\\right]', 'write')}
              >
                []
              </button>
              <span className="cell-button-tooltip">Brackets</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Curly braces"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left\\lbrace\\right\\rbrace', 'write')}
              >
                {'{ }'}
              </button>
              <span className="cell-button-tooltip">Curly braces</span>
            </span>
          </div>

          {/* Symbol groups */}
          {inlineSymbolGroups.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <span className="toolbar-group-label">{group.label}</span>
              {group.items.map((item) => (
                <span key={symbolItemTitle(item)} className="cell-button-tooltip-wrap">
                  <button
                    type="button"
                    aria-label={symbolItemTitle(item)}
                    disabled={!hasActiveCell}
                    className="symbol-btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsertSnippet(item.value, item.mode)}
                  >
                    {symbolItemDisplay(item)}
                  </button>
                  <span className="cell-button-tooltip">{symbolItemTitle(item)}</span>
                </span>
              ))}
            </div>
          ))}

          <MatrixDropdown disabled={!hasActiveCell} onInsertSnippet={onInsertSnippet} />
          <CasesDropdown disabled={!hasActiveCell} onInsertSnippet={onInsertSnippet} />

          {dropdownSymbolGroups.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <SymbolDropdown disabled={!hasActiveCell} group={group} onInsertSnippet={onInsertSnippet} />
            </div>
          ))}
        </div>
      </div>
      <div className="toolbar-row toolbar-row-file-actions">
        <div className="toolbar-group">
          <div className="title-icon-actions" aria-label="File actions">
            <span className="cell-button-tooltip-wrap tooltip-edge-safe-left">
              <button type="button" className="icon-button icon-button-compact" onClick={onNewNotebook}>
                <FontAwesomeIcon icon={faFile} />
              </button>
              <span className="cell-button-tooltip">New Document</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" onClick={onOpenNotebook}>
                <FontAwesomeIcon icon={faFolderOpen} />
              </button>
              <span className="cell-button-tooltip">Open</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!canSave} onClick={onSaveNotebook}>
                <FontAwesomeIcon icon={faFloppyDisk} />
              </button>
              <span className="cell-button-tooltip">Save</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!canUndo} onMouseDown={(event) => event.preventDefault()} onClick={onUndo}>
                <FontAwesomeIcon icon={faArrowRotateLeft} />
              </button>
              <span className="cell-button-tooltip">Undo</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!canRedo} onMouseDown={(event) => event.preventDefault()} onClick={onRedo}>
                <FontAwesomeIcon icon={faArrowRotateRight} />
              </button>
              <span className="cell-button-tooltip">Redo</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('bold')}>
                <FontAwesomeIcon icon={faBold} />
              </button>
              <span className="cell-button-tooltip">Bold</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('italic')}>
                <FontAwesomeIcon icon={faItalic} />
              </button>
              <span className="cell-button-tooltip">Italic</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('underline')}>
                <FontAwesomeIcon icon={faUnderline} />
              </button>
              <span className="cell-button-tooltip">Underline</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            {[1, 2, 3, 4].map((level) => (
              <span key={level} className="cell-button-tooltip-wrap">
                <button
                  type="button"
                  className="icon-button icon-button-compact heading-format-button"
                  disabled={!hasActiveCell}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFormatText(`heading${level}` as TextFormatCommand)}
                >
                  <FontAwesomeIcon icon={faHeading} />
                  <span className="heading-format-level">{level}</span>
                </button>
                <span className="cell-button-tooltip">Heading {level}</span>
              </span>
            ))}
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('bulletList')}>
                <FontAwesomeIcon icon={faListUl} />
              </button>
              <span className="cell-button-tooltip">Bullets</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('numberedList')}>
                <FontAwesomeIcon icon={faListOl} />
              </button>
              <span className="cell-button-tooltip">Numbering</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={onCreateLink}>
                <FontAwesomeIcon icon={faLink} />
              </button>
              <span className="cell-button-tooltip">Hyperlink</span>
            </span>
          </div>
        </div>
      </div>
      <div className={`file-menu-drawer${isFileMenuOpen ? ' file-menu-drawer-open' : ''}`} role="menu" aria-label="File">
        <button type="button" className="file-menu-item" role="menuitem" onClick={() => executeFileAction(onNewNotebook)}>
          <FontAwesomeIcon icon={faFile} style={{ width: '1rem', marginRight: '0.4rem' }} /> New Document
        </button>
        <button type="button" className="file-menu-item" role="menuitem" onClick={() => executeFileAction(onOpenNotebook)}>
          <FontAwesomeIcon icon={faFolderOpen} style={{ width: '1rem', marginRight: '0.4rem' }} /> Open Existing Document
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canSave} onClick={() => executeFileAction(onSaveNotebook)}>
          <FontAwesomeIcon icon={faFloppyDisk} style={{ width: '1rem', marginRight: '0.4rem' }} /> Save File
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canSave} onClick={() => executeFileAction(onSaveNotebookAs)}>
          <FontAwesomeIcon icon={faFloppyDisk} style={{ width: '1rem', marginRight: '0.4rem' }} /> Save As…
        </button>
        <div className="menu-divider" />
        <div className="file-menu-export">
          <button
            type="button"
            className={`file-menu-item file-menu-export-trigger${isExportMenuOpen ? ' file-menu-export-trigger-open' : ''}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isExportMenuOpen}
            disabled={!canSave}
            onClick={() => setIsExportMenuOpen((current) => !current)}
          >
            <span><FontAwesomeIcon icon={faFileExport} style={{ width: '1rem', marginRight: '0.4rem' }} /> Export As…</span>
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
          {isExportMenuOpen ? (
            <div className="file-menu-export-options" role="menu">
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onClick={() => executeFileAction(onExportPdf)}>
                <FontAwesomeIcon icon={faFilePdf} style={{ width: '1rem', marginRight: '0.4rem' }} /> PDF (.pdf)
              </button>
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onClick={() => executeFileAction(onExportLatex)}>
                <FontAwesomeIcon icon={faFileCode} style={{ width: '1rem', marginRight: '0.4rem' }} /> LaTeX (.tex)
              </button>
            </div>
          ) : null}
        </div>
        <div className="menu-divider" />
        <div className="file-menu-recents" aria-label="Recent Files">
          <div className="file-menu-section-label">Recent Files</div>
          {visibleRecentFiles.length > 0 ? (
            visibleRecentFiles.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="file-menu-item file-menu-recent-item"
                role="menuitem"
                title={entry.path}
                onClick={() => executeFileAction(() => { void onOpenRecentFile(entry.path) })}
              >
                <FontAwesomeIcon icon={faFile} style={{ width: '1rem', marginRight: '0.4rem' }} />
                <span className="file-menu-recent-text">
                  <span className="file-menu-recent-title">{entry.title}</span>
                  <span className="file-menu-recent-path">{entry.path}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="file-menu-empty">No recent files</div>
          )}
        </div>
        <div className="menu-divider" />
        <section className="file-menu-about" aria-label="About Eqoustics">
          <div className="file-menu-section-label">About</div>
          <div className="file-menu-about-title">Eqoustics</div>
          <div className="file-menu-about-line">Version {packageMetadata.version}</div>
          <div className="file-menu-about-line">Copyright (c) 2026 Srivats Shankar</div>
        </section>
      </div>
      <div className={`file-menu-drawer edit-menu-drawer${isEditMenuOpen ? ' file-menu-drawer-open' : ''}`} role="menu" aria-label="Edit">
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canUndo} onClick={() => executeEditAction(onUndo)}>
          <FontAwesomeIcon icon={faArrowRotateLeft} style={{ width: '1rem', marginRight: '0.4rem' }} /> Undo
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canRedo} onClick={() => executeEditAction(onRedo)}>
          <FontAwesomeIcon icon={faArrowRotateRight} style={{ width: '1rem', marginRight: '0.4rem' }} /> Redo
        </button>
        <div className="menu-divider" />
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canCopyContent} onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(onCutContent)}>
          <FontAwesomeIcon icon={faScissors} style={{ width: '1rem', marginRight: '0.4rem' }} /> Cut
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canCopyContent} onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(onCopyContent)}>
          <FontAwesomeIcon icon={faCopy} style={{ width: '1rem', marginRight: '0.4rem' }} /> Copy
        </button>
        <div className="file-menu-export">
          <button
            type="button"
            className={`file-menu-item file-menu-export-trigger${isCopyAsMenuOpen ? ' file-menu-export-trigger-open' : ''}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isCopyAsMenuOpen}
            disabled={!canCopyContent}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsCopyAsMenuOpen((current) => !current)}
          >
            <span><FontAwesomeIcon icon={faCopy} style={{ width: '1rem', marginRight: '0.4rem' }} /> Copy As...</span>
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
          {isCopyAsMenuOpen ? (
            <div className="file-menu-export-options" role="menu">
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(() => onCopyAs('latex'))}>
                LaTeX
              </button>
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(() => onCopyAs('notation'))}>
                Notation
              </button>
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(() => onCopyAs('png'))}>
                PNG Image
              </button>
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(() => onCopyAs('jpeg'))}>
                JPEG Image
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="file-menu-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(async () => {
          try {
            const text = await navigator.clipboard.readText()
            document.execCommand('insertText', false, text)
          } catch (e) {
            console.error(e)
          }
        })}>
          <FontAwesomeIcon icon={faPaste} style={{ width: '1rem', marginRight: '0.4rem' }} /> Paste
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canDeleteSelection} onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(onDeleteSelection)}>
          <FontAwesomeIcon icon={faTrash} style={{ width: '1rem', marginRight: '0.4rem' }} /> Delete
        </button>
      </div>
      <div className={`file-menu-drawer commands-menu-drawer${isCommandsMenuOpen ? ' file-menu-drawer-open' : ''}`} role="menu" aria-label="Commands">
        {speechCommandsError ? (
          <div className="file-menu-empty">Unable to load commands: {speechCommandsError}</div>
        ) : speechCommands ? (
          speechCommands.length > 0 ? (
            <div className="speech-command-list">
              {speechCommandGroups.map((group) => (
                <section key={group.category} className="speech-command-category" aria-labelledby={`speech-command-category-${group.category}`}>
                  <h3 id={`speech-command-category-${group.category}`} className="file-menu-section-label speech-command-category-heading">{group.label}</h3>
                  <div className="speech-command-category-list">
                    {group.commands.map((command) => {
                      const userAliases = new Set(command.userAliases ?? [])
                      const isEditingAlias = activeAliasCommand === command.command
                      const isSavingAlias = aliasSavingCommand === command.command

                      return (
                        <details key={command.command} className="speech-command-accordion">
                          <summary className="speech-command-summary">
                            <span>{command.name}</span>
                            <FontAwesomeIcon icon={faChevronDown} />
                          </summary>
                          <div className="speech-command-details">
                            <p>{command.description}</p>
                            {command.aliases.length > 0 || command.canCreateAliases ? (
                              <div className="speech-command-aliases">
                                <span className="file-menu-section-label speech-command-alias-label">Aliases</span>
                                <div className="speech-command-alias-list">
                                  {command.aliases.map((alias) => {
                                    const isUserAlias = userAliases.has(alias)
                                    return (
                                      <span key={alias} className={`speech-command-alias${isUserAlias ? ' speech-command-alias-user' : ''}`}>
                                        <span>{alias}</span>
                                        {isUserAlias ? (
                                          <button
                                            type="button"
                                            className="speech-command-alias-delete"
                                            title="delete alias"
                                            aria-label={`Delete alias ${alias}`}
                                            disabled={isSavingAlias}
                                            onClick={() => {
                                              void deleteAlias(command, alias)
                                            }}
                                          >
                                            <FontAwesomeIcon icon={faXmark} />
                                          </button>
                                        ) : null}
                                      </span>
                                    )
                                  })}
                                  {command.canCreateAliases ? (
                                    <span className="cell-button-tooltip-wrap speech-command-alias-tooltip-wrap">
                                      <button
                                        type="button"
                                        className="speech-command-alias-add"
                                        aria-label={`Create an alias for ${command.name}`}
                                        disabled={isSavingAlias}
                                        onClick={() => beginAliasCreation(command)}
                                      >
                                        <FontAwesomeIcon icon={faPlus} />
                                      </button>
                                      <span className="cell-button-tooltip">Create an alias</span>
                                    </span>
                                  ) : null}
                                </div>
                                {isEditingAlias ? (
                                  <>
                                    {aliasNotice ? (
                                      <div className="speech-command-alias-notice" role="status" aria-live="polite">{aliasNotice}</div>
                                    ) : null}
                                    <form
                                      className="speech-command-alias-form"
                                      onSubmit={(event) => {
                                        event.preventDefault()
                                        void saveAlias(command)
                                      }}
                                    >
                                      <input
                                        ref={aliasInputRef}
                                        value={aliasDraft}
                                        placeholder="Text snippet"
                                        aria-label={`New alias for ${command.name}`}
                                        disabled={isSavingAlias}
                                        onChange={(event) => {
                                          setAliasDraft(event.target.value)
                                          setAliasError(null)
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Escape') {
                                            event.preventDefault()
                                            cancelAliasCreation()
                                          }
                                        }}
                                      />
                                      <button type="submit" title="save alias" aria-label="Save alias" disabled={isSavingAlias}>
                                        <FontAwesomeIcon icon={faCheck} />
                                      </button>
                                      <button type="button" title="cancel" aria-label="Cancel alias creation" disabled={isSavingAlias} onClick={cancelAliasCreation}>
                                        <FontAwesomeIcon icon={faXmark} />
                                      </button>
                                    </form>
                                  </>
                                ) : null}
                                {isEditingAlias && aliasError ? (
                                  <div className="speech-command-alias-error" role="alert">{aliasError}</div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="file-menu-empty">No commands available.</div>
          )
        ) : (
          <div className="speech-command-loading" role="status" aria-live="polite">
            <span className="speech-command-loading-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="speech-command-loading-text">
              <span>Loading commands</span>
              <span>Just a moment while they are prepared.</span>
            </span>
          </div>
        )}
      </div>
      <div className={`file-menu-drawer settings-menu-drawer${isSettingsMenuOpen ? ' file-menu-drawer-open' : ''}`} role="menu" aria-label="Settings">
        <section className="settings-menu-section" aria-labelledby="settings-microphone-label">
          <div className="settings-menu-heading" id="settings-microphone-label">
            <FontAwesomeIcon icon={faMicrophone} />
            <span>Microphone</span>
          </div>
          <div className="settings-microphone-dropdown" ref={microphoneMenuRef}>
            <button
              type="button"
              className={`settings-microphone-trigger${isMicrophoneMenuOpen ? ' settings-microphone-trigger-open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={isMicrophoneMenuOpen}
              onClick={() => setIsMicrophoneMenuOpen((current) => !current)}
            >
              <span>{selectedMicrophoneLabel}</span>
              <FontAwesomeIcon icon={faChevronDown} />
            </button>
            {isMicrophoneMenuOpen ? (
              <div className="settings-microphone-options" role="listbox" aria-label="Microphone">
                <button
                  type="button"
                  className={`settings-microphone-option${appSettings.microphoneDeviceId === null ? ' settings-microphone-option-active' : ''}`}
                  role="option"
                  aria-selected={appSettings.microphoneDeviceId === null}
                  onClick={() => {
                    void onUpdateSettings({ microphoneDeviceId: null })
                    setIsMicrophoneMenuOpen(false)
                  }}
                >
                  <span>System default</span>
                  {appSettings.microphoneDeviceId === null ? <FontAwesomeIcon icon={faCheck} /> : null}
                </button>
                {microphones.map((microphone, index) => {
                  const label = microphone.label || `Microphone ${index + 1}`
                  const isSelected = microphone.deviceId === appSettings.microphoneDeviceId

                  return (
                    <button
                      key={microphone.deviceId || index}
                      type="button"
                      className={`settings-microphone-option${isSelected ? ' settings-microphone-option-active' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                      title={label}
                      onClick={() => {
                        void onUpdateSettings({ microphoneDeviceId: microphone.deviceId })
                        setIsMicrophoneMenuOpen(false)
                      }}
                    >
                      <span>{label}</span>
                      {isSelected ? <FontAwesomeIcon icon={faCheck} /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          <button type="button" className="settings-menu-secondary-button" onClick={() => { void onRefreshMicrophones() }}>
            Refresh microphones
          </button>
        </section>
        <div className="menu-divider" />
        <section className="settings-menu-section" aria-labelledby="settings-appearance-label">
          <div className="settings-menu-heading" id="settings-appearance-label">
            <FontAwesomeIcon icon={faPalette} />
            <span>Appearance</span>
          </div>
          <div className="settings-segmented-control" role="radiogroup" aria-label="Appearance">
            {[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-segment${appSettings.appearance === option.value ? ' settings-segment-active' : ''}`}
                role="radio"
                aria-checked={appSettings.appearance === option.value}
                onClick={() => { void onUpdateSettings({ appearance: option.value as AppSettingsPayload['appearance'] }) }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
        <div className="menu-divider" />
        <section className="settings-menu-section" aria-labelledby="settings-model-label">
          <div className="settings-menu-heading" id="settings-model-label">
            <FontAwesomeIcon icon={faBrain} />
            <span>Gemma Model</span>
          </div>
          <div className="settings-segmented-control" role="radiogroup" aria-label="Gemma model">
            {[
              { value: '2b', label: 'Gemma 2B' },
              { value: '4b', label: 'Gemma 4B' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-segment${appSettings.speechModelSize === option.value ? ' settings-segment-active' : ''}`}
                role="radio"
                aria-checked={appSettings.speechModelSize === option.value}
                onClick={() => { void onUpdateSettings({ speechModelSize: option.value as AppSettingsPayload['speechModelSize'] }) }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="settings-menu-note">
            Eqoustics recommends the 2B model for most users and system configurations. However, you can change the preferred model. Please note that changing the model can affect performance.
          </p>
          <div className="settings-subsection">
            <span className="file-menu-section-label">Acceleration</span>
            <div className="settings-segmented-control" role="radiogroup" aria-label="Speech acceleration">
              {[
                { value: 'gpu', label: 'GPU' },
                { value: 'cpu', label: 'CPU' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-segment${appSettings.speechAcceleration === option.value ? ' settings-segment-active' : ''}`}
                  role="radio"
                  aria-checked={appSettings.speechAcceleration === option.value}
                  onClick={() => { void onUpdateSettings({ speechAcceleration: option.value as AppSettingsPayload['speechAcceleration'] }) }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="settings-menu-note">
              GPU acceleration runs both audio and text inference on GPU, if the system is capable of running GPU reference.
            </p>
          </div>
          {isModelRestartRequired ? (
            <div className="settings-restart-panel" role="status">
              <span>Restart to load the selected LiteRT speech settings.</span>
              <div className="settings-restart-actions">
                <button type="button" className="settings-menu-secondary-button" onClick={onDismissModelRestart}>
                  Later
                </button>
                <button type="button" className="settings-menu-primary-button" onClick={() => { void onRestartApp() }}>
                  Restart now
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      <div className={`file-menu-drawer help-menu-drawer${isHelpMenuOpen ? ' file-menu-drawer-open' : ''}`} role="dialog" aria-label="Help">
        <div className="help-menu-toolbar">
          <label className="help-search-label" htmlFor="help-search-input">Search help</label>
          <div className="help-search-row">
            <input
              id="help-search-input"
              ref={helpSearchInputRef}
              className="help-search-input"
              value={helpSearchQuery}
              placeholder="Search manual"
              onChange={(event) => {
                setHelpSearchQuery(event.target.value)
                setActiveHelpMatchIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault()
                  goToPreviousHelpMatch()
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  goToNextHelpMatch()
                }
              }}
            />
            <span className="help-search-count" aria-live="polite">
              {helpSearchQuery.trim() ? `${helpMatchCount === 0 ? 0 : activeHelpMatchIndex + 1}/${helpMatchCount}` : '0/0'}
            </span>
            <button type="button" className="help-search-button" disabled={helpMatchCount === 0} onClick={goToPreviousHelpMatch} aria-label="Previous help search result">
              ↑
            </button>
            <button type="button" className="help-search-button" disabled={helpMatchCount === 0} onClick={goToNextHelpMatch} aria-label="Next help search result">
              ↓
            </button>
          </div>
          <button type="button" className="help-download-button" disabled={isManualPdfExporting} onClick={() => { void exportHelpManualPdf() }}>
            {isManualPdfExporting ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
        <article ref={helpContentRef} className="help-markdown">
          {renderedHelpMarkdown}
        </article>
      </div>
    </header>
  )
}
