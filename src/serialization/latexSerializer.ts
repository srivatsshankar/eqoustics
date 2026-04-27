import type { NotebookCell, NotebookDocument } from '../shared/types/notebook'

const EQOUSTICS_VERSION = '1'
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 1 << 1
const FORMAT_STRIKETHROUGH = 1 << 2
const FORMAT_UNDERLINE = 1 << 3
const FORMAT_CODE = 1 << 4
const FORMAT_SUBSCRIPT = 1 << 5
const FORMAT_SUPERSCRIPT = 1 << 6

type SerializedLexicalNode = {
  type: string
  text?: string
  tag?: string
  format?: number | string
  listType?: 'number' | 'bullet' | 'check'
  checked?: boolean
  children?: SerializedLexicalNode[]
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}%$&#_^])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
}

function encodeUtf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function applyInlineFormats(text: string, format: number | string | undefined): string {
  if (typeof format !== 'number' || format === 0) {
    return text
  }

  let result = text

  if (format & FORMAT_CODE) {
    result = `\\texttt{${result}}`
  }
  if (format & FORMAT_BOLD) {
    result = `\\textbf{${result}}`
  }
  if (format & FORMAT_ITALIC) {
    result = `\\emph{${result}}`
  }
  if (format & FORMAT_UNDERLINE) {
    result = `\\underline{${result}}`
  }
  if (format & FORMAT_STRIKETHROUGH) {
    result = `\\sout{${result}}`
  }
  if (format & FORMAT_SUBSCRIPT) {
    result = `$_{${result}}$`
  }
  if (format & FORMAT_SUPERSCRIPT) {
    result = `$^{${result}}$`
  }

  return result
}

function renderInlineNode(node: SerializedLexicalNode): string {
  switch (node.type) {
    case 'text':
      return applyInlineFormats(escapeLatex(node.text ?? ''), node.format)
    case 'linebreak':
      return '\\\\'
    default:
      return (node.children ?? []).map(renderInlineNode).join('')
  }
}

function renderBlockNode(node: SerializedLexicalNode): string {
  switch (node.type) {
    case 'root':
      return (node.children ?? []).map(renderBlockNode).filter(Boolean).join('\n\n')
    case 'paragraph':
      return (node.children ?? []).map(renderInlineNode).join('')
    case 'heading': {
      const commandByTag: Record<string, string> = {
        h1: 'section',
        h2: 'subsection',
        h3: 'subsubsection',
      }
      const command = commandByTag[node.tag ?? ''] ?? 'paragraph'
      const content = (node.children ?? []).map(renderInlineNode).join('')

      return command === 'paragraph' ? content : `\\${command}{${content}}`
    }
    case 'quote':
      return `\\begin{quote}\n${(node.children ?? []).map(renderInlineNode).join('')}\n\\end{quote}`
    case 'list': {
      const environment = node.listType === 'number' ? 'enumerate' : 'itemize'
      const items = (node.children ?? []).map(renderBlockNode).join('\n')
      return `\\begin{${environment}}\n${items}\n\\end{${environment}}`
    }
    case 'listitem':
      return `\\item ${(node.children ?? []).map(renderInlineNode).join('')}`
    default:
      return (node.children ?? []).map(renderBlockNode).join('\n')
  }
}

function lexicalStateToLatex(lexicalState: string): string {
  try {
    const parsed = JSON.parse(lexicalState) as { root: SerializedLexicalNode }
    return renderBlockNode(parsed.root).trim()
  } catch {
    return ''
  }
}

function serializeCell(cell: NotebookCell): string {
  if (cell.kind === 'math') {
    const wrapperStart = cell.displayMode ? '\\[' : '$'
    const wrapperEnd = cell.displayMode ? '\\]' : '$'
    // Single-line marker: % @math <id> <display>
    return `% @math ${cell.id} ${String(cell.displayMode)}\n${wrapperStart}${cell.latex}${wrapperEnd}`
  }

  const latex = lexicalStateToLatex(cell.lexicalState)
  const encodedLexicalState = encodeUtf8ToBase64(cell.lexicalState)
  // Single-line marker: % @rt <id> <base64-lexical-state>
  return `% @rt ${cell.id} ${encodedLexicalState}\n${latex || ''}`
}

export function serializeNotebookToLatex(document: NotebookDocument): string {
  const header = [
    `%! eqoustics-notebook: version=${EQOUSTICS_VERSION}`,
    `%! title=${document.metadata.title}`,
    `%! createdAt=${document.metadata.createdAt}`,
    `%! updatedAt=${document.metadata.updatedAt}`,
  ]

  const cells = document.cells.map(serializeCell).join('\n\n')

  return [
    ...header,
    '',
    '\\documentclass{article}',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '\\usepackage[normalem]{ulem}',
    '',
    '\\begin{document}',
    '',
    cells,
    '',
    '\\end{document}',
    '',
  ].join('\n')
}