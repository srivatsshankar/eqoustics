import { createEmptyNotebookDocument, type NotebookDocument, type NotebookCell } from '../shared/types/notebook'

// Current format: % @cell <id> followed by $$latex$$
const CELL_MARKER = /^% @cell ([^\s]+)$/

// Legacy formats for backward compatibility
const RT_MARKER = /^% @rt ([^\s]+) (.+)$/
const MATH_MARKER = /^% @math ([^\s]+) (true|false)$/
const LEGACY_CELL_PATTERN = /% eqoustics-cell: (rich-text|math) id=([^\s]+)(?: display=(true|false))?\n([\s\S]*?)% end-eqoustics-cell/g
const TITLE_PATTERN = /^%! title=(.*)$/m
const CREATED_AT_PATTERN = /^%! createdAt=(.*)$/m
const UPDATED_AT_PATTERN = /^%! updatedAt=(.*)$/m

function decodeBase64ToUtf8(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Extract plain text from a Lexical JSON state for migration to unified cells.
 */
function extractTextFromLexicalState(base64: string): string {
  try {
    const json = decodeBase64ToUtf8(base64)
    const parsed = JSON.parse(json) as { root: { children: Array<{ children?: Array<{ text?: string }> }> } }
    const texts: string[] = []
    for (const block of parsed.root.children ?? []) {
      for (const inline of block.children ?? []) {
        if (inline.text) texts.push(inline.text)
      }
    }
    return texts.join(' ').trim()
  } catch {
    return ''
  }
}

function parseCellsFromLines(normalized: string): NotebookCell[] {
  const lines = normalized.split('\n')
  const cells: NotebookCell[] = []

  type PendingCell =
    | { format: 'v2'; id: string; contentLines: string[] }
    | { format: 'rt'; id: string; base64: string; contentLines: string[] }
    | { format: 'math'; id: string; displayMode: boolean; contentLines: string[] }

  let pending: PendingCell | null = null

  const flush = () => {
    if (!pending) return

    const content = pending.contentLines.join('\n').trim()

    if (pending.format === 'v2') {
      // Strip $$ wrappers
      const latex = content.replace(/^\$\$/, '').replace(/\$\$$/, '').trim()
      cells.push({ id: pending.id, latex })
    } else if (pending.format === 'math') {
      const latex = content
        .replace(/^\\\[/, '')
        .replace(/\\\]$/, '')
        .replace(/^\$/, '')
        .replace(/\$$/, '')
        .trim()
      cells.push({ id: pending.id, latex })
    } else {
      // rich-text: extract text content and wrap in \text{}
      const text = pending.base64 ? extractTextFromLexicalState(pending.base64) : content
      cells.push({ id: pending.id, latex: text ? `\\text{${text}}` : '' })
    }

    pending = null
  }

  for (const line of lines) {
    const cellMatch = line.match(CELL_MARKER)
    const rtMatch = line.match(RT_MARKER)
    const mathMatch = line.match(MATH_MARKER)

    if (cellMatch) {
      flush()
      pending = { format: 'v2', id: cellMatch[1], contentLines: [] }
    } else if (rtMatch) {
      flush()
      pending = { format: 'rt', id: rtMatch[1], base64: rtMatch[2], contentLines: [] }
    } else if (mathMatch) {
      flush()
      pending = { format: 'math', id: mathMatch[1], displayMode: mathMatch[2] === 'true', contentLines: [] }
    } else if (pending && line !== '\\end{document}' && !line.startsWith('%! ')) {
      pending.contentLines.push(line)
    }
  }

  flush()
  return cells
}

function parseLegacyCells(normalized: string): NotebookCell[] {
  const cells: NotebookCell[] = []

  for (const match of normalized.matchAll(LEGACY_CELL_PATTERN)) {
    const kind = match[1]
    const id = match[2]
    const body = match[4].trim()

    if (kind === 'math') {
      const latex = body
        .replace(/^\\\[/, '')
        .replace(/\\\]$/, '')
        .replace(/^\$/, '')
        .replace(/\$$/, '')
        .trim()
      cells.push({ id, latex })
    } else {
      // Rich text — strip LaTeX commands to get plain text, wrap in \text{}
      const plainText = body.replace(/\\[a-zA-Z]+\{?|[{}]/g, '').replace(/\s+/g, ' ').trim()
      cells.push({ id, latex: plainText ? `\\text{${plainText}}` : '' })
    }
  }

  return cells
}

export function parseNotebookFromLatex(content: string, fallbackTitle?: string): NotebookDocument {
  const normalized = content.replace(/\r\n/g, '\n')
  const document = createEmptyNotebookDocument()
  const titleMatch = normalized.match(TITLE_PATTERN)
  const createdAtMatch = normalized.match(CREATED_AT_PATTERN)
  const updatedAtMatch = normalized.match(UPDATED_AT_PATTERN)

  document.metadata.title = titleMatch?.[1]?.trim() || fallbackTitle || document.metadata.title
  document.metadata.createdAt = createdAtMatch?.[1]?.trim() || document.metadata.createdAt
  document.metadata.updatedAt = updatedAtMatch?.[1]?.trim() || document.metadata.updatedAt

  // Try the current line-based format first
  let cells = parseCellsFromLines(normalized)

  // Fall back to the legacy block format for files saved before the format change
  if (cells.length === 0) {
    cells = parseLegacyCells(normalized)
  }

  document.cells = cells.length > 0 ? cells : document.cells

  return document
}