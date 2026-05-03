import { useCallback, useEffect, useRef } from 'react'

import type { NotebookCell } from '../../shared/types/notebook'

type InsertMode = 'cmd' | 'write' | 'latex' | 'template'

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
  '\\lambda': '&lambda;',
  '\\mu': '&mu;',
  '\\xi': '&xi;',
  '\\pi': '&pi;',
  '\\rho': '&rho;',
  '\\sigma': '&sigma;',
  '\\tau': '&tau;',
  '\\phi': '&phi;',
  '\\chi': '&chi;',
  '\\psi': '&psi;',
  '\\omega': '&omega;',
  '\\Gamma': '&Gamma;',
  '\\Delta': '&Delta;',
  '\\Theta': '&Theta;',
  '\\Lambda': '&Lambda;',
  '\\Pi': '&Pi;',
  '\\Sigma': '&Sigma;',
  '\\Phi': '&Phi;',
  '\\Psi': '&Psi;',
  '\\Omega': '&Omega;',
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
  return `<span class="math-sqrt" data-math="sqrt"><span class="math-sqrt-sign">&radic;</span>${slotHtml('radicand', body, focusBody)}</span>`
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
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
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
        const group = readGroup(source, end)
        if (group) {
          html += sqrtHtml(renderSlotLatex(group.body))
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

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMathText(node.textContent ?? '').replace(/\u200b/g, '')
  }

  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return ' '

  const symbolLatex = node.dataset.latex
  if (symbolLatex) return `${symbolLatex} `

  const mathKind = node.dataset.math
  if (mathKind === 'frac') {
    const numerator = serializeDirectSlot(node, 'numerator') || ' '
    const denominator = serializeDirectSlot(node, 'denominator') || ' '
    return `\\frac{${numerator}}{${denominator}}`
  }

  if (mathKind === 'sqrt') {
    return `\\sqrt{${serializeDirectSlot(node, 'radicand') || ' '}}`
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
  if (mode === 'latex' || mode === 'write') return snippet

  const templates: Record<string, string> = {
    '^': '^{ }',
    '_': '_{ }',
    '\\frac': '\\frac{ }{ }',
    '\\sqrt': '\\sqrt{ }',
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
  if (mode === 'cmd') {
    if (snippet === '^') return scriptTemplateHtml('sup')
    if (snippet === '_') return scriptTemplateHtml('sub')
    if (snippet === '\\frac') return fractionHtml('', '', true)
    if (snippet === '\\sqrt') return sqrtHtml('', true)
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
  if (!activeSlot || !activeMathElement) return false

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

  const slot = event.target.closest<HTMLElement>('.math-slot')
  if (slot) {
    if (owningMathElement(slot) !== mathElement) return false

    const slots = slotsOwnedByMathElement(mathElement)
    const slotIndex = slots.indexOf(slot)
    const contentRect = slotContentRect(slot)
    const slotRect = slot.getBoundingClientRect()
    const clickIsAfterSlotContent = contentRect
      ? event.clientX > contentRect.right + 4
      : event.clientX > slotRect.left + slotRect.width * 0.68

    if (slotIndex !== slots.length - 1 || !clickIsAfterSlotContent) return false
  }

  root.focus()
  placeCaretAfterNode(mathElement)
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
    } else if (isTextInputKey(event)) {
      normalizeSelectionForTyping(event.currentTarget)
    } else if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      onAddCellBelowRef.current()
    } else if (event.key === 'Backspace' && !serializeEditor(event.currentTarget).trim()) {
      onDeleteCellRef.current()
    } else if (event.key === 'ArrowRight' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (moveOutOfMathElement(event.currentTarget)) event.preventDefault()
    } else if (event.key === 'ArrowLeft' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
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
          onBeforeInput={(event) => normalizeSelectionForTyping(event.currentTarget)}
          onInput={commitVisualEditor}
          onKeyDown={handleEditorKeyDown}
          onPointerDown={(event) => {
            if (placeCaretForMathPointer(event.currentTarget, event) || placeCaretForEditorPointer(event.currentTarget, event)) {
              event.preventDefault()
            }
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
