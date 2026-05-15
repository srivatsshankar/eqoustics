import { renderLatexToHtml } from '../components/cell/CellEditor'
import { LATEX_COMMAND_PREVIEWS } from '../shared/latexCommandPreviews'
import type { NotebookCell } from '../shared/types/notebook'

export type CopyAsFormat = 'latex' | 'notation' | 'png' | 'jpeg'

const IMAGE_CONTENT_WIDTH = 720

const LATEX_ROW_BREAK_PATTERN = /\\\\(?:\s*\[[^\]]*\])?\s*$/

function latexWithRowBreak(latex: string): string {
  if (LATEX_ROW_BREAK_PATTERN.test(latex)) return latex
  return latex.length > 0 ? `${latex} \\\\` : '\\\\'
}

function latexRows(cells: NotebookCell[]): string {
  return cells.map((cell) => latexWithRowBreak(cell.latex || '')).join('\n') + '\n'
}

function replaceLatexGroups(source: string, pattern: RegExp, replacer: (...groups: string[]) => string): string {
  let current = source
  let previous = ''

  while (current !== previous) {
    previous = current
    current = current.replace(pattern, (_match, ...groups) => replacer(...groups.slice(0, -2)))
  }

  return current
}

function notationFromLatex(latex: string): string {
  let text = latex

  text = replaceLatexGroups(text, /\\(?:dfrac|tfrac|frac)\{([^{}]*)\}\{([^{}]*)\}/g, (numerator, denominator) => `(${numerator})/(${denominator})`)
  text = replaceLatexGroups(text, /\\sqrt\[([^{}]*)\]\{([^{}]*)\}/g, (index, body) => `${index}root(${body})`)
  text = replaceLatexGroups(text, /\\sqrt\{([^{}]*)\}/g, (body) => `sqrt(${body})`)
  text = replaceLatexGroups(text, /\\(?:text|mathrm|mathbf|mathit|textbf|textit|underline)\{([^{}]*)\}/g, (body) => body)
  text = replaceLatexGroups(text, /\^\{([^{}]*)\}/g, (body) => `^${body}`)
  text = replaceLatexGroups(text, /_\{([^{}]*)\}/g, (body) => `_${body}`)

  text = text
    .replace(/\\begin\{(?:itemize|enumerate)\}\\item\s*/g, '')
    .replace(/\\end\{(?:itemize|enumerate)\}/g, '')
    .replace(/\\\\/g, '\n')
    .replace(/\\left|\\right/g, '')
    .replace(/[{}$]/g, '')

  for (const [command, preview] of Object.entries(LATEX_COMMAND_PREVIEWS)) {
    text = text.split(command).join(preview)
  }

  return text
    .replace(/\\([a-zA-Z]+)\*?/g, '$1')
    .replace(/\\([{}$&_#%])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function notationRows(cells: NotebookCell[]): string {
  return cells.map((cell) => notationFromLatex(cell.latex || '')).join('\n') + '\n'
}

async function writeTextToClipboard(text: string): Promise<void> {
  await window.eqoustics.writeClipboardText(text)
}

function cssTextForDocument(): string {
  return Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules).map((rule) => rule.cssText).join('\n')
      } catch {
        return ''
      }
    })
    .join('\n')
}

async function copyCellsAsImage(cells: NotebookCell[]): Promise<void> {
  const css = cssTextForDocument()
  const cellsHtml = cells
    .map((cell) => `<div class="copy-render-row visual-math-editor">${renderLatexToHtml(cell.latex || '')}</div>`)
    .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:max-content;min-width:0;max-width:${IMAGE_CONTENT_WIDTH}px;background:#ffffff;color:#111827;overflow:hidden}
${css}
.copy-render-content{display:block;width:max-content;min-width:0;max-width:${IMAGE_CONTENT_WIDTH}px}
.copy-render-row.visual-math-editor{display:block;width:max-content;min-width:0;max-width:${IMAGE_CONTENT_WIDTH}px;min-height:0 !important;padding:0 !important}
.copy-render-row.visual-math-editor:empty{display:none}
</style></head><body><main class="copy-render-content">${cellsHtml}</main></body></html>`

  await window.eqoustics.captureHtml(html)
}

export async function copyCells(cells: NotebookCell[], format: CopyAsFormat = 'png'): Promise<void> {
  if (cells.length === 0) return

  if (format === 'latex') {
    await writeTextToClipboard(latexRows(cells))
    return
  }

  if (format === 'notation') {
    await writeTextToClipboard(notationRows(cells))
    return
  }

  await copyCellsAsImage(cells)
}
