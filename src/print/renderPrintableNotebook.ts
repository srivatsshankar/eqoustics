import { convertLatexToMarkup } from 'mathlive'

import type { NotebookDocument } from '../shared/types/notebook'

type SerializedLexicalNode = {
  type: string
  text?: string
  tag?: string
  format?: number | string
  listType?: 'number' | 'bullet' | 'check'
  children?: SerializedLexicalNode[]
}

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 1 << 1
const FORMAT_STRIKETHROUGH = 1 << 2
const FORMAT_UNDERLINE = 1 << 3
const FORMAT_CODE = 1 << 4
const FORMAT_SUBSCRIPT = 1 << 5
const FORMAT_SUPERSCRIPT = 1 << 6

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrapInline(text: string, format: number | string | undefined): string {
  if (typeof format !== 'number' || format === 0) {
    return text
  }

  let result = text

  if (format & FORMAT_CODE) {
    result = `<code>${result}</code>`
  }
  if (format & FORMAT_BOLD) {
    result = `<strong>${result}</strong>`
  }
  if (format & FORMAT_ITALIC) {
    result = `<em>${result}</em>`
  }
  if (format & FORMAT_UNDERLINE) {
    result = `<span style="text-decoration: underline;">${result}</span>`
  }
  if (format & FORMAT_STRIKETHROUGH) {
    result = `<span style="text-decoration: line-through;">${result}</span>`
  }
  if (format & FORMAT_SUBSCRIPT) {
    result = `<sub>${result}</sub>`
  }
  if (format & FORMAT_SUPERSCRIPT) {
    result = `<sup>${result}</sup>`
  }

  return result
}

function renderInline(node: SerializedLexicalNode): string {
  switch (node.type) {
    case 'text':
      return wrapInline(escapeHtml(node.text ?? ''), node.format)
    case 'linebreak':
      return '<br />'
    default:
      return (node.children ?? []).map(renderInline).join('')
  }
}

function renderBlock(node: SerializedLexicalNode): string {
  switch (node.type) {
    case 'root':
      return (node.children ?? []).map(renderBlock).join('')
    case 'paragraph':
      return `<p>${(node.children ?? []).map(renderInline).join('')}</p>`
    case 'heading': {
      const tag = ['h1', 'h2', 'h3'].includes(node.tag ?? '') ? node.tag : 'h2'
      return `<${tag}>${(node.children ?? []).map(renderInline).join('')}</${tag}>`
    }
    case 'quote':
      return `<blockquote>${(node.children ?? []).map(renderInline).join('')}</blockquote>`
    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>${(node.children ?? []).map(renderBlock).join('')}</${tag}>`
    }
    case 'listitem':
      return `<li>${(node.children ?? []).map(renderInline).join('')}</li>`
    default:
      return (node.children ?? []).map(renderBlock).join('')
  }
}

function renderRichTextCell(lexicalState: string): string {
  try {
    const parsed = JSON.parse(lexicalState) as { root: SerializedLexicalNode }
    return renderBlock(parsed.root)
  } catch {
    return '<p></p>'
  }
}

export function renderPrintableNotebook(document: NotebookDocument): string {
  const content = document.cells
    .map((cell) => {
      if (cell.kind === 'math') {
        const latex = cell.displayMode ? `\\[${cell.latex}\\]` : `$${cell.latex}$`
        const markup = convertLatexToMarkup(latex)
        return `<section class="print-cell print-cell-math">${markup}</section>`
      }

      return `<section class="print-cell print-cell-text">${renderRichTextCell(cell.lexicalState)}</section>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.metadata.title)}</title>
    <style>
      :root {
        color: #102a43;
        font-family: 'Segoe UI', sans-serif;
      }

      body {
        margin: 0;
        padding: 40px 56px;
        background: white;
        color: #102a43;
      }

      header {
        margin-bottom: 24px;
        padding-bottom: 12px;
        border-bottom: 1px solid #d9e2ec;
      }

      h1 {
        margin: 0;
        font-size: 28px;
      }

      .print-cell {
        margin-bottom: 18px;
        padding: 12px 16px;
        border-radius: 14px;
        border: 1px solid #e5e7eb;
        break-inside: avoid;
      }

      .print-cell-text p,
      .print-cell-text ul,
      .print-cell-text ol,
      .print-cell-text blockquote,
      .print-cell-text h1,
      .print-cell-text h2,
      .print-cell-text h3 {
        margin: 0 0 12px;
      }

      .print-cell-text blockquote {
        padding-left: 14px;
        border-left: 3px solid #9fb3c8;
        color: #486581;
      }

      code {
        padding: 2px 6px;
        border-radius: 6px;
        background: #f0f4f8;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(document.metadata.title)}</h1>
    </header>
    ${content}
  </body>
</html>`
}