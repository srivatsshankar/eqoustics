import { createEmptyNotebookDocument, type NotebookDocument, type NotebookCell } from '../shared/types/notebook'

// Current format: single marker comment followed by content lines until the next marker
const RT_MARKER = /^% @rt ([^\s]+) (.+)$/
const MATH_MARKER = /^% @math ([^\s]+) (true|false)$/

// Legacy format (files saved before the line-based format)
const LEGACY_CELL_PATTERN = /% eqoustics-cell: (rich-text|math) id=([^\s]+)(?: display=(true|false))?\n([\s\S]*?)% end-eqoustics-cell/g
const TITLE_PATTERN = /^%! title=(.*)$/m
const CREATED_AT_PATTERN = /^%! createdAt=(.*)$/m
const UPDATED_AT_PATTERN = /^%! updatedAt=(.*)$/m

// Legacy: lexical state embedded as % eqoustics-lexical: <base64>
const LEGACY_LEXICAL_STATE_PATTERN = /^% eqoustics-lexical: (.*)$/m

function decodeBase64ToUtf8(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function createParagraphLexicalState(text: string): string {
  const normalized = text.replace(/\\[a-zA-Z]+\{?|[{}]/g, '').replace(/\s+/g, ' ').trim()

  return JSON.stringify({
    root: {
      children: [
        {
          children: normalized
            ? [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: normalized,
                  type: 'text',
                  version: 1,
                },
              ]
            : [],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  })
}

function parseLegacyCellBody(kind: string, id: string, displayFlag: string | undefined, rawBody: string): NotebookCell {
  const body = rawBody.trim()

  if (kind === 'math') {
    const latex = body.replace(/^\\\[/, '').replace(/\\\]$/, '').replace(/^\$/, '').replace(/\$$/, '').trim()
    return {
      id,
      kind: 'math',
      latex,
      displayMode: displayFlag === 'true',
    }
  }

  const lexicalMatch = body.match(LEGACY_LEXICAL_STATE_PATTERN)

  return {
    id,
    kind: 'rich-text',
    lexicalState: lexicalMatch ? decodeBase64ToUtf8(lexicalMatch[1]) : createParagraphLexicalState(body),
  }
}

function parseCellsFromLines(normalized: string): NotebookCell[] {
  const lines = normalized.split('\n')
  const cells: NotebookCell[] = []

  type PendingCell =
    | { kind: 'rich-text'; id: string; base64: string; contentLines: string[] }
    | { kind: 'math'; id: string; displayMode: boolean; contentLines: string[] }

  let pending: PendingCell | null = null

  const flush = () => {
    if (!pending) {
      return
    }

    const content = pending.contentLines.join('\n').trim()

    if (pending.kind === 'math') {
      const latex = content
        .replace(/^\\\[/, '')
        .replace(/\\\]$/, '')
        .replace(/^\$/, '')
        .replace(/\$$/, '')
        .trim()

      cells.push({
        id: pending.id,
        kind: 'math',
        latex,
        displayMode: pending.displayMode,
      })
    } else {
      cells.push({
        id: pending.id,
        kind: 'rich-text',
        lexicalState: pending.base64 ? decodeBase64ToUtf8(pending.base64) : createParagraphLexicalState(content),
      })
    }

    pending = null
  }

  for (const line of lines) {
    const rtMatch = line.match(RT_MARKER)
    const mathMatch = line.match(MATH_MARKER)

    if (rtMatch) {
      flush()
      pending = { kind: 'rich-text', id: rtMatch[1], base64: rtMatch[2], contentLines: [] }
    } else if (mathMatch) {
      flush()
      pending = { kind: 'math', id: mathMatch[1], displayMode: mathMatch[2] === 'true', contentLines: [] }
    } else if (pending && line !== '\\end{document}' && !line.startsWith('%! ')) {
      pending.contentLines.push(line)
    }
  }

  flush()
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
    for (const match of normalized.matchAll(LEGACY_CELL_PATTERN)) {
      cells.push(parseLegacyCellBody(match[1], match[2], match[3], match[4]))
    }
  }

  document.cells = cells.length > 0 ? cells : document.cells

  return document
}