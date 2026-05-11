import { useCallback, useEffect, useRef, useState } from 'react'

import type { NotebookCell } from '../../shared/types/notebook'

type InsertMode = 'cmd' | 'write' | 'latex' | 'template' | 'func-slot'
export type TextFormatCommand = 'bold' | 'italic' | 'underline' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'bulletList' | 'numberedList'

const ROW_BOUNDARY_CARET_MARGIN = 4
const ROW_START_MATH_CARET_MARGIN = 16
const ROW_START_MATH_CARET_RATIO = 0.5

export interface CellInsertHandle {
  insert: (snippet: string, mode?: InsertMode) => void
  format: (format: TextFormatCommand) => void
  getLatex: () => string
  getSelection: () => EditorSelectionState | null
  restoreSelection: (selection: EditorSelectionState) => void
  focus: () => void
}

export type CellChangeKind = 'typing' | 'delete' | 'paste' | 'insert' | 'format' | 'other'

export type EditorSelectionState =
  | {
    viewMode: 'wysiwyg'
    anchorPath: number[]
    anchorOffset: number
    focusPath: number[]
    focusOffset: number
  }
  | {
    viewMode: 'latex'
    selectionStart: number
    selectionEnd: number
  }

export interface CellChangeMetadata {
  kind: CellChangeKind
  selectionBefore?: EditorSelectionState | null
  inputType?: string
  data?: string | null
}

interface CellEditorProps {
  cell: NotebookCell
  isActive: boolean
  viewMode: 'wysiwyg' | 'latex'
  onActivate: () => void
  onChange: (cell: NotebookCell, metadata?: CellChangeMetadata) => void
  onInsertHandle: (handle: CellInsertHandle) => void
  pendingSelectionRestore?: EditorSelectionState | null
  onSelectionRestoreComplete?: () => void
  onAddCellAbove: (initialLatex?: string) => void
  onAddCellBelow: (initialLatex?: string) => void
  onDeleteCell: () => void
  rowListKind?: 'bulletList' | 'numberedList' | null
  numberedListValue?: number
  canContinueNumbering?: boolean
  onContinueNumbering?: () => void
  onFocusPrevious: () => void
  onFocusNext: () => void
}

const COMMAND_DISPLAY: Record<string, string> = {
  '\\alpha': '&alpha;',
  '\\beta': '&beta;',
  '\\gamma': '&gamma;',
  '\\delta': '&delta;',
  '\\epsilon': '&epsilon;',
  '\\zeta': '&zeta;',
  '\\theta': '&theta;',
  '\\vartheta': '&thetasym;',
  '\\kappa': '&kappa;',
  '\\varkappa': '&#1008;',
  '\\eta': '&eta;',
  '\\iota': '&iota;',
  '\\lambda': '&lambda;',
  '\\mu': '&mu;',
  '\\nu': '&nu;',
  '\\upsilon': '&upsilon;',
  '\\xi': '&xi;',
  '\\Xi': '&Xi;',
  '\\pi': '&pi;',
  '\\varpi': '&piv;',
  '\\rho': '&rho;',
  '\\varrho': '&rhov;',
  '\\sigma': '&sigma;',
  '\\varsigma': '&sigmaf;',
  '\\tau': '&tau;',
  '\\phi': '&phi;',
  '\\varphi': '&#981;',
  '\\chi': '&chi;',
  '\\psi': '&psi;',
  '\\omega': '&omega;',
  '\\digamma': '&#989;',
  '\\varepsilon': '&epsiv;',
  '\\Gamma': '&Gamma;',
  '\\Delta': '&Delta;',
  '\\Theta': '&Theta;',
  '\\Lambda': '&Lambda;',
  '\\Pi': '&Pi;',
  '\\Sigma': '&Sigma;',
  '\\Upsilon': '&Upsilon;',
  '\\Phi': '&Phi;',
  '\\Psi': '&Psi;',
  '\\Omega': '&Omega;',
  '\\aleph': '&alefsym;',
  '\\alef': '&alefsym;',
  '\\alefsym': '&alefsym;',
  '\\beth': '&#8502;',
  '\\gimel': '&#8503;',
  '\\daleth': '&#8504;',
  '\\imath': '&#305;',
  '\\jmath': '&#567;',
  '\\Im': '&image;',
  '\\image': '&image;',
  '\\Re': '&real;',
  '\\real': '&real;',
  '\\Reals': '&#8477;',
  '\\R': '&#8477;',
  '\\reals': '&#8477;',
  '\\N': '&#8469;',
  '\\natnums': '&#8469;',
  '\\Z': '&#8484;',
  '\\cnums': '&#8450;',
  '\\Complex': '&#8450;',
  '\\Bbbk': '&#120156;',
  '\\ell': '&ell;',
  '\\hbar': '&hbar;',
  '\\hslash': '&#8463;',
  '\\wp': '&weierp;',
  '\\weierp': '&weierp;',
  '\\Game': '&#8519;',
  '\\Finv': '&#8498;',
  '\\eth': '&eth;',
  '\\OE': '&OElig;',
  '\\o': '&oslash;',
  '\\O': '&Oslash;',
  '\\ss': '&szlig;',
  '\\aa': '&aring;',
  '\\AA': '&Aring;',
  '\\i': '&#305;',
  '\\j': '&#567;',
  '\\ae': '&aelig;',
  '\\AE': '&AElig;',
  '\\oe': '&oelig;',
  '\\ne': '&ne;',
  '\\le': '&le;',
  '\\ge': '&ge;',
  '\\approx': '&asymp;',
  '\\propto': '&prop;',
  '\\pm': '&plusmn;',
  '\\times': '&times;',
  '\\div': '&divide;',
  '\\cdot': '&middot;',
  '\\partial': '&part;',
  '\\nabla': '&nabla;',
  '\\infty': '&infin;',
  '\\in': '&isin;',
  '\\notin': '&notin;',
  '\\emptyset': '&empty;',
  '\\subset': '&sub;',
  '\\subseteq': '&sube;',
  '\\supset': '&sup;',
  '\\cup': '&cup;',
  '\\cap': '&cap;',
  '\\forall': '&forall;',
  '\\exists': '&exist;',
  '\\neg': '&not;',
  '\\wedge': '&and;',
  '\\vee': '&or;',
  '\\rightarrow': '&rarr;',
  '\\leftarrow': '&larr;',
  '\\leftrightarrow': '&harr;',
  '\\Rightarrow': '&rArr;',
  '\\Leftarrow': '&lArr;',
  '\\Leftrightarrow': '&hArr;',
  '\\mapsto': '&#8614;',
  '\\int': '&int;',
  '\\sum': '&sum;',
  '\\prod': '&prod;',
  '\\lim': 'lim',
  '\\sin': 'sin',
  '\\cos': 'cos',
  '\\tan': 'tan',
  '\\log': 'log',
  '\\ln': 'ln',
  '\\exp': 'exp',
  '\\max': 'max',
  '\\min': 'min',
  '\\lbrace': '{',
  '\\rbrace': '}',
  '\\lparen': '(',
  '\\rparen': ')',
  '\\lbrack': '[',
  '\\rbrack': ']',
  '\\langle': '&#10216;',
  '\\rangle': '&#10217;',
  '\\lang': '&#10216;',
  '\\rang': '&#10217;',
  '\\lt': '&lt;',
  '\\gt': '&gt;',
  '\\lceil': '&#8968;',
  '\\rceil': '&#8969;',
  '\\lfloor': '&#8970;',
  '\\rfloor': '&#8971;',
  '\\lmoustache': '&#9136;',
  '\\rmoustache': '&#9137;',
  '\\lgroup': '&#10222;',
  '\\rgroup': '&#10223;',
  '\\ulcorner': '&#8988;',
  '\\urcorner': '&#8989;',
  '\\llcorner': '&#8990;',
  '\\lrcorner': '&#8991;',
  '\\llbracket': '&#10214;',
  '\\rrbracket': '&#10215;',
  '\\lBrace': '&#10627;',
  '\\rBrace': '&#10628;',
  '\\vert': '|',
  '\\Vert': '&#8214;',
  '\\lvert': '|',
  '\\rvert': '|',
  '\\lVert': '&#8214;',
  '\\rVert': '&#8214;',
  '\\uparrow': '&uarr;',
  '\\downarrow': '&darr;',
  '\\updownarrow': '&#8597;',
  '\\Uparrow': '&#8657;',
  '\\Downarrow': '&#8659;',
  '\\Updownarrow': '&#8661;',
  '\\backslash': '\\',
}

const MATRIX_ENVS = new Set(['matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix'])
const SIZED_LEFT_DELIMITER_COMMANDS: Record<string, string> = {
  '\\bigl': '\\bigr',
  '\\Bigl': '\\Bigr',
  '\\biggl': '\\biggr',
  '\\Biggl': '\\Biggr',
  '\\big': '\\big',
  '\\Big': '\\Big',
  '\\bigg': '\\bigg',
  '\\Bigg': '\\Bigg',
}
const VISUAL_FUNCTION_COMMANDS = new Set([
  '\\arcsin',
  '\\arccos',
  '\\arctan',
  '\\arctg',
  '\\arcctg',
  '\\arg',
  '\\argmax',
  '\\argmin',
  '\\ch',
  '\\cos',
  '\\cosec',
  '\\cosh',
  '\\cot',
  '\\cotg',
  '\\coth',
  '\\csc',
  '\\ctg',
  '\\cth',
  '\\deg',
  '\\det',
  '\\dim',
  '\\exp',
  '\\gcd',
  '\\hom',
  '\\inf',
  '\\injlim',
  '\\ker',
  '\\lg',
  '\\lim',
  '\\liminf',
  '\\limsup',
  '\\ln',
  '\\log',
  '\\max',
  '\\min',
  '\\plim',
  '\\Pr',
  '\\projlim',
  '\\sec',
  '\\sin',
  '\\sinh',
  '\\sh',
  '\\sup',
  '\\tan',
  '\\tanh',
  '\\tg',
  '\\th',
  '\\varinjlim',
  '\\varliminf',
  '\\varlimsup',
  '\\varprojlim',
])
const CARET_ANCHOR = '\u200b'

const INLINE_FORMAT_COMMANDS: Record<string, TextFormatCommand> = {
  '\\mathbf': 'bold',
  '\\textbf': 'bold',
  '\\mathit': 'italic',
  '\\textit': 'italic',
  '\\underline': 'underline',
}

const HEADING_COMMANDS: Record<string, TextFormatCommand> = {
  '\\section': 'heading1',
  '\\subsection': 'heading2',
  '\\subsubsection': 'heading3',
  '\\paragraph': 'heading4',
}

const LATEX_INLINE_FORMATS: Record<TextFormatCommand, [string, string]> = {
  bold: ['\\mathbf{', '}'],
  italic: ['\\mathit{', '}'],
  underline: ['\\underline{', '}'],
  heading1: ['\\section{', '}'],
  heading2: ['\\subsection{', '}'],
  heading3: ['\\subsubsection{', '}'],
  heading4: ['\\paragraph{', '}'],
  bulletList: ['\\begin{itemize}\\item ', '\\end{itemize}'],
  numberedList: ['\\begin{enumerate}\\item ', '\\end{enumerate}'],
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function escapeTextLatex(value: string): string {
  return value.replace(/\\/g, '\\textbackslash{}').replace(/[{}]/g, (match) => `\\${match}`)
}

function escapeMathText(value: string): string {
  return value.replace(/[{}]/g, (match) => `\\${match}`)
}

function commandHtml(command: string): string {
  const fallback = command.startsWith('\\') ? command.slice(1) : command
  const display = COMMAND_DISPLAY[command] ?? escapeHtml(fallback)
  return `<span class="math-symbol" data-latex="${escapeAttr(command)}" contenteditable="false">${display}</span>`
}

function operatorNameHtml(command: '\\operatorname' | '\\operatorname*', body: string): string {
  const latex = `${command}{${body}}`
  return `<span class="math-symbol" data-latex="${escapeAttr(latex)}" contenteditable="false">${escapeHtml(body)}</span>`
}

function slotHtml(role: string, content = '', marker = false, className = ''): string {
  const classes = ['math-slot', className].filter(Boolean).join(' ')
  return `<span class="${classes}" data-slot="${role}">${marker ? '<span data-caret-marker="true"></span>' : ''}${content}</span>`
}

function fractionHtml(numerator = '', denominator = '', focusNumerator = false): string {
  return [
    '<span class="math-frac" data-math="frac">',
    slotHtml('numerator', numerator, focusNumerator),
    '<span class="math-frac-line"></span>',
    slotHtml('denominator', denominator),
    '</span>',
  ].join('')
}

function sqrtHtml(body = '', focusBody = false): string {
  return `<span class="math-sqrt" data-math="sqrt"><svg class="math-sqrt-sign" viewBox="0 0 18 24" aria-hidden="true" focusable="false"><path d="M1 14.5H4.7L8.2 22L13.4 1.6" /></svg>${slotHtml('radicand', body, focusBody)}</span>`
}

function indexedRootHtml(index = '', body = '', focusIndex = false): string {
  return `<span class="math-sqrt math-indexed-root" data-math="root">${slotHtml('root-index', index, focusIndex, 'math-root-index')}<svg class="math-sqrt-sign" viewBox="0 0 18 24" aria-hidden="true" focusable="false"><path d="M1 14.5H4.7L8.2 22L13.4 1.6" /></svg>${slotHtml('radicand', body)}</span>`
}

function scriptHtml(kind: 'sup' | 'sub', body = '', focusBody = false): string {
  const tag = kind === 'sup' ? 'sup' : 'sub'
  return `<${tag} class="math-script" data-math="${kind}">${slotHtml('script', body, focusBody)}</${tag}>`
}

function scriptTemplateHtml(kind: 'sup' | 'sub'): string {
  const tag = kind === 'sup' ? 'sup' : 'sub'
  return `<span class="math-script-group" data-math="${kind}">${slotHtml('base', '', true)}<${tag} class="math-script">${slotHtml('script')}</${tag}></span>`
}

function textHtml(body = '', focusBody = false): string {
  return `<span class="math-text" data-math="text">${slotHtml('text', escapeHtml(body), focusBody)}</span>`
}

function formatHtml(format: TextFormatCommand, content = '', marker = false): string {
  const markerHtml = marker ? '<span data-caret-marker="true"></span>' : ''
  const className = `text-format text-format-${format}`
  return `<span class="${className}" data-format="${format}">${markerHtml}${content}</span>`
}

function listHtml(format: 'bulletList' | 'numberedList', content = '', marker = false, number = 1): string {
  const markerHtml = marker ? '<span data-caret-marker="true"></span>' : ''
  const markerClass = format === 'bulletList' ? 'text-list-bullet-marker' : 'text-list-number-marker'
  const numberAttr = format === 'numberedList' ? ` data-number="${number}"` : ''
  const nestedParentClass = content.trim().startsWith('<span class="text-list') ? ' text-list-nested-parent' : ''
  return `<span class="text-list text-list-${format}${nestedParentClass}" data-list="${format}"><span class="${markerClass}"${numberAttr} contenteditable="false"></span><span class="text-list-content">${markerHtml}${content}</span></span>`
}

function oversetHtml(bound = '', base = '', focusBound = false): string {
  return [
    '<span class="math-overset" data-math="overset">',
    `<span class="math-overset-bound">${slotHtml('bound', bound, focusBound)}</span>`,
    slotHtml('base', base),
    '</span>',
  ].join('')
}

function undersetHtml(bound = '', base = '', focusBound = false): string {
  return [
    '<span class="math-underset" data-math="underset">',
    slotHtml('base', base),
    `<span class="math-underset-bound">${slotHtml('bound', bound, focusBound)}</span>`,
    '</span>',
  ].join('')
}

function bothsetHtml(upper = '', base = '', lower = '', focusUpper = false): string {
  return [
    '<span class="math-bothset" data-math="bothset">',
    `<span class="math-overset-bound">${slotHtml('upper-bound', upper, focusUpper)}</span>`,
    slotHtml('base', base),
    `<span class="math-underset-bound">${slotHtml('lower-bound', lower)}</span>`,
    '</span>',
  ].join('')
}

function delimiterDisplay(delimiter: string): string {
  const delimiterDisplays: Record<string, string> = {
    '\\lparen': '(',
    '\\rparen': ')',
    '\\lbrack': '[',
    '\\rbrack': ']',
    '\\lbrace': '{',
    '\\rbrace': '}',
    '\\langle': '\u27e8',
    '\\rangle': '\u27e9',
    '\\lang': '\u27e8',
    '\\rang': '\u27e9',
    '\\lt': '<',
    '\\gt': '>',
    '\\lceil': '\u2308',
    '\\rceil': '\u2309',
    '\\lfloor': '\u230a',
    '\\rfloor': '\u230b',
    '\\lmoustache': '\u23b0',
    '\\rmoustache': '\u23b1',
    '\\lgroup': '\u27ee',
    '\\rgroup': '\u27ef',
    '\\ulcorner': '\u231c',
    '\\urcorner': '\u231d',
    '\\llcorner': '\u231e',
    '\\lrcorner': '\u231f',
    '\\llbracket': '\u27e6',
    '\\rrbracket': '\u27e7',
    '\\lBrace': '\u2983',
    '\\rBrace': '\u2984',
    '\\vert': '|',
    '\\Vert': '\u2016',
    '\\lvert': '|',
    '\\rvert': '|',
    '\\lVert': '\u2016',
    '\\rVert': '\u2016',
    '\\uparrow': '\u2191',
    '\\downarrow': '\u2193',
    '\\updownarrow': '\u2195',
    '\\Uparrow': '\u21d1',
    '\\Downarrow': '\u21d3',
    '\\Updownarrow': '\u21d5',
    '\\backslash': '\\',
    '.': '',
  }

  if (delimiter === '\\{') return '{'
  if (delimiter === '\\}') return '}'
  if (delimiterDisplays[delimiter] !== undefined) return delimiterDisplays[delimiter]
  return COMMAND_DISPLAY[delimiter] ?? delimiter
}

function delimiterSizeName(command: string): string {
  if (command === '\\bigl' || command === '\\big') return 'big'
  if (command === '\\Bigl' || command === '\\Big') return 'Big'
  if (command === '\\biggl' || command === '\\bigg') return 'bigg'
  if (command === '\\Biggl' || command === '\\Bigg') return 'Bigg'
  return command === '\\left' ? 'auto' : 'plain'
}

function delimiterHtml(left: string, right: string, body = '', focusBody = false, leftCommand = '\\left', rightCommand = '\\right'): string {
  return `<span class="math-delimiter" data-math="delimiter" data-left="${escapeAttr(left)}" data-right="${escapeAttr(right)}" data-left-command="${escapeAttr(leftCommand)}" data-right-command="${escapeAttr(rightCommand)}" data-delimiter-size="${escapeAttr(delimiterSizeName(leftCommand))}"><span class="math-delimiter-mark" contenteditable="false">${escapeHtml(delimiterDisplay(left))}</span>${slotHtml('body', body, focusBody)}<span class="math-delimiter-mark" contenteditable="false">${escapeHtml(delimiterDisplay(right))}</span></span>`
}

function matrixHtml(env: string, rows: string[][], focusFirstCell = false): string {
  const delimiters: Record<string, [string, string]> = {
    matrix: ['', ''],
    pmatrix: ['(', ')'],
    bmatrix: ['[', ']'],
    vmatrix: ['|', '|'],
    Bmatrix: ['{', '}'],
  }
  const [left, right] = delimiters[env] ?? delimiters.pmatrix
  const body = rows
    .map((row, rowIndex) => (
      `<tr>${row
        .map((cell, cellIndex) => `<td>${slotHtml('matrix-cell', cell, focusFirstCell && rowIndex === 0 && cellIndex === 0)}</td>`)
        .join('')}</tr>`
    ))
    .join('')

  return `<span class="math-matrix" data-math="matrix" data-env="${escapeAttr(env)}"><span class="math-delimiter-mark">${escapeHtml(left)}</span><table><tbody>${body}</tbody></table><span class="math-delimiter-mark">${escapeHtml(right)}</span></span>`
}

function findMatchingBrace(source: string, openIndex: number): number {
  return findMatchingDelimiter(source, openIndex, '{', '}')
}

function findMatchingDelimiter(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === open) depth += 1
    if (source[i] === '}') {
      if (close !== '}') continue
      depth -= 1
      if (depth === 0) return i
    }
    if (source[i] === close && close !== '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function readGroup(source: string, index: number): { body: string; end: number } | null {
  if (source[index] !== '{') return null
  const close = findMatchingBrace(source, index)
  if (close < 0) return null
  return { body: source.slice(index + 1, close), end: close + 1 }
}

function readBracketGroup(source: string, index: number): { body: string; end: number } | null {
  if (source[index] !== '[') return null
  const close = findMatchingDelimiter(source, index, '[', ']')
  if (close < 0) return null
  return { body: source.slice(index + 1, close), end: close + 1 }
}

function readGroupAfterSpaces(source: string, index: number): { body: string; end: number } | null {
  let cursor = index
  while (source[cursor] === ' ') cursor += 1
  return readGroup(source, cursor)
}

function readBracketGroupAfterSpaces(source: string, index: number): { body: string; end: number } | null {
  let cursor = index
  while (source[cursor] === ' ') cursor += 1
  return readBracketGroup(source, cursor)
}

function readGroupOrToken(source: string, index: number): { body: string; end: number } {
  const group = readGroup(source, index)
  if (group) return group

  if (source[index] === '\\') {
    const match = source.slice(index).match(/^\\[a-zA-Z]+|^\\./)
    if (match) return { body: match[0], end: index + match[0].length }
  }

  return { body: source[index] ?? '', end: Math.min(index + 1, source.length) }
}

function readCommand(source: string, index: number): { command: string; end: number } {
  const match = source.slice(index).match(/^\\[a-zA-Z]+|^\\./)
  if (!match) return { command: source[index] ?? '', end: index + 1 }
  return { command: match[0], end: index + match[0].length }
}

function renderSlotLatex(body: string): string {
  return body.trim().length === 0 ? '' : renderLatexToHtml(body)
}

function splitMatrixRows(body: string): string[][] {
  return body
    .split(/\\\\/)
    .map((row) => row.split('&').map((cell) => renderLatexToHtml(cell.trim())))
    .filter((row) => row.length > 0)
}

function tryRenderMatrix(source: string, index: number): { html: string; end: number } | null {
  const begin = source.slice(index).match(/^\\begin\{([^}]+)\}/)
  if (!begin || !MATRIX_ENVS.has(begin[1])) return null

  const env = begin[1]
  const bodyStart = index + begin[0].length
  const endToken = `\\end{${env}}`
  const bodyEnd = source.indexOf(endToken, bodyStart)
  if (bodyEnd < 0) return null

  const rows = splitMatrixRows(source.slice(bodyStart, bodyEnd))
  return { html: matrixHtml(env, rows.length ? rows : [['']]), end: bodyEnd + endToken.length }
}

function matchingListEnvironmentEnd(source: string, bodyStart: number, env: 'itemize' | 'enumerate'): number {
  const tokenPattern = /\\(?:begin|end)\{(itemize|enumerate)\}/g
  const stack: Array<'itemize' | 'enumerate'> = [env]
  tokenPattern.lastIndex = bodyStart

  for (let match = tokenPattern.exec(source); match; match = tokenPattern.exec(source)) {
    const token = match[0]
    const tokenEnv = match[1] as 'itemize' | 'enumerate'
    if (token.startsWith('\\begin')) {
      stack.push(tokenEnv)
      continue
    }

    if (stack[stack.length - 1] === tokenEnv) stack.pop()
    if (stack.length === 0) return match.index
  }

  return -1
}

function splitTopLevelListItems(body: string): string[] {
  const tokenPattern = /\\begin\{(itemize|enumerate)\}|\\end\{(itemize|enumerate)\}|\\item\b/g
  const stack: Array<'itemize' | 'enumerate'> = []
  const itemStarts: number[] = []

  for (let match = tokenPattern.exec(body); match; match = tokenPattern.exec(body)) {
    if (match[1]) {
      stack.push(match[1] as 'itemize' | 'enumerate')
    } else if (match[2]) {
      if (stack[stack.length - 1] === match[2]) stack.pop()
    } else if (stack.length === 0) {
      itemStarts.push(match.index + match[0].length)
    }
  }

  return itemStarts
    .map((start, index) => body.slice(start, itemStarts[index + 1] ?? body.length).trim())
    .filter(Boolean)
}

function tryRenderList(source: string, index: number): { html: string; end: number } | null {
  const begin = source.slice(index).match(/^\\begin\{(itemize|enumerate)\}/)
  if (!begin) return null

  const env = begin[1] as 'itemize' | 'enumerate'
  const bodyStart = index + begin[0].length
  const endToken = `\\end{${env}}`
  const bodyEnd = matchingListEnvironmentEnd(source, bodyStart, env)
  if (bodyEnd < 0) return null

  const items = splitTopLevelListItems(source.slice(bodyStart, bodyEnd))

  const format = env === 'itemize' ? 'bulletList' : 'numberedList'
  const content = items.length > 0
    ? items.map((item, itemIndex) => listHtml(format, renderLatexToHtml(item), false, itemIndex + 1)).join('')
    : listHtml(format)
  return { html: content, end: bodyEnd + endToken.length }
}

function renderLeftRight(source: string, index: number): { html: string; end: number } | null {
  const leftCommand = '\\left'
  if (!source.startsWith(leftCommand, index)) return null

  let cursor = index + leftCommand.length
  const left = source[cursor] === '\\' ? readCommand(source, cursor) : { command: source[cursor] ?? '', end: cursor + 1 }
  cursor = left.end

  const rightIndex = source.indexOf('\\right', cursor)
  if (rightIndex < 0) return null

  let rightCursor = rightIndex + '\\right'.length
  const right = source[rightCursor] === '\\' ? readCommand(source, rightCursor) : { command: source[rightCursor] ?? '', end: rightCursor + 1 }
  rightCursor = right.end

  return {
    html: delimiterHtml(left.command, right.command, renderLatexToHtml(source.slice(cursor, rightIndex))),
    end: rightCursor,
  }
}

function renderSizedDelimiter(source: string, index: number): { html: string; end: number } | null {
  const leftCommand = Object.keys(SIZED_LEFT_DELIMITER_COMMANDS)
    .sort((left, right) => right.length - left.length)
    .find((command) => source.startsWith(command, index))
  if (!leftCommand) return null

  let cursor = index + leftCommand.length
  const left = source[cursor] === '\\' ? readCommand(source, cursor) : { command: source[cursor] ?? '', end: cursor + 1 }
  cursor = left.end

  const rightCommand = SIZED_LEFT_DELIMITER_COMMANDS[leftCommand]
  const rightIndex = source.indexOf(rightCommand, cursor)
  if (rightIndex < 0) return null

  let rightCursor = rightIndex + rightCommand.length
  const right = source[rightCursor] === '\\' ? readCommand(source, rightCursor) : { command: source[rightCursor] ?? '', end: rightCursor + 1 }
  rightCursor = right.end

  return {
    html: delimiterHtml(left.command, right.command, renderLatexToHtml(source.slice(cursor, rightIndex)), false, leftCommand, rightCommand),
    end: rightCursor,
  }
}

function renderLatexToHtml(latex: string): string {
  const source = latex.replace(/#\?/g, '')
  let html = ''
  let index = 0

  while (index < source.length) {
    const matrix = tryRenderMatrix(source, index)
    if (matrix) {
      html += matrix.html
      index = matrix.end
      continue
    }

    const sizedDelimiter = renderSizedDelimiter(source, index)
    if (sizedDelimiter) {
      html += sizedDelimiter.html
      index = sizedDelimiter.end
      continue
    }

    const leftRight = renderLeftRight(source, index)
    if (leftRight) {
      html += leftRight.html
      index = leftRight.end
      continue
    }

    const list = tryRenderList(source, index)
    if (list) {
      html += list.html
      index = list.end
      continue
    }

    const char = source[index]

    if (char === '\\') {
      const { command, end } = readCommand(source, index)
      if (command === '\\frac') {
        const numerator = readGroup(source, end)
        const denominator = numerator ? readGroup(source, numerator.end) : null
        if (numerator && denominator) {
          html += fractionHtml(renderSlotLatex(numerator.body), renderSlotLatex(denominator.body))
          index = denominator.end
          continue
        }
      }

      if (command === '\\sqrt') {
        const indexGroup = readBracketGroupAfterSpaces(source, end)
        const group = readGroupAfterSpaces(source, indexGroup?.end ?? end)
        if (group) {
          html += indexGroup
            ? indexedRootHtml(renderSlotLatex(indexGroup.body), renderSlotLatex(group.body))
            : sqrtHtml(renderSlotLatex(group.body))
          index = group.end
          continue
        }
      }

      if (command === '\\text') {
        const group = readGroup(source, end)
        if (group) {
          html += textHtml(group.body)
          index = group.end
          continue
        }
      }

      if (command === '\\operatorname' || command === '\\operatorname*') {
        const group = readGroup(source, end)
        if (group) {
          const argument = readGroupAfterSpaces(source, group.end)
          html += operatorNameHtml(command, group.body)
          if (argument) {
            html += slotHtml('function-arg', renderSlotLatex(argument.body))
            index = argument.end
          } else {
            index = group.end
          }
          continue
        }
      }

      if (INLINE_FORMAT_COMMANDS[command]) {
        const group = readGroupAfterSpaces(source, end)
        if (group) {
          html += formatHtml(INLINE_FORMAT_COMMANDS[command], renderLatexToHtml(group.body))
          index = group.end
          continue
        }
      }

      if (HEADING_COMMANDS[command]) {
        const group = readGroupAfterSpaces(source, end)
        if (group) {
          html += formatHtml(HEADING_COMMANDS[command], renderLatexToHtml(group.body))
          index = group.end
          continue
        }
        // Accept non-braced heading content as a resilient fallback.
        const rawBody = source.slice(end).trim()
        html += formatHtml(HEADING_COMMANDS[command], renderLatexToHtml(rawBody))
        index = source.length
        continue
      }

      const argument = VISUAL_FUNCTION_COMMANDS.has(command) ? readGroupAfterSpaces(source, end) : null
      if (argument) {
        html += commandHtml(command)
        html += slotHtml('function-arg', renderSlotLatex(argument.body))
        index = argument.end
        continue
      }

      if (command === '\\overset') {
        const bound = readGroup(source, end)
        const base = bound ? readGroupAfterSpaces(source, bound.end) : null
        if (bound && base) {
          const baseSource = base.body.trim()
          const nestedUnderset = baseSource.startsWith('\\underset') ? readCommand(baseSource, 0) : null
          const lower = nestedUnderset?.command === '\\underset' ? readGroup(baseSource, nestedUnderset.end) : null
          const nestedBase = lower ? readGroupAfterSpaces(baseSource, lower.end) : null
          html += lower && nestedBase && nestedBase.end === baseSource.length
            ? bothsetHtml(renderSlotLatex(bound.body), renderSlotLatex(nestedBase.body), renderSlotLatex(lower.body))
            : oversetHtml(renderSlotLatex(bound.body), renderSlotLatex(base.body))
          index = base.end
          continue
        }
      }

      if (command === '\\underset') {
        const bound = readGroup(source, end)
        const base = bound ? readGroupAfterSpaces(source, bound.end) : null
        if (bound && base) {
          const baseSource = base.body.trim()
          const nestedOverset = baseSource.startsWith('\\overset') ? readCommand(baseSource, 0) : null
          const upper = nestedOverset?.command === '\\overset' ? readGroup(baseSource, nestedOverset.end) : null
          const nestedBase = upper ? readGroupAfterSpaces(baseSource, upper.end) : null
          html += upper && nestedBase && nestedBase.end === baseSource.length
            ? bothsetHtml(renderSlotLatex(upper.body), renderSlotLatex(nestedBase.body), renderSlotLatex(bound.body))
            : undersetHtml(renderSlotLatex(bound.body), renderSlotLatex(base.body))
          index = base.end
          continue
        }
      }

      html += commandHtml(command)
      index = end
      continue
    }

    if (char === '^' || char === '_') {
      const group = readGroupOrToken(source, index + 1)
      html += scriptHtml(char === '^' ? 'sup' : 'sub', renderSlotLatex(group.body))
      index = group.end
      continue
    }

    if (char === '{') {
      const group = readGroup(source, index)
      if (group) {
        html += renderLatexToHtml(group.body)
        index = group.end
        continue
      }
    }

    html += escapeHtml(char ?? '')
    index += 1
  }

  return html
}

function serializeChildren(node: Node): string {
  return Array.from(node.childNodes).map(serializeNode).join('')
}

function directSlot(element: Element, role: string): Element | null {
  return Array.from(element.children).find((child) => child instanceof HTMLElement && child.dataset.slot === role) ?? null
}

function serializeDirectSlot(element: Element, role: string, trim = true): string {
  const slot = directSlot(element, role)
  const value = slot ? serializeChildren(slot) : ''
  return trim ? value.trim() : value
}

function serializeFirstSlot(element: Element, role: string): string {
  const slot = element.querySelector(`[data-slot="${role}"]`)
  return slot ? serializeChildren(slot).trim() : ''
}

function serializeSlot(element: Element, role: string): string {
  return serializeDirectSlot(element, role) || serializeFirstSlot(element, role)
}

function isFunctionArgSlot(node: Node | null): boolean {
  return node instanceof HTMLElement && node.dataset.slot === 'function-arg'
}

function isAtomicMathElement(node: Node | null): boolean {
  return node instanceof HTMLElement && Boolean(node.dataset.math || node.dataset.latex || node.dataset.slot === 'function-arg')
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMathText(node.textContent ?? '').replace(/\u200b/g, '')
  }

  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return ' '

  const formatKind = node.dataset.format as TextFormatCommand | undefined
  if (formatKind && LATEX_INLINE_FORMATS[formatKind]) {
    const [open, close] = LATEX_INLINE_FORMATS[formatKind]
    return `${open}${serializeChildren(node).trim() || ' '}${close}`
  }

  const listKind = node.dataset.list as TextFormatCommand | undefined
  if (listKind === 'bulletList' || listKind === 'numberedList') {
    const [open, close] = LATEX_INLINE_FORMATS[listKind]
    const content = Array.from(node.childNodes)
      .filter((child) => !(child instanceof HTMLElement && child.classList.contains('text-list-bullet-marker')))
      .filter((child) => !(child instanceof HTMLElement && child.classList.contains('text-list-number-marker')))
      .map(serializeNode)
      .join('')
      .trim()
    return `${open}${content || ' '}${close}`
  }

  const symbolLatex = node.dataset.latex
  if (symbolLatex) return isFunctionArgSlot(node.nextSibling) ? symbolLatex : `${symbolLatex} `

  if (node.dataset.slot === 'function-arg') {
    return `{${serializeChildren(node).trim() || ' '}}`
  }

  const mathKind = node.dataset.math
  if (mathKind === 'frac') {
    const numerator = serializeDirectSlot(node, 'numerator') || ' '
    const denominator = serializeDirectSlot(node, 'denominator') || ' '
    return `\\frac{${numerator}}{${denominator}}`
  }

  if (mathKind === 'sqrt') {
    return `\\sqrt{${serializeDirectSlot(node, 'radicand') || ' '}}`
  }

  if (mathKind === 'root') {
    const index = serializeDirectSlot(node, 'root-index') || ' '
    const radicand = serializeDirectSlot(node, 'radicand') || ' '
    return `\\sqrt[${index}]{${radicand}}`
  }

  if (mathKind === 'overset') {
    const bound = serializeSlot(node, 'bound') || ' '
    const base = serializeSlot(node, 'base') || ' '
    return `\\overset{${bound}}{${base}}`
  }

  if (mathKind === 'underset') {
    const bound = serializeSlot(node, 'bound') || ' '
    const base = serializeSlot(node, 'base') || ' '
    return `\\underset{${bound}}{${base}}`
  }

  if (mathKind === 'bothset') {
    const upper = serializeSlot(node, 'upper-bound') || ' '
    const base = serializeSlot(node, 'base') || ' '
    const lower = serializeSlot(node, 'lower-bound') || ' '
    return `\\overset{${upper}}{\\underset{${lower}}{${base}}}`
  }

  if (mathKind === 'sup') {
    const base = serializeDirectSlot(node, 'base')
    const script = serializeDirectSlot(node, 'script') || serializeFirstSlot(node, 'script') || ' '
    return `${base}^{${script}}`
  }

  if (mathKind === 'sub') {
    const base = serializeDirectSlot(node, 'base')
    const script = serializeDirectSlot(node, 'script') || serializeFirstSlot(node, 'script') || ' '
    return `${base}_{${script}}`
  }

  if (mathKind === 'text') {
    const slot = directSlot(node, 'text')
    return `\\text{${escapeTextLatex(slot?.textContent ?? '')}}`
  }

  if (mathKind === 'delimiter') {
    const left = node.dataset.left ?? ''
    const right = node.dataset.right ?? ''
    const leftCommand = node.dataset.leftCommand ?? '\\left'
    const rightCommand = node.dataset.rightCommand ?? '\\right'
    return `${leftCommand}${left}${serializeDirectSlot(node, 'body')}${rightCommand}${right}`
  }

  if (mathKind === 'matrix') {
    const env = node.dataset.env || 'pmatrix'
    const table = Array.from(node.children).find((child) => child instanceof HTMLTableElement)
    const rows = Array.from(table?.tBodies[0]?.rows ?? []).map((row) => (
      Array.from(row.cells).map((cell) => {
        const matrixSlot = Array.from(cell.children).find((child) => child instanceof HTMLElement && child.dataset.slot === 'matrix-cell')
        return matrixSlot ? serializeChildren(matrixSlot).trim() || ' ' : ' '
      }).join(' & ')
    ))
    return `\\begin{${env}}${rows.join(' \\\\ ')}\\end{${env}}`
  }

  return serializeChildren(node)
}

function serializeEditor(editor: HTMLElement): string {
  return serializeChildren(editor).replace(/\s+/g, ' ').trim()
}

function getLatexSourceSnippet(snippet: string, mode: InsertMode = 'write'): string {
  if (mode === 'template') return snippet.replace(/#\?/g, ' ')
  if (mode === 'func-slot') return `${snippet}{ }`
  if (mode === 'latex' || mode === 'write') return snippet

  const templates: Record<string, string> = {
    '^': '^{ }',
    '_': '_{ }',
    '\\frac': '\\frac{ }{ }',
    '\\sqrt': '\\sqrt{ }',
    '\\sqrt[]': '\\sqrt[ ]{ }',
    '\\text': '\\text{ }',
  }

  return templates[snippet] ?? snippet
}

function focusFirstSlotInHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const slot = template.content.querySelector('.math-slot')
  if (!slot) return `${html}<span data-caret-marker="true"></span>`
  slot.insertAdjacentHTML('afterbegin', '<span data-caret-marker="true"></span>')
  return Array.from(template.content.childNodes)
    .map((node) => {
      if (node instanceof HTMLElement) return node.outerHTML
      return node.textContent ?? ''
    })
    .join('')
}

function htmlForSnippet(snippet: string, mode: InsertMode = 'write'): string {
  if (mode === 'func-slot') {
    return `${commandHtml(snippet)}${slotHtml('function-arg', '', true)}`
  }

  if (mode === 'cmd') {
    if (snippet === '^') return scriptTemplateHtml('sup')
    if (snippet === '_') return scriptTemplateHtml('sub')
    if (snippet === '\\frac') return fractionHtml('', '', true)
    if (snippet === '\\sqrt') return sqrtHtml('', true)
    if (snippet === '\\sqrt[]') return indexedRootHtml('', '', true)
    if (snippet === '\\text') return textHtml('', true)
    if (snippet === '\\overset') return oversetHtml('', '', true)
    if (snippet === '\\underset') return undersetHtml('', '', true)
    if (snippet === '\\bothset') return bothsetHtml('', '', '', true)
    return commandHtml(snippet)
  }

  if (snippet === '\\left|\\right|') return delimiterHtml('|', '|', '', true)
  if (snippet === '\\left(\\right)') return delimiterHtml('(', ')', '', true)
  if (snippet === '\\left[\\right]') return delimiterHtml('[', ']', '', true)
  if (snippet === '\\left\\lbrace\\right\\rbrace') return delimiterHtml('\\lbrace', '\\rbrace', '', true)

  const rendered = renderLatexToHtml(getLatexSourceSnippet(snippet, mode))
  const hasExplicitPlaceholder = snippet.includes('#?') || snippet.includes('{ }')
  return hasExplicitPlaceholder ? focusFirstSlotInHtml(rendered) : `${rendered}<span data-caret-marker="true"></span>`
}

function selectionIsInside(root: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const node = selection.anchorNode
  return Boolean(node && root.contains(node))
}

function nodePathFromRoot(root: Node, node: Node): number[] | null {
  const path: number[] = []
  let current: Node | null = node

  while (current && current !== root) {
    const parent: Node | null = current.parentNode
    if (!parent) return null
    let childIndex = -1
    parent.childNodes.forEach((child, index) => {
      if (child === current) childIndex = index
    })
    if (childIndex < 0) return null
    path.unshift(childIndex)
    current = parent
  }

  return current === root ? path : null
}

function nodeFromPath(root: Node, path: number[]): Node | null {
  let current: Node | null = root

  for (const index of path) {
    if (!current || index < 0 || index >= current.childNodes.length) return null
    current = current.childNodes[index]
  }

  return current
}

function safeRangeOffset(node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) return Math.max(0, Math.min(offset, node.textContent?.length ?? 0))
  return Math.max(0, Math.min(offset, node.childNodes.length))
}

function visualSelectionState(root: HTMLElement): EditorSelectionState | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) return null
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null

  const anchorPath = nodePathFromRoot(root, selection.anchorNode)
  const focusPath = nodePathFromRoot(root, selection.focusNode)
  if (!anchorPath || !focusPath) return null

  return {
    viewMode: 'wysiwyg',
    anchorPath,
    anchorOffset: selection.anchorOffset,
    focusPath,
    focusOffset: selection.focusOffset,
  }
}

function restoreVisualSelection(root: HTMLElement, selectionState: EditorSelectionState): boolean {
  if (selectionState.viewMode !== 'wysiwyg') return false

  const anchorNode = nodeFromPath(root, selectionState.anchorPath)
  const focusNode = nodeFromPath(root, selectionState.focusPath)
  const selection = window.getSelection()
  if (!anchorNode || !focusNode || !selection) return false

  root.focus()
  selection.setBaseAndExtent(
    anchorNode,
    safeRangeOffset(anchorNode, selectionState.anchorOffset),
    focusNode,
    safeRangeOffset(focusNode, selectionState.focusOffset),
  )
  return true
}

function focusAtEnd(root: HTMLElement): void {
  const lastChild = root.lastChild
  if (lastChild) {
    placeCaretAfterNode(lastChild)
    return
  }

  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function lastMeaningfulChild(node: Node): Node | null {
  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const child = node.childNodes[index]
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent ?? '').replace(/\u200b/g, '').length > 0) return child
      continue
    }
    if (child instanceof HTMLElement && child.tagName !== 'BR') return child
  }
  return null
}

function focusAtLogicalRowEnd(root: HTMLElement): void {
  const lastChild = lastMeaningfulChild(root)
  if (!lastChild) {
    focusAtEnd(root)
    return
  }

  if (lastChild.nodeType === Node.TEXT_NODE) {
    const text = lastChild.textContent ?? ''
    const range = document.createRange()
    range.setStart(lastChild, text.length)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return
  }

  if (!(lastChild instanceof HTMLElement)) {
    focusAtEnd(root)
    return
  }

  const listContent = lastChild.matches('[data-list]')
    ? listContentElement(lastChild)
    : null
  if (listContent) {
    placeCaretInNode(listContent, true)
    return
  }

  if (lastChild.dataset.format) {
    placeCaretInNode(lastChild, true)
    return
  }

  if (lastChild.classList.contains('math-slot')) {
    placeCaretInNode(lastChild, true)
    return
  }

  placeCaretAfterNode(lastChild)
}

function focusAtStart(root: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretFromMarker(root: HTMLElement): void {
  const marker = root.querySelector('[data-caret-marker="true"]')
  const selection = window.getSelection()
  if (!marker || !selection || !marker.parentNode) return

  const parent = marker.parentNode
  const range = document.createRange()
  range.setStart(parent, Array.from(parent.childNodes).indexOf(marker))
  range.collapse(true)
  marker.remove()
  selection.removeAllRanges()
  selection.addRange(range)
}

function placeCaretInNode(node: Node, atEnd = false): void {
  if (node instanceof HTMLElement && node.classList.contains('math-slot') && node.childNodes.length === 0) {
    const anchor = document.createTextNode(CARET_ANCHOR)
    node.appendChild(anchor)
    const range = document.createRange()
    range.setStart(anchor, anchor.textContent?.length ?? 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return
  }

  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(!atEnd)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretAfterNode(node: Node): void {
  const parent = node.parentNode
  if (!parent) return
  const nextSibling = node.nextSibling
  const anchor = nextSibling?.nodeType === Node.TEXT_NODE ? nextSibling : document.createTextNode(CARET_ANCHOR)
  if (anchor !== nextSibling) parent.insertBefore(anchor, nextSibling)

  const anchorText = anchor.textContent ?? ''
  if (!anchorText.startsWith(CARET_ANCHOR)) {
    anchor.textContent = `${CARET_ANCHOR}${anchorText}`
  }

  const range = document.createRange()
  range.setStart(anchor, 1)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretAfterNodeBoundary(node: Node): void {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretBeforeNode(node: Node): void {
  const parent = node.parentNode
  if (!parent) return
  const previousSibling = node.previousSibling
  const anchor = previousSibling?.nodeType === Node.TEXT_NODE ? previousSibling : document.createTextNode(CARET_ANCHOR)
  if (anchor !== previousSibling) parent.insertBefore(anchor, node)

  const anchorText = anchor.textContent ?? ''
  if (!anchorText.endsWith(CARET_ANCHOR)) {
    anchor.textContent = `${anchorText}${CARET_ANCHOR}`
  }

  const range = document.createRange()
  range.setStart(anchor, anchor.textContent?.length ?? 0)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function rangeFromPoint(clientX: number, clientY: number): Range | null {
  const pointDocument = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const position = pointDocument.caretPositionFromPoint?.(clientX, clientY)
  if (position) {
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }

  return pointDocument.caretRangeFromPoint?.(clientX, clientY) ?? null
}

function placeCaretFromPoint(
  root: HTMLElement,
  event: { clientX: number; clientY: number },
  scope: HTMLElement = root,
): boolean {
  const range = rangeFromPoint(event.clientX, event.clientY)
  if (!range || !root.contains(range.startContainer) || !scope.contains(range.startContainer)) return false

  root.focus()
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return true
}

function selectNode(node: Node): void {
  const range = document.createRange()
  range.selectNode(node)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function currentSlot(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) return null

  const element = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement
  return element?.closest<HTMLElement>('.math-slot') ?? null
}

function owningMathElement(slot: HTMLElement): HTMLElement | null {
  return slot.closest<HTMLElement>('[data-math]')
}

function slotsOwnedByMathElement(mathElement: HTMLElement): HTMLElement[] {
  return Array.from(mathElement.querySelectorAll<HTMLElement>('.math-slot')).filter((slot) => owningMathElement(slot) === mathElement)
}

function clearSelectedMathElements(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-math-selected="true"]').forEach((element) => {
    delete element.dataset.mathSelected
  })
}

function markSelectedMathElement(root: HTMLElement, mathElement: HTMLElement): void {
  clearSelectedMathElements(root)
  mathElement.dataset.mathSelected = 'true'
  selectNode(mathElement)
}

function exactSelectedMathElement(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null

  const selectedNode = range.startContainer.childNodes[range.startOffset]
  return selectedNode instanceof HTMLElement && isAtomicMathElement(selectedNode) && root.contains(selectedNode) ? selectedNode : null
}

function textHasContent(value: string): boolean {
  return value.replace(/\u200b/g, '').length > 0
}

function adjacentMathElementFromNode(node: Node | null, reverse: boolean, scope: HTMLElement): HTMLElement | null {
  let candidate = node

  while (candidate && scope.contains(candidate)) {
    if (candidate.nodeType === Node.TEXT_NODE) {
      if (textHasContent(candidate.textContent ?? '')) return null
    } else if (candidate instanceof HTMLElement) {
      if (isAtomicMathElement(candidate)) return candidate
      if (candidate.textContent?.replace(/\u200b/g, '').trim() || candidate.children.length > 0) return null
    }

    candidate = reverse ? candidate.previousSibling : candidate.nextSibling
  }

  return null
}

function adjacentNodeAtCaretBoundary(container: Node, offset: number, reverse: boolean, scope: HTMLElement): Node | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.textContent ?? ''
    const remainingText = reverse ? text.slice(0, offset) : text.slice(offset)
    if (textHasContent(remainingText)) return null

    let candidate: Node | null = reverse ? container.previousSibling : container.nextSibling
    let parent = container.parentNode

    while (!candidate && parent && parent !== scope) {
      candidate = reverse ? parent.previousSibling : parent.nextSibling
      parent = parent.parentNode
    }

    return candidate
  }

  let candidate: Node | null = container.childNodes[reverse ? offset - 1 : offset] ?? null
  let parent: Node | null = container

  while (!candidate && parent && parent !== scope) {
    candidate = reverse ? parent.previousSibling : parent.nextSibling
    parent = parent.parentNode
  }

  return candidate
}

function adjacentMathElementAtCaret(root: HTMLElement, reverse: boolean): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const focusElement = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement
  const inlineCommand = focusElement?.closest<HTMLElement>('[data-latex]')
  if (inlineCommand && root.contains(inlineCommand)) return inlineCommand

  const activeSlot = currentSlot(root)
  const scope = activeSlot ?? root
  if (!scope.contains(range.startContainer)) return null

  const adjacentNode = adjacentNodeAtCaretBoundary(range.startContainer, range.startOffset, reverse, scope)
  return adjacentMathElementFromNode(adjacentNode, reverse, scope)
}

function mathElementContainingCaret(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const focusElement = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement
  const inlineCommand = focusElement?.closest<HTMLElement>('[data-latex]')
  if (inlineCommand && root.contains(inlineCommand)) return inlineCommand

  if (currentSlot(root)) return null

  const mathElement = focusElement?.closest<HTMLElement>('[data-math]')
  return mathElement && root.contains(mathElement) ? mathElement : null
}

function deleteSelectedMathElement(root: HTMLElement): boolean {
  const mathElement = exactSelectedMathElement(root)
  if (!mathElement) return false

  const parent = mathElement.parentNode
  if (!parent) return false

  const range = document.createRange()
  range.setStartBefore(mathElement)
  range.collapse(true)
  mathElement.remove()

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  clearSelectedMathElements(root)
  return true
}

function emptyFunctionArgSlotContainingCaret(root: HTMLElement, reverse: boolean): HTMLElement | null {
  const slot = currentSlot(root)
  if (!slot || slot.dataset.slot !== 'function-arg' || serializeChildren(slot).trim()) return null
  if (!caretIsAtSlotEdge(slot, !reverse)) return null
  return root.contains(slot) ? slot : null
}

function handleAtomicMathDelete(root: HTMLElement, reverse: boolean): 'deleted' | 'selected' | false {
  if (deleteSelectedMathElement(root)) return 'deleted'

  const mathElement = emptyFunctionArgSlotContainingCaret(root, reverse) ?? mathElementContainingCaret(root) ?? adjacentMathElementAtCaret(root, reverse)
  if (!mathElement) return false

  markSelectedMathElement(root, mathElement)
  return 'selected'
}

function caretIsAtProtectedSlotDeleteBoundary(root: HTMLElement, reverse: boolean): boolean {
  const slot = currentSlot(root)
  return Boolean(slot && caretIsAtSlotEdge(slot, !reverse))
}

function outerMathElementsForSelection(root: HTMLElement, range: Range): HTMLElement[] {
  if (!root.contains(range.commonAncestorContainer)) return []

  const selectedMathElements = Array.from(root.querySelectorAll<HTMLElement>('[data-math]')).filter((mathElement) => {
    if (!range.intersectsNode(mathElement)) return false

    const selectionIsInsideSingleOwnedSlot = slotsOwnedByMathElement(mathElement).some((slot) => (
      slot.contains(range.startContainer) && slot.contains(range.endContainer)
    ))
    return !selectionIsInsideSingleOwnedSlot
  })

  const outerSelectedMathElements = selectedMathElements.filter((mathElement) => (
    !selectedMathElements.some((otherElement) => otherElement !== mathElement && otherElement.contains(mathElement))
  ))

  return outerSelectedMathElements
}

function previewSelectionAroundMathElements(root: HTMLElement): void {
  const selection = window.getSelection()
  clearSelectedMathElements(root)
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

  const outerSelectedMathElements = outerMathElementsForSelection(root, selection.getRangeAt(0))
  outerSelectedMathElements.forEach((mathElement) => {
    mathElement.dataset.mathSelected = 'true'
  })
}

function normalizeSelectionAroundMathElements(root: HTMLElement): void {
  const selection = window.getSelection()
  clearSelectedMathElements(root)
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

  const range = selection.getRangeAt(0)
  const outerSelectedMathElements = outerMathElementsForSelection(root, range)
  if (outerSelectedMathElements.length === 0) return

  const nextRange = range.cloneRange()
  outerSelectedMathElements.forEach((mathElement) => {
    mathElement.dataset.mathSelected = 'true'
    if (mathElement.contains(nextRange.startContainer)) nextRange.setStartBefore(mathElement)
    if (mathElement.contains(nextRange.endContainer)) nextRange.setEndAfter(mathElement)
  })

  selection.removeAllRanges()
  selection.addRange(nextRange)
}

type TabTraversalEntry =
  | { kind: 'row-end'; root: HTMLElement }
  | { kind: 'slot'; element: HTMLElement; edge: 'start' | 'end' }
  | { kind: 'element'; element: HTMLElement }
  | { kind: 'word'; node: Text; start: number; end: number }

type TabTraversalResult = 'moved' | 'commit' | 'previous-row' | 'next-row' | 'none'

function isListMarkerElement(element: HTMLElement): boolean {
  return element.classList.contains('text-list-bullet-marker') || element.classList.contains('text-list-number-marker')
}

function collectWordEntries(node: Text, entries: TabTraversalEntry[]): void {
  const text = node.textContent ?? ''
  const wordPattern = /[^\s\u200b]+/g
  for (let match = wordPattern.exec(text); match; match = wordPattern.exec(text)) {
    entries.push({ kind: 'word', node, start: match.index, end: match.index + match[0].length })
  }
}

function slotHasTabbableContent(slot: HTMLElement): boolean {
  return serializeChildren(slot).trim().length > 0
}

function collectTabTraversalEntries(node: Node, root: HTMLElement, entries: TabTraversalEntry[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    collectWordEntries(node as Text, entries)
    return
  }

  if (!(node instanceof HTMLElement) || node.tagName === 'BR' || !root.contains(node)) return
  if (isListMarkerElement(node)) return

  if (node.classList.contains('math-slot')) {
    entries.push({ kind: 'slot', element: node, edge: 'start' })
    if (slotHasTabbableContent(node)) entries.push({ kind: 'slot', element: node, edge: 'end' })
    return
  }

  if (node.dataset.latex) {
    entries.push({ kind: 'element', element: node })
    return
  }

  if (node.dataset.math) {
    if (node.querySelector('.math-slot')) {
      node.childNodes.forEach((child) => collectTabTraversalEntries(child, root, entries))
    } else {
      entries.push({ kind: 'element', element: node })
    }
    return
  }

  if (node.getAttribute('contenteditable') === 'false') return

  node.childNodes.forEach((child) => collectTabTraversalEntries(child, root, entries))
}

function tabTraversalEntries(root: HTMLElement): TabTraversalEntry[] {
  const entries: TabTraversalEntry[] = []
  root.childNodes.forEach((child) => collectTabTraversalEntries(child, root, entries))
  entries.push({ kind: 'row-end', root })
  return entries
}

function rangeForTabTraversalEntry(entry: TabTraversalEntry): Range {
  const range = document.createRange()
  if (entry.kind === 'row-end') {
    range.selectNodeContents(entry.root)
    range.collapse(false)
    return range
  }

  if (entry.kind === 'word') {
    range.setStart(entry.node, entry.start)
    range.setEnd(entry.node, entry.end)
    return range
  }

  if (entry.kind === 'slot') {
    range.selectNodeContents(entry.element)
    range.collapse(entry.edge === 'start')
    return range
  }

  range.selectNode(entry.element)
  return range
}

function collapsedRangesAreEqual(left: Range, right: Range): boolean {
  return left.collapsed
    && right.collapsed
    && left.compareBoundaryPoints(Range.START_TO_START, right) === 0
}

function selectionSelectsElement(selection: Selection, element: HTMLElement): boolean {
  if (selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const parent = element.parentNode
  if (!parent || range.startContainer !== parent || range.endContainer !== parent) return false
  const index = Array.from(parent.childNodes).indexOf(element)
  return range.startOffset === index && range.endOffset === index + 1
}

function selectionIsInsideTabEntry(selection: Selection, entry: TabTraversalEntry): boolean {
  if (entry.kind === 'row-end') {
    return selection.rangeCount > 0 && collapsedRangesAreEqual(selection.getRangeAt(0), rangeForTabTraversalEntry(entry))
  }

  if (entry.kind === 'word') {
    return selection.isCollapsed
      && selection.anchorNode === entry.node
      && selection.anchorOffset >= entry.start
      && selection.anchorOffset <= entry.end
  }

  if (entry.kind === 'slot') {
    return selection.rangeCount > 0 && collapsedRangesAreEqual(selection.getRangeAt(0), rangeForTabTraversalEntry(entry))
  }

  return Boolean(selection.anchorNode && entry.element.contains(selection.anchorNode)) || selectionSelectsElement(selection, entry.element)
}

function placeCaretAtTabTraversalEntry(entry: TabTraversalEntry): void {
  if (entry.kind === 'row-end') {
    focusAtLogicalRowEnd(entry.root)
    return
  }

  if (entry.kind === 'word') {
    const range = document.createRange()
    range.setStart(entry.node, entry.start)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return
  }

  if (entry.kind === 'slot') {
    placeCaretInNode(entry.element, entry.edge === 'end')
    return
  }

  selectNode(entry.element)
}

function nextEntryIndexFromCaret(entries: TabTraversalEntry[], range: Range, reverse: boolean): number {
  if (reverse) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entryRange = rangeForTabTraversalEntry(entries[index])
      if (range.compareBoundaryPoints(Range.START_TO_END, entryRange) > 0) return index
    }
    return -1
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entryRange = rangeForTabTraversalEntry(entries[index])
    if (range.compareBoundaryPoints(Range.START_TO_START, entryRange) <= 0) return index
  }
  return -1
}

function indentListAtContentStart(root: HTMLElement): boolean {
  normalizeListCaret(root)
  const list = activeListElement(root)
  if (!list) return false

  const format = list.dataset.list as 'bulletList' | 'numberedList' | undefined
  if (format !== 'bulletList' && format !== 'numberedList') return false

  const content = listContentElement(list)
  if (!content || !caretIsAtElementEdge(content, false)) return false

  content.innerHTML = listHtml(format, content.innerHTML, false, 1)
  const nestedContent = content.querySelector<HTMLElement>(':scope > [data-list] > .text-list-content')
  if (nestedContent) placeCaretInNode(nestedContent)
  return true
}

function moveToTabTraversalEntry(root: HTMLElement, reverse = false): TabTraversalResult {
  if (!reverse && indentListAtContentStart(root)) return 'commit'

  normalizeSelectionAroundMathElements(root)
  if (!reverse && caretIsAtElementEdge(root, true)) return 'next-row'
  if (reverse && caretIsAtElementEdge(root, false)) return 'previous-row'

  const entries = tabTraversalEntries(root)
  if (entries.length === 0) return reverse ? 'previous-row' : 'next-row'

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) {
    placeCaretAtTabTraversalEntry(entries[reverse ? entries.length - 1 : 0])
    return 'moved'
  }

  const activeIndex = entries.findIndex((entry) => selectionIsInsideTabEntry(selection, entry))
  const nextIndex = activeIndex >= 0
    ? activeIndex + (reverse ? -1 : 1)
    : nextEntryIndexFromCaret(entries, selection.getRangeAt(0), reverse)

  if (nextIndex >= 0 && nextIndex < entries.length) {
    placeCaretAtTabTraversalEntry(entries[nextIndex])
    return 'moved'
  }

  return reverse ? 'previous-row' : 'next-row'
}

function caretIsAtSlotEdge(slot: HTMLElement, atEnd: boolean): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false

  const range = selection.getRangeAt(0).cloneRange()
  const comparisonRange = document.createRange()
  comparisonRange.selectNodeContents(slot)

  if (atEnd) {
    comparisonRange.setStart(range.endContainer, range.endOffset)
  } else {
    comparisonRange.setEnd(range.startContainer, range.startOffset)
  }

  return comparisonRange.toString().length === 0
}

function moveOutOfMathElement(root: HTMLElement, reverse = false): boolean {
  const activeSlot = currentSlot(root)
  const activeMathElement = activeSlot ? owningMathElement(activeSlot) : null
  if (!activeSlot) return false

  if (!activeMathElement) {
    if (!caretIsAtSlotEdge(activeSlot, !reverse)) return false

    if (reverse) {
      placeCaretBeforeNode(activeSlot)
    } else {
      placeCaretAfterNodeBoundary(activeSlot)
    }
    return true
  }

  const slots = slotsOwnedByMathElement(activeMathElement)
  const activeIndex = slots.indexOf(activeSlot)
  const isAtBoundarySlot = reverse ? activeIndex === 0 : activeIndex === slots.length - 1
  if (!isAtBoundarySlot || !caretIsAtSlotEdge(activeSlot, !reverse)) return false

  if (reverse) {
    placeCaretBeforeNode(activeMathElement)
  } else {
    placeCaretAfterNode(activeMathElement)
  }
  return true
}

function rectsForNode(node: Node): DOMRect[] {
  if (node instanceof HTMLElement) return Array.from(node.getClientRects())
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.replace(/\u200b/g, '').trim()) return []

  const range = document.createRange()
  range.selectNodeContents(node)
  return Array.from(range.getClientRects())
}

function rowLineRectEntries(
  root: HTMLElement,
  event: { clientY: number },
): Array<{ node: Node; rect: DOMRect }> {
  const rectEntries = Array.from(root.childNodes).flatMap((node) => rectsForNode(node).map((rect) => ({ node, rect })))
  const sameLineEntries = rectEntries.filter(({ rect }) => event.clientY >= rect.top - 6 && event.clientY <= rect.bottom + 6)
  return (sameLineEntries.length ? sameLineEntries : rectEntries).sort((a, b) => a.rect.left - b.rect.left)
}

function placeCaretForRowBoundaryPointer(
  root: HTMLElement,
  event: { clientX: number; clientY: number },
): boolean {
  const entries = rowLineRectEntries(root, event)
  if (entries.length === 0) {
    root.focus()
    focusAtEnd(root)
    return true
  }

  const firstEntry = entries[0]
  const lastEntry = entries[entries.length - 1]
  const firstEntryIsMath = firstEntry.node instanceof HTMLElement && Boolean(firstEntry.node.dataset.math)
  const startMargin = firstEntryIsMath
    ? Math.max(ROW_START_MATH_CARET_MARGIN, firstEntry.rect.width * ROW_START_MATH_CARET_RATIO)
    : ROW_BOUNDARY_CARET_MARGIN
  root.focus()

  if (event.clientX <= firstEntry.rect.left + startMargin) {
    placeCaretBeforeNode(firstEntry.node)
    return true
  }

  if (event.clientX >= lastEntry.rect.right - ROW_BOUNDARY_CARET_MARGIN) {
    placeCaretAfterNode(lastEntry.node)
    return true
  }

  return false
}

function placeCaretForEditorPointer(
  root: HTMLElement,
  event: { clientX: number; clientY: number; target: EventTarget | null },
): boolean {
  if (event.target !== root) return false
  if (placeCaretForRowBoundaryPointer(root, event)) return true
  if (placeCaretFromPoint(root, event)) return true

  const entries = rowLineRectEntries(root, event)
  const nextEntry = entries.find(({ rect }) => event.clientX < rect.left + rect.width / 2)
  root.focus()

  if (nextEntry) {
    placeCaretBeforeNode(nextEntry.node)
  } else {
    placeCaretAfterNode(entries[entries.length - 1].node)
  }

  return true
}

function placeCaretForMathPointer(
  root: HTMLElement,
  event: { clientX: number; clientY: number; target: EventTarget | null },
): boolean {
  if (!(event.target instanceof HTMLElement)) return false

  const mathElement = event.target.closest<HTMLElement>('[data-math]')
  if (!mathElement || !root.contains(mathElement)) return false

  const slot = event.target.closest<HTMLElement>('.math-slot')
  if (slot) {
    if (owningMathElement(slot) !== mathElement) return false
    return placeCaretFromPoint(root, event, slot) || (root.focus(), placeCaretInNode(slot, true), true)
  }

  const delimiterMark = event.target.closest<HTMLElement>('.math-delimiter-mark')
  const mathRect = mathElement.getBoundingClientRect()
  if (delimiterMark || event.clientX <= mathRect.left + 2 || event.clientX >= mathRect.right - 2) {
    root.focus()
    if (event.clientX < mathRect.left + mathRect.width / 2) {
      placeCaretBeforeNode(mathElement)
    } else {
      placeCaretAfterNode(mathElement)
    }
    return true
  }

  return false
}

function placeCaretForCommandPointer(
  root: HTMLElement,
  event: { clientX: number; target: EventTarget | null },
): boolean {
  if (!(event.target instanceof HTMLElement)) return false

  const command = event.target.closest<HTMLElement>('[data-latex]')
  if (!command || !root.contains(command)) return false

  const rect = command.getBoundingClientRect()
  root.focus()
  if (event.clientX < rect.left + rect.width / 2) {
    placeCaretBeforeNode(command)
  } else {
    placeCaretAfterNode(command)
  }
  return true
}

function placeCaretForStandaloneSlotPointer(
  root: HTMLElement,
  event: { clientX: number; clientY: number; target: EventTarget | null },
): boolean {
  if (!(event.target instanceof HTMLElement)) return false

  const slot = event.target.closest<HTMLElement>('.math-slot')
  if (!slot || !root.contains(slot) || owningMathElement(slot)) return false

  return placeCaretFromPoint(root, event, slot) || (root.focus(), placeCaretInNode(slot, true), true)
}

function normalizeSelectionForTyping(root: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) return
  normalizeListCaret(root)
  if (currentSlot(root)) return

  const element = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement
  const mathElement = element?.closest<HTMLElement>('[data-math]')
  if (!mathElement) return

  const tableCell = element?.closest('td')
  const matrixCellSlot = tableCell?.querySelector<HTMLElement>(':scope > [data-slot="matrix-cell"]')
  if (matrixCellSlot) {
    placeCaretInNode(matrixCellSlot, true)
    return
  }

  placeCaretAfterNode(mathElement)
}

function isTextInputKey(event: React.KeyboardEvent<HTMLDivElement>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

function insertHtmlAtSelection(root: HTMLElement, html: string): void {
  root.focus()
  if (!selectionIsInside(root)) focusAtEnd(root)
  normalizeSelectionForTyping(root)

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  range.deleteContents()

  const template = document.createElement('template')
  template.innerHTML = html
  const fragment = template.content
  const lastChild = fragment.lastChild
  range.insertNode(fragment)

  if (root.querySelector('[data-caret-marker="true"]')) {
    placeCaretFromMarker(root)
    return
  }

  if (lastChild) {
    range.setStartAfter(lastChild)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }
}

function insertPlainTextAtSelection(root: HTMLElement, text: string): void {
  insertHtmlAtSelection(root, `${escapeHtml(text)}<span data-caret-marker="true"></span>`)
}

function activeListElement(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) return null

  const element = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement
  return element?.closest<HTMLElement>('[data-list]') ?? null
}

function listContentElement(list: HTMLElement): HTMLElement | null {
  return list.querySelector<HTMLElement>(':scope > .text-list-content')
}

function listContentIsEmpty(list: HTMLElement): boolean {
  const content = listContentElement(list)
  return !content || serializeChildren(content).trim().length === 0
}

function fragmentIsVisuallyEmpty(fragment: DocumentFragment): boolean {
  return (fragment.textContent ?? '').replace(/\u200b/g, '').length === 0
    && fragment.querySelector('[data-math], [data-latex], [data-list], [data-slot]') == null
}

function caretIsAtElementEdge(element: HTMLElement, atEnd: boolean): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) return false

  const range = selection.getRangeAt(0).cloneRange()
  const comparisonRange = document.createRange()
  comparisonRange.selectNodeContents(element)

  if (atEnd) {
    comparisonRange.setStart(range.endContainer, range.endOffset)
  } else {
    comparisonRange.setEnd(range.startContainer, range.startOffset)
  }

  return fragmentIsVisuallyEmpty(comparisonRange.cloneContents())
}

function firstRowListElement(root: HTMLElement): HTMLElement | null {
  const firstMeaningfulChild = Array.from(root.childNodes).find((child) => {
    if (child.nodeType === Node.TEXT_NODE) return Boolean((child.textContent ?? '').replace(/\u200b/g, '').trim())
    return child instanceof HTMLElement && child.tagName !== 'BR'
  })
  return firstMeaningfulChild instanceof HTMLElement && firstMeaningfulChild.dataset.list ? firstMeaningfulChild : null
}

function normalizeListCaret(root: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) return false

  const element = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement
  const list = element?.closest<HTMLElement>('[data-list]') ?? firstRowListElement(root)
  if (!list) return false

  const content = listContentElement(list)
  if (!content || content.contains(selection.anchorNode)) return false

  if (!list.contains(selection.anchorNode)) {
    const listRange = document.createRange()
    listRange.selectNode(list)
    if (selection.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, listRange) > 0) return false
  }

  const contentRange = document.createRange()
  contentRange.selectNodeContents(content)
  const caretIsBeforeContent = selection.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, contentRange) <= 0
  placeCaretInNode(content, !caretIsBeforeContent)
  return true
}

function caretIsAtTrueRowStart(root: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) return false
  if (activeListElement(root)) return false

  const range = selection.getRangeAt(0).cloneRange()
  const before = document.createRange()
  before.setStart(root, 0)
  before.setEnd(range.startContainer, range.startOffset)
  const fragment = before.cloneContents()
  return (fragment.textContent ?? '').replace(/\u200b/g, '').length === 0 && fragment.querySelector?.('[data-math], [data-latex], [data-list]') == null
}

function removeEmptyListFormatting(root: HTMLElement): boolean {
  const list = activeListElement(root) ?? firstRowListElement(root)
  if (!list || !listContentIsEmpty(list)) return false

  root.innerHTML = ''
  focusAtEnd(root)
  return true
}

function removeListFormattingAtContentStart(root: HTMLElement): boolean {
  normalizeListCaret(root)
  const list = activeListElement(root)
  if (!list) return false

  const content = listContentElement(list)
  if (!content || !caretIsAtElementEdge(content, false)) return false

  root.innerHTML = content.innerHTML
  placeCaretInNode(root)
  return true
}

function setNumberedListValue(root: HTMLElement, value?: number): void {
  if (!value) return
  root.querySelectorAll<HTMLElement>('.text-list-number-marker').forEach((marker) => {
    marker.dataset.number = String(value)
  })
}

function changeKindForInputType(inputType: string): CellChangeKind {
  if (inputType === 'insertText') return 'typing'
  if (inputType.startsWith('delete')) return 'delete'
  if (inputType === 'insertFromPaste') return 'paste'
  return 'other'
}

function applyFormatToLatexSource(textarea: HTMLTextAreaElement | null, currentLatex: string, format: TextFormatCommand): { latex: string; cursor: number } {
  const [open, close] = LATEX_INLINE_FORMATS[format]
  const start = textarea?.selectionStart ?? 0
  const end = textarea?.selectionEnd ?? currentLatex.length
  const selected = currentLatex.slice(start, end)
  const body = selected || (format === 'bulletList' || format === 'numberedList' ? ' ' : '')
  const latex = `${currentLatex.slice(0, start)}${open}${body}${close}${currentLatex.slice(end)}`
  return { latex, cursor: start + open.length + body.length }
}

function applyFormatToVisualEditor(root: HTMLElement, format: TextFormatCommand, number = 1): void {
  root.focus()
  if (!selectionIsInside(root)) focusAtEnd(root)
  normalizeSelectionAroundMathElements(root)

  if (format === 'bulletList' || format === 'numberedList') {
    const existingList = root.querySelector<HTMLElement>('[data-list]')
    if (existingList?.dataset.list === format) {
      root.innerHTML = listContentElement(existingList)?.innerHTML ?? ''
      focusAtEnd(root)
      return
    }

    root.innerHTML = listHtml(format, root.innerHTML, root.innerHTML.trim().length === 0, number)
    const content = root.querySelector<HTMLElement>('.text-list-content')
    if (content) placeCaretInNode(content, true)
    return
  }

  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 && root.contains(selection.anchorNode) ? selection.getRangeAt(0) : null
  if (range && !range.collapsed) {
    const wrapper = document.createElement('span')
    wrapper.className = `text-format text-format-${format}`
    wrapper.dataset.format = format
    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)
    placeCaretAfterNode(wrapper)
    return
  }

  const hasContent = serializeEditor(root).length > 0
  if (hasContent) {
    root.innerHTML = formatHtml(format, root.innerHTML)
    focusAtEnd(root)
  } else {
    insertHtmlAtSelection(root, formatHtml(format, '', true))
  }
}

export function CellEditor({
  cell,
  isActive,
  viewMode,
  onActivate,
  onChange,
  onInsertHandle,
  pendingSelectionRestore = null,
  onSelectionRestoreComplete,
  onAddCellAbove,
  onAddCellBelow,
  onDeleteCell,
  rowListKind = null,
  numberedListValue,
  canContinueNumbering = false,
  onContinueNumbering,
  onFocusPrevious,
  onFocusNext,
}: CellEditorProps) {
  const visualEditorRef = useRef<HTMLDivElement | null>(null)
  const latexTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const lastSyncedLatexRef = useRef(cell.latex || '')
  const cellRef = useRef(cell)
  const onActivateRef = useRef(onActivate)
  const onChangeRef = useRef(onChange)
  const onInsertHandleRef = useRef(onInsertHandle)
  const onSelectionRestoreCompleteRef = useRef(onSelectionRestoreComplete)
  const onAddCellAboveRef = useRef(onAddCellAbove)
  const onAddCellBelowRef = useRef(onAddCellBelow)
  const onDeleteCellRef = useRef(onDeleteCell)
  const onContinueNumberingRef = useRef(onContinueNumbering)
  const onFocusPreviousRef = useRef(onFocusPrevious)
  const onFocusNextRef = useRef(onFocusNext)
  const pointerStartRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const selectionPreviewFrameRef = useRef<number | null>(null)
  const selectionBeforeInputRef = useRef<EditorSelectionState | null>(null)
  const [listContextMenu, setListContextMenu] = useState<{ top: number; left: number } | null>(null)

  cellRef.current = cell
  onActivateRef.current = onActivate
  onChangeRef.current = onChange
  onInsertHandleRef.current = onInsertHandle
  onSelectionRestoreCompleteRef.current = onSelectionRestoreComplete
  onAddCellAboveRef.current = onAddCellAbove
  onAddCellBelowRef.current = onAddCellBelow
  onDeleteCellRef.current = onDeleteCell
  onContinueNumberingRef.current = onContinueNumbering
  onFocusPreviousRef.current = onFocusPrevious
  onFocusNextRef.current = onFocusNext

  const getSelectionState = useCallback((): EditorSelectionState | null => {
    if (viewMode === 'latex') {
      const textarea = latexTextareaRef.current
      if (!textarea) return null
      return {
        viewMode: 'latex',
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      }
    }

    const editor = visualEditorRef.current
    return editor ? visualSelectionState(editor) : null
  }, [viewMode])

  const restoreSelectionState = useCallback((selectionState: EditorSelectionState) => {
    if (selectionState.viewMode === 'latex') {
      const textarea = latexTextareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(selectionState.selectionStart, selectionState.selectionEnd)
      return
    }

    const editor = visualEditorRef.current
    if (editor) restoreVisualSelection(editor, selectionState)
  }, [])

  const commitVisualEditor = useCallback((metadata: CellChangeMetadata = { kind: 'other' }) => {
    const editor = visualEditorRef.current
    if (!editor) return
    const nextLatex = serializeEditor(editor)
    lastSyncedLatexRef.current = nextLatex
    onChangeRef.current({ ...cellRef.current, latex: nextLatex }, metadata)
  }, [])

  const insertIntoLatexSource = useCallback((snippet: string, mode: InsertMode = 'write') => {
    const textarea = latexTextareaRef.current
    const latexSnippet = getLatexSourceSnippet(snippet, mode)
    const currentCell = cellRef.current
    const currentLatex = currentCell.latex || ''
    const start = textarea?.selectionStart ?? currentLatex.length
    const end = textarea?.selectionEnd ?? start
    const selectionBefore = getSelectionState()
    const nextLatex = `${currentLatex.slice(0, start)}${latexSnippet}${currentLatex.slice(end)}`
    const nextCursor = start + latexSnippet.length

    lastSyncedLatexRef.current = nextLatex
    onChangeRef.current({ ...currentCell, latex: nextLatex }, { kind: 'insert', selectionBefore })

    window.requestAnimationFrame(() => {
      latexTextareaRef.current?.focus()
      latexTextareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }, [getSelectionState])

  const insertIntoVisualEditor = useCallback((snippet: string, mode: InsertMode = 'write') => {
    const editor = visualEditorRef.current
    if (!editor) return

    onActivateRef.current()
    const selectionBefore = visualSelectionState(editor)
    insertHtmlAtSelection(editor, htmlForSnippet(snippet, mode))
    commitVisualEditor({ kind: 'insert', selectionBefore })
  }, [commitVisualEditor])

  const formatLatexSource = useCallback((format: TextFormatCommand) => {
    const currentCell = cellRef.current
    const selectionBefore = getSelectionState()
    const { latex, cursor } = applyFormatToLatexSource(latexTextareaRef.current, currentCell.latex || '', format)
    lastSyncedLatexRef.current = latex
    onChangeRef.current({ ...currentCell, latex }, { kind: 'format', selectionBefore })

    window.requestAnimationFrame(() => {
      latexTextareaRef.current?.focus()
      latexTextareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }, [getSelectionState])

  const formatVisualEditor = useCallback((format: TextFormatCommand) => {
    const editor = visualEditorRef.current
    if (!editor) return

    onActivateRef.current()
    const selectionBefore = visualSelectionState(editor)
    applyFormatToVisualEditor(editor, format, numberedListValue ?? 1)
    commitVisualEditor({ kind: 'format', selectionBefore })
  }, [commitVisualEditor, numberedListValue])

  const getCurrentLatex = useCallback(() => {
    if (viewMode === 'latex') return latexTextareaRef.current?.value ?? cellRef.current.latex ?? ''
    return visualEditorRef.current ? serializeEditor(visualEditorRef.current) : cellRef.current.latex ?? ''
  }, [viewMode])

  const scheduleSelectionPreview = useCallback((editor: HTMLElement) => {
    if (selectionPreviewFrameRef.current !== null) return

    selectionPreviewFrameRef.current = window.requestAnimationFrame(() => {
      selectionPreviewFrameRef.current = null
      previewSelectionAroundMathElements(editor)
    })
  }, [])

  const syncHandle = useCallback(() => {
    if (viewMode === 'latex') {
      onInsertHandleRef.current({
        insert: insertIntoLatexSource,
        format: formatLatexSource,
        getLatex: getCurrentLatex,
        getSelection: getSelectionState,
        restoreSelection: restoreSelectionState,
        focus: () => latexTextareaRef.current?.focus(),
      })
      return
    }

    onInsertHandleRef.current({
      insert: insertIntoVisualEditor,
      format: formatVisualEditor,
      getLatex: getCurrentLatex,
      getSelection: getSelectionState,
      restoreSelection: restoreSelectionState,
      focus: () => visualEditorRef.current?.focus(),
    })
  }, [formatLatexSource, formatVisualEditor, getCurrentLatex, getSelectionState, insertIntoLatexSource, insertIntoVisualEditor, restoreSelectionState, viewMode])

  useEffect(() => {
    syncHandle()
  }, [syncHandle])

  useEffect(() => {
    return () => {
      if (selectionPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionPreviewFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isActive) return

    if (viewMode === 'latex') {
      latexTextareaRef.current?.focus()
    } else {
      const editor = visualEditorRef.current
      editor?.focus()
      if (editor && !selectionIsInside(editor)) focusAtStart(editor)
    }
    syncHandle()
  }, [isActive, syncHandle, viewMode])

  useEffect(() => {
    if (!isActive || !pendingSelectionRestore) return undefined

    const frame = window.requestAnimationFrame(() => {
      restoreSelectionState(pendingSelectionRestore)
      onSelectionRestoreCompleteRef.current?.()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isActive, pendingSelectionRestore, restoreSelectionState])

  useEffect(() => {
    const editor = visualEditorRef.current
    if (!editor || viewMode !== 'wysiwyg') return

    const nextLatex = cell.latex || ''
    if (nextLatex === lastSyncedLatexRef.current) return

    editor.innerHTML = renderLatexToHtml(nextLatex)
    setNumberedListValue(editor, numberedListValue)
    lastSyncedLatexRef.current = nextLatex
  }, [cell.latex, numberedListValue, viewMode])

  useEffect(() => {
    const editor = visualEditorRef.current
    if (!editor || viewMode !== 'wysiwyg') return

    editor.innerHTML = renderLatexToHtml(cellRef.current.latex || '')
    setNumberedListValue(editor, numberedListValue)
    lastSyncedLatexRef.current = cellRef.current.latex || ''
  }, [numberedListValue, viewMode])

  useEffect(() => {
    const editor = visualEditorRef.current
    if (!editor || viewMode !== 'wysiwyg') return
    setNumberedListValue(editor, numberedListValue)
  }, [numberedListValue, viewMode])

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      const result = moveToTabTraversalEntry(event.currentTarget, event.shiftKey)
      if (result === 'commit') {
        commitVisualEditor({ kind: 'other' })
      } else if (result === 'previous-row') {
        onFocusPreviousRef.current()
      } else if (result === 'next-row') {
        onFocusNextRef.current()
      }
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const selectionBefore = visualSelectionState(event.currentTarget)
      if (event.key === 'Backspace' && removeEmptyListFormatting(event.currentTarget)) {
        event.preventDefault()
        commitVisualEditor({ kind: 'delete', selectionBefore, inputType: 'deleteContentBackward' })
        return
      }
      if (event.key === 'Backspace' && removeListFormattingAtContentStart(event.currentTarget)) {
        event.preventDefault()
        commitVisualEditor({ kind: 'delete', selectionBefore, inputType: 'deleteContentBackward' })
        return
      }
      normalizeSelectionAroundMathElements(event.currentTarget)
      const atomicDeleteResult = handleAtomicMathDelete(event.currentTarget, event.key === 'Backspace')
      if (atomicDeleteResult) {
        event.preventDefault()
        if (atomicDeleteResult === 'deleted') {
          commitVisualEditor({
            kind: 'delete',
            selectionBefore,
            inputType: event.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward',
          })
        }
      } else if (caretIsAtProtectedSlotDeleteBoundary(event.currentTarget, event.key === 'Backspace')) {
        event.preventDefault()
      } else if (event.key === 'Backspace' && !serializeEditor(event.currentTarget).trim()) {
        onDeleteCellRef.current()
      }
    } else if (isTextInputKey(event)) {
      const selectionBefore = visualSelectionState(event.currentTarget)
      clearSelectedMathElements(event.currentTarget)
      normalizeSelectionForTyping(event.currentTarget)
      if (currentSlot(event.currentTarget)) {
        event.preventDefault()
        insertPlainTextAtSelection(event.currentTarget, event.key)
        commitVisualEditor({ kind: 'typing', selectionBefore, inputType: 'insertText', data: event.key })
      }
    } else if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      const selectionBefore = visualSelectionState(event.currentTarget)
      if (removeEmptyListFormatting(event.currentTarget)) {
        commitVisualEditor({ kind: 'delete', selectionBefore, inputType: 'deleteContentBackward' })
      } else if (caretIsAtTrueRowStart(event.currentTarget)) {
        onAddCellAboveRef.current()
      } else {
        onAddCellBelowRef.current()
      }
    } else if (event.key === 'ArrowRight' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      clearSelectedMathElements(event.currentTarget)
      if (moveOutOfMathElement(event.currentTarget)) event.preventDefault()
    } else if (event.key === 'ArrowLeft' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      clearSelectedMathElements(event.currentTarget)
      if (moveOutOfMathElement(event.currentTarget, true)) event.preventDefault()
    } else if (event.key === 'ArrowUp' && event.ctrlKey) {
      event.preventDefault()
      onFocusPreviousRef.current()
    } else if (event.key === 'ArrowDown' && event.ctrlKey) {
      event.preventDefault()
      onFocusNextRef.current()
    }
  }

  return (
    <div
      className={`cell-editor${isActive ? ' cell-editor-active' : ''}`}
      onPointerDown={(event) => {
        setListContextMenu(null)
        onActivate()
        if (viewMode === 'wysiwyg' && event.target === event.currentTarget) {
          visualEditorRef.current?.focus()
        }
      }}
    >
      {viewMode === 'latex' ? (
        <textarea
          ref={latexTextareaRef}
          className="latex-source-editor"
          value={cell.latex || ''}
          spellCheck={false}
          aria-label="LaTeX source"
          onFocus={onActivate}
          onBeforeInput={() => {
            selectionBeforeInputRef.current = getSelectionState()
          }}
          onChange={(event) => {
            const nativeEvent = event.nativeEvent as InputEvent
            const inputType = nativeEvent.inputType ?? 'insertText'
            lastSyncedLatexRef.current = event.target.value
            onChange(
              { ...cell, latex: event.target.value },
              {
                kind: changeKindForInputType(inputType),
                selectionBefore: selectionBeforeInputRef.current,
                inputType,
                data: nativeEvent.data,
              },
            )
            selectionBeforeInputRef.current = null
          }}
        />
      ) : (
        <div
          ref={visualEditorRef}
          className="visual-math-editor"
          contentEditable
          role="textbox"
          aria-label="Math row"
          spellCheck={false}
          suppressContentEditableWarning
          onFocus={onActivate}
          onBlur={(event) => {
            pointerStartRef.current = null
            clearSelectedMathElements(event.currentTarget)
          }}
          onBeforeInput={(event) => {
            selectionBeforeInputRef.current = visualSelectionState(event.currentTarget)
            normalizeSelectionForTyping(event.currentTarget)
          }}
          onInput={(event) => {
            const nativeEvent = event.nativeEvent as InputEvent
            const inputType = nativeEvent.inputType ?? 'insertText'
            commitVisualEditor({
              kind: changeKindForInputType(inputType),
              selectionBefore: selectionBeforeInputRef.current,
              inputType,
              data: nativeEvent.data,
            })
            selectionBeforeInputRef.current = null
          }}
          onKeyDown={handleEditorKeyDown}
          onKeyUp={(event) => {
            normalizeListCaret(event.currentTarget)
            normalizeSelectionAroundMathElements(event.currentTarget)
          }}
          onSelect={(event) => scheduleSelectionPreview(event.currentTarget)}
          onPointerDown={(event) => {
            clearSelectedMathElements(event.currentTarget)
            pointerStartRef.current = { clientX: event.clientX, clientY: event.clientY }
          }}
          onPointerMove={(event) => {
            const pointerStart = pointerStartRef.current
            if (!pointerStart) return

            const movement = Math.hypot(event.clientX - pointerStart.clientX, event.clientY - pointerStart.clientY)
            if (movement >= 4) scheduleSelectionPreview(event.currentTarget)
          }}
          onPointerUp={(event) => {
            const editor = event.currentTarget
            const target = event.target
            const clientX = event.clientX
            const clientY = event.clientY
            const pointerStart = pointerStartRef.current
            pointerStartRef.current = null
            if (selectionPreviewFrameRef.current !== null) {
              window.cancelAnimationFrame(selectionPreviewFrameRef.current)
              selectionPreviewFrameRef.current = null
            }

            window.requestAnimationFrame(() => {
              const selection = window.getSelection()
              const movement = pointerStart
                ? Math.hypot(clientX - pointerStart.clientX, clientY - pointerStart.clientY)
                : Number.POSITIVE_INFINITY
              const isClick = movement < 4

              if (!isClick || (selection && selection.rangeCount > 0 && !selection.isCollapsed)) {
                normalizeSelectionAroundMathElements(editor)
                return
              }

              if (
                !placeCaretForRowBoundaryPointer(editor, { clientX, clientY }) &&
                !placeCaretForMathPointer(editor, { clientX, clientY, target }) &&
                !placeCaretForCommandPointer(editor, { clientX, target }) &&
                !placeCaretForStandaloneSlotPointer(editor, { clientX, clientY, target })
              ) {
                placeCaretForEditorPointer(editor, { clientX, clientY, target })
              }
              normalizeListCaret(editor)
            })
          }}
          onPointerCancel={(event) => {
            pointerStartRef.current = null
            clearSelectedMathElements(event.currentTarget)
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            const target = event.target instanceof HTMLElement ? event.target : null
            const isNumberedListTarget = Boolean(target?.closest('.text-list-number-marker, .text-list-numberedList'))
            if (rowListKind === 'numberedList' && canContinueNumbering && isNumberedListTarget) {
              setListContextMenu({ top: event.clientY, left: event.clientX })
            }
          }}
          onPaste={(event) => {
            event.preventDefault()
            const selectionBefore = visualSelectionState(event.currentTarget)
            insertPlainTextAtSelection(event.currentTarget, event.clipboardData.getData('text/plain'))
            commitVisualEditor({ kind: 'paste', selectionBefore, inputType: 'insertFromPaste' })
          }}
        />
      )}
      {listContextMenu ? (
        <div className="list-context-menu" style={{ top: listContextMenu.top, left: listContextMenu.left }}>
          <button
            type="button"
            className="list-context-menu-item"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onContinueNumberingRef.current?.()
              setListContextMenu(null)
            }}
          >
            Continue numbering
          </button>
        </div>
      ) : null}
    </div>
  )
}
