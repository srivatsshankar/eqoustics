import { useCallback, useEffect, useRef } from 'react'

import type { NotebookCell } from '../../shared/types/notebook'

type InsertMode = 'cmd' | 'write' | 'latex' | 'template' | 'func-slot'

export interface CellInsertHandle {
  insert: (snippet: string, mode?: InsertMode) => void
  focus: () => void
}

interface CellEditorProps {
  cell: NotebookCell
  isActive: boolean
  viewMode: 'wysiwyg' | 'latex'
  onActivate: () => void
  onChange: (cell: NotebookCell) => void
  onInsertHandle: (handle: CellInsertHandle) => void
  onAddCellBelow: () => void
  onDeleteCell: () => void
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
}

const MATRIX_ENVS = new Set(['matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix'])
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
  return `<span class="math-symbol" data-latex="${escapeAttr(command)}">${display}</span>`
}

function operatorNameHtml(command: '\\operatorname' | '\\operatorname*', body: string): string {
  const latex = `${command}{${body}}`
  return `<span class="math-symbol" data-latex="${escapeAttr(latex)}">${escapeHtml(body)}</span>`
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

function delimiterHtml(left: string, right: string, body = '', focusBody = false): string {
  return `<span class="math-delimiter" data-math="delimiter" data-left="${escapeAttr(left)}" data-right="${escapeAttr(right)}"><span class="math-delimiter-mark">${escapeHtml(left)}</span>${slotHtml('body', body, focusBody)}<span class="math-delimiter-mark">${escapeHtml(right)}</span></span>`
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
    html: delimiterHtml(COMMAND_DISPLAY[left.command] ?? left.command, COMMAND_DISPLAY[right.command] ?? right.command, renderLatexToHtml(source.slice(cursor, rightIndex))),
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

    const leftRight = renderLeftRight(source, index)
    if (leftRight) {
      html += leftRight.html
      index = leftRight.end
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

      const argument = VISUAL_FUNCTION_COMMANDS.has(command) ? readGroupAfterSpaces(source, end) : null
      if (argument) {
        html += commandHtml(command)
        html += slotHtml('function-arg', renderSlotLatex(argument.body))
        index = argument.end
        continue
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
    return `\\left${left}${serializeDirectSlot(node, 'body')}\\right${right}`
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
    return commandHtml(snippet)
  }

  if (snippet === '\\left|\\right|') return delimiterHtml('|', '|', '', true)
  if (snippet === '\\left(\\right)') return delimiterHtml('(', ')', '', true)
  if (snippet === '\\left[\\right]') return delimiterHtml('[', ']', '', true)

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
  const range = document.createRange()
  range.setStartBefore(node)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
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

function moveToAdjacentSlot(root: HTMLElement, reverse = false): boolean {
  const activeSlot = currentSlot(root)
  const activeMathElement = activeSlot ? owningMathElement(activeSlot) : null
  const slots = activeMathElement ? slotsOwnedByMathElement(activeMathElement) : Array.from(root.querySelectorAll<HTMLElement>('.math-slot'))
  if (slots.length === 0) return false

  const activeIndex = activeSlot ? slots.indexOf(activeSlot) : -1
  const nextIndex = reverse ? activeIndex - 1 : activeIndex + 1

  if (nextIndex < 0 || nextIndex >= slots.length) {
    if (activeMathElement) {
      if (reverse) {
        placeCaretBeforeNode(activeMathElement)
      } else {
        placeCaretAfterNode(activeMathElement)
      }
    } else {
      focusAtEnd(root)
    }
    return true
  }

  placeCaretInNode(slots[nextIndex])
  return true
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

function slotContentRect(slot: HTMLElement): DOMRect | null {
  if (!slot.textContent?.replace(/\u200b/g, '').trim() && slot.children.length === 0) return null

  const range = document.createRange()
  range.selectNodeContents(slot)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0)
  if (rects.length === 0) return null

  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

function rectsForNode(node: Node): DOMRect[] {
  if (node instanceof HTMLElement) return Array.from(node.getClientRects())
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.replace(/\u200b/g, '').trim()) return []

  const range = document.createRange()
  range.selectNodeContents(node)
  return Array.from(range.getClientRects())
}

function placeCaretForEditorPointer(
  root: HTMLElement,
  event: { clientX: number; clientY: number; target: EventTarget | null },
): boolean {
  if (event.target !== root) return false

  const rectEntries = Array.from(root.childNodes).flatMap((node) => rectsForNode(node).map((rect) => ({ node, rect })))
  if (rectEntries.length === 0) {
    root.focus()
    focusAtEnd(root)
    return true
  }

  const sameLineEntries = rectEntries.filter(({ rect }) => event.clientY >= rect.top - 6 && event.clientY <= rect.bottom + 6)
  const entries = (sameLineEntries.length ? sameLineEntries : rectEntries).sort((a, b) => a.rect.left - b.rect.left)
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
  event: { clientX: number; target: EventTarget | null },
): boolean {
  if (!(event.target instanceof HTMLElement)) return false

  const mathElement = event.target.closest<HTMLElement>('[data-math]')
  if (!mathElement || !root.contains(mathElement)) return false

  const mathRect = mathElement.getBoundingClientRect()
  if (event.clientX >= mathRect.right - 2) {
    root.focus()
    placeCaretAfterNode(mathElement)
    return true
  }

  const slot = event.target.closest<HTMLElement>('.math-slot')
  if (slot) {
    if (owningMathElement(slot) !== mathElement) return false

    const slots = slotsOwnedByMathElement(mathElement)
    const slotIndex = slots.indexOf(slot)
    const contentRect = slotContentRect(slot)
    const slotRect = slot.getBoundingClientRect()
    const clickIsNearSlotEnd = event.clientX >= slotRect.right - 2
    const clickIsAfterSlotContent = contentRect
      ? event.clientX >= Math.max(contentRect.right + 1, slotRect.left + slotRect.width * 0.58)
      : event.clientX >= slotRect.left + slotRect.width * 0.58

    if (slotIndex !== slots.length - 1 || (!clickIsNearSlotEnd && !clickIsAfterSlotContent)) return false
  }

  root.focus()
  placeCaretAfterNode(mathElement)
  return true
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
  event: { clientX: number; target: EventTarget | null },
): boolean {
  if (!(event.target instanceof HTMLElement)) return false

  const slot = event.target.closest<HTMLElement>('.math-slot')
  if (!slot || !root.contains(slot) || owningMathElement(slot)) return false

  const slotHasSavedContent = serializeChildren(slot).trim().length > 0
  const contentRect = slotHasSavedContent ? slotContentRect(slot) : null
  const slotRect = slot.getBoundingClientRect()
  const isFunctionArgSlotElement = slot.dataset.slot === 'function-arg'
  const clickIsNearSlotEnd = event.clientX >= slotRect.right - 2
  const clickIsAfterSlotContent = contentRect
    ? event.clientX >= Math.max(contentRect.right + 1, slotRect.left + slotRect.width * 0.58)
    : event.clientX >= slotRect.left + slotRect.width * (isFunctionArgSlotElement ? 0.42 : 0.58)

  if (!clickIsNearSlotEnd && !clickIsAfterSlotContent) return false

  root.focus()
  placeCaretAfterNodeBoundary(slot)
  return true
}

function normalizeSelectionForTyping(root: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !root.contains(selection.anchorNode)) return
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

export function CellEditor({
  cell,
  isActive,
  viewMode,
  onActivate,
  onChange,
  onInsertHandle,
  onAddCellBelow,
  onDeleteCell,
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
  const onAddCellBelowRef = useRef(onAddCellBelow)
  const onDeleteCellRef = useRef(onDeleteCell)
  const onFocusPreviousRef = useRef(onFocusPrevious)
  const onFocusNextRef = useRef(onFocusNext)
  const pointerStartRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const selectionPreviewFrameRef = useRef<number | null>(null)

  cellRef.current = cell
  onActivateRef.current = onActivate
  onChangeRef.current = onChange
  onInsertHandleRef.current = onInsertHandle
  onAddCellBelowRef.current = onAddCellBelow
  onDeleteCellRef.current = onDeleteCell
  onFocusPreviousRef.current = onFocusPrevious
  onFocusNextRef.current = onFocusNext

  const commitVisualEditor = useCallback(() => {
    const editor = visualEditorRef.current
    if (!editor) return
    const nextLatex = serializeEditor(editor)
    lastSyncedLatexRef.current = nextLatex
    onChangeRef.current({ ...cellRef.current, latex: nextLatex })
  }, [])

  const insertIntoLatexSource = useCallback((snippet: string, mode: InsertMode = 'write') => {
    const textarea = latexTextareaRef.current
    const latexSnippet = getLatexSourceSnippet(snippet, mode)
    const currentCell = cellRef.current
    const currentLatex = currentCell.latex || ''
    const start = textarea?.selectionStart ?? currentLatex.length
    const end = textarea?.selectionEnd ?? start
    const nextLatex = `${currentLatex.slice(0, start)}${latexSnippet}${currentLatex.slice(end)}`
    const nextCursor = start + latexSnippet.length

    lastSyncedLatexRef.current = nextLatex
    onChangeRef.current({ ...currentCell, latex: nextLatex })

    window.requestAnimationFrame(() => {
      latexTextareaRef.current?.focus()
      latexTextareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }, [])

  const insertIntoVisualEditor = useCallback((snippet: string, mode: InsertMode = 'write') => {
    const editor = visualEditorRef.current
    if (!editor) return

    onActivateRef.current()
    insertHtmlAtSelection(editor, htmlForSnippet(snippet, mode))
    commitVisualEditor()
  }, [commitVisualEditor])

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
        focus: () => latexTextareaRef.current?.focus(),
      })
      return
    }

    onInsertHandleRef.current({
      insert: insertIntoVisualEditor,
      focus: () => visualEditorRef.current?.focus(),
    })
  }, [insertIntoLatexSource, insertIntoVisualEditor, viewMode])

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
      visualEditorRef.current?.focus()
    }
    syncHandle()
  }, [isActive, syncHandle, viewMode])

  useEffect(() => {
    const editor = visualEditorRef.current
    if (!editor || viewMode !== 'wysiwyg') return

    const nextLatex = cell.latex || ''
    if (nextLatex === lastSyncedLatexRef.current) return

    editor.innerHTML = renderLatexToHtml(nextLatex)
    lastSyncedLatexRef.current = nextLatex
  }, [cell.latex, viewMode])

  useEffect(() => {
    const editor = visualEditorRef.current
    if (!editor || viewMode !== 'wysiwyg') return

    editor.innerHTML = renderLatexToHtml(cellRef.current.latex || '')
    lastSyncedLatexRef.current = cellRef.current.latex || ''
  }, [viewMode])

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      moveToAdjacentSlot(event.currentTarget, event.shiftKey)
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      normalizeSelectionAroundMathElements(event.currentTarget)
      const atomicDeleteResult = handleAtomicMathDelete(event.currentTarget, event.key === 'Backspace')
      if (atomicDeleteResult) {
        event.preventDefault()
        if (atomicDeleteResult === 'deleted') commitVisualEditor()
      } else if (caretIsAtProtectedSlotDeleteBoundary(event.currentTarget, event.key === 'Backspace')) {
        event.preventDefault()
      } else if (event.key === 'Backspace' && !serializeEditor(event.currentTarget).trim()) {
        onDeleteCellRef.current()
      }
    } else if (isTextInputKey(event)) {
      clearSelectedMathElements(event.currentTarget)
      normalizeSelectionForTyping(event.currentTarget)
    } else if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      onAddCellBelowRef.current()
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
          onChange={(event) => {
            lastSyncedLatexRef.current = event.target.value
            onChange({ ...cell, latex: event.target.value })
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
          onBeforeInput={(event) => normalizeSelectionForTyping(event.currentTarget)}
          onInput={commitVisualEditor}
          onKeyDown={handleEditorKeyDown}
          onKeyUp={(event) => normalizeSelectionAroundMathElements(event.currentTarget)}
          onSelect={(event) => scheduleSelectionPreview(event.currentTarget)}
          onPointerDown={(event) => {
            clearSelectedMathElements(event.currentTarget)
            if (placeCaretForStandaloneSlotPointer(event.currentTarget, event)) {
              event.preventDefault()
              pointerStartRef.current = null
              return
            }
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
                !placeCaretForMathPointer(editor, { clientX, target }) &&
                !placeCaretForCommandPointer(editor, { clientX, target }) &&
                !placeCaretForStandaloneSlotPointer(editor, { clientX, target })
              ) {
                placeCaretForEditorPointer(editor, { clientX, clientY, target })
              }
            })
          }}
          onPointerCancel={(event) => {
            pointerStartRef.current = null
            clearSelectedMathElements(event.currentTarget)
          }}
          onContextMenu={(event) => event.preventDefault()}
          onPaste={(event) => {
            event.preventDefault()
            insertPlainTextAtSelection(event.currentTarget, event.clipboardData.getData('text/plain'))
            commitVisualEditor()
          }}
        />
      )}
    </div>
  )
}

