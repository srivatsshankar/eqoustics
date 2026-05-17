import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const toolbarPath = path.join(root, 'src/components/toolbar/EditorToolbar.tsx')
const matrixPath = path.join(root, 'src/components/toolbar/MatrixDropdown.tsx')
const casesPath = path.join(root, 'src/components/toolbar/CasesDropdown.tsx')
const previewsPath = path.join(root, 'src/shared/latexCommandPreviews.ts')
const helpPath = path.join(root, 'src/help/eqoustics-help.md')

const toolbarSource = fs.readFileSync(toolbarPath, 'utf8')
const matrixSource = fs.readFileSync(matrixPath, 'utf8')
const casesSource = fs.readFileSync(casesPath, 'utf8')
const previewsSource = fs.readFileSync(previewsPath, 'utf8')

const SLOT = '□'
const SECTION_HEADING = '## Mathematical notation reference'

function decodeStringLiteral(literal) {
  return Function(`"use strict"; return (${literal});`)()
}

function stringLiterals(source) {
  const matches = source.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g) ?? []
  return matches.map(decodeStringLiteral)
}

function previewMap() {
  const entries = new Map()
  for (const match of previewsSource.matchAll(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)) {
    entries.set(decodeStringLiteral(match[1]), decodeStringLiteral(match[2]))
  }
  return entries
}

const previews = previewMap()

function balancedBlock(source, startIndex, open = '[', close = ']') {
  const openIndex = source.indexOf(open, startIndex)
  if (openIndex < 0) return ''

  let depth = 0
  let quote = null
  let escaped = false
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '\'' || char === '"') {
      quote = char
      continue
    }
    if (char === open) depth += 1
    if (char === close) depth -= 1
    if (depth === 0) return source.slice(openIndex + 1, index)
  }

  return ''
}

function constArray(name, source = toolbarSource) {
  const match = new RegExp(`const\\s+${name}\\b`).exec(source)
  if (!match) return []
  const valueStart = source.indexOf('=', match.index)
  return stringLiterals(balancedBlock(source, valueStart))
}

function constObjectArray(name, source = toolbarSource) {
  const match = new RegExp(`const\\s+${name}\\b`).exec(source)
  if (!match) return []
  const valueStart = source.indexOf('=', match.index)
  return parseItemsFromBlock(balancedBlock(source, valueStart))
}

function groupBlock(label) {
  const labelMatch = new RegExp(`label:\\s*['"]${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).exec(toolbarSource)
  if (!labelMatch) return ''
  const itemsIndex = toolbarSource.indexOf('items:', labelMatch.index)
  return balancedBlock(toolbarSource, itemsIndex)
}

function arrayValuesFromCommandItems(block) {
  const values = []
  for (const match of block.matchAll(/commandItems\(([^)]*)\)/g)) {
    const argument = match[1].trim()
    if (argument.startsWith('[')) {
      values.push(...stringLiterals(balancedBlock(argument, 0)))
    } else if (/^[A-Z0-9_]+$/.test(argument)) {
      values.push(...constArray(argument))
    }
  }
  return values
}

function objectItemsFromLines(block) {
  const items = []
  for (const line of block.split('\n')) {
    if (!line.includes('value:')) continue
    const valueMatch = /value:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/.exec(line)
    if (!valueMatch) continue
    const titleMatch = /title:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/.exec(line)
    const displayMatch = /display:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/.exec(line)
    items.push({
      value: decodeStringLiteral(valueMatch[1]),
      title: titleMatch ? decodeStringLiteral(titleMatch[1]) : null,
      display: displayMatch ? decodeStringLiteral(displayMatch[1]) : null,
    })
  }
  return items
}

function latexSlotItemsFromLines(block) {
  const items = []
  for (const line of block.split('\n')) {
    if (!line.includes('latexSlotItem(')) continue
    const literals = stringLiterals(line)
    const latexLiterals = literals.filter((literal) => literal.startsWith('\\'))
    if (latexLiterals.length === 0) continue

    const last = latexLiterals[latexLiterals.length - 1]
    const previous = latexLiterals[latexLiterals.length - 2]
    const value = previous && (previous.includes('#?') || previous.includes('{ }') || previous.length > last.length)
      ? previous
      : last
    const title = value === previous ? last : null
    items.push({ value, title, display: null })
  }
  return items
}

function parseItemsFromBlock(block) {
  const items = [
    ...objectItemsFromLines(block),
    ...latexSlotItemsFromLines(block),
    ...arrayValuesFromCommandItems(block).map((value) => ({ value, title: null, display: null })),
  ]
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.value}|${item.title ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function groupItems(label) {
  return parseItemsFromBlock(groupBlock(label))
}

function fallbackName(value) {
  return value
    .replace(/^\{#\?\}\s*/, '')
    .replace(/^\\+/, '')
    .replace(/\{#\?\}/g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/[{}_^*\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || value
}

function cleanTitle(title, value) {
  return (title ?? fallbackName(value))
    .replace(/\s*\([^)]*\\[^)]*\)\s*$/, '')
    .replace(/\s*\(\\[^)]*\)\s*$/, '')
    .replace(/\\+/g, '')
    .trim()
}

function notationFor(value, display = null) {
  if (display && !display.startsWith('\\')) return display
  if (previews.has(value)) return previews.get(value)
  if (/^\\operatorname\*?\{([^}]+)\}$/.test(value)) return value.match(/^\\operatorname\*?\{([^}]+)\}$/)[1]
  if (/^\\operatornamewithlimits\{([^}]+)\}$/.test(value)) return `${value.match(/^\\operatornamewithlimits\{([^}]+)\}$/)[1]} limits`

  const replacements = [
    [/^\\frac\{#\?\}\{#\?\}$/, `${SLOT}/${SLOT}`],
    [/^\\tfrac\{#\?\}\{#\?\}$/, `${SLOT}/${SLOT}`],
    [/^\\dfrac\{#\?\}\{#\?\}$/, `${SLOT}/${SLOT}`],
    [/^\\binom\{#\?\}\{#\?\}$/, `(${SLOT} over ${SLOT})`],
    [/^\\sqrt$/, `√${SLOT}`],
    [/^\\sqrt\[\]$/, `ⁿ√${SLOT}`],
    [/^\^$/, `x^${SLOT}`],
    [/^_$/, `x_${SLOT}`],
    [/^\\underset$/, `${SLOT} under x`],
    [/^\\overset$/, `${SLOT} over x`],
    [/^\\bothset$/, `${SLOT} over and under x`],
    [/^\\boxed\{#\?\}$/, `boxed ${SLOT}`],
    [/^\\stackrel\{#\?\}\{#\?\}$/, `${SLOT} over ${SLOT}`],
    [/^\\phantom\{#\?\}$/, `phantom ${SLOT}`],
    [/^\\hphantom\{#\?\}$/, `horizontal phantom ${SLOT}`],
    [/^\\vphantom\{#\?\}$/, `vertical phantom ${SLOT}`],
    [/^\\hspace\{#\?\}$/, `horizontal space ${SLOT}`],
    [/^\\hspace\*\{#\?\}$/, `horizontal space* ${SLOT}`],
    [/^\\x(.+)\{#\?\}$/, `${fallbackName(value)} ${SLOT}`],
  ]
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(value)) return replacement
  }

  const accentMatch = value.match(/^\\([A-Za-z]+|['`^~=u.rHv"])\{(?:#\?|\s*)\}$/)
  if (accentMatch) return `${fallbackName(`\\${accentMatch[1]}`)} ${SLOT}`

  const leftRight = value
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\{#\?\}/g, SLOT)
    .replace(/\\lbrace/g, '{')
    .replace(/\\rbrace/g, '}')
    .replace(/\\langle/g, '⟨')
    .replace(/\\rangle/g, '⟩')
    .replace(/\\lvert|\\rvert/g, '|')
    .replace(/\\lVert|\\rVert/g, '‖')
    .replace(/\\lceil/g, '⌈')
    .replace(/\\rceil/g, '⌉')
    .replace(/\\lfloor/g, '⌊')
    .replace(/\\rfloor/g, '⌋')
    .replace(/\\llbracket/g, '⟦')
    .replace(/\\rrbracket/g, '⟧')
  if (leftRight !== value && !leftRight.includes('\\')) return leftRight

  return value
}

function latexFor(value) {
  return value
    .replaceAll('{#?}', '{□}')
    .replaceAll('#?', '□')
}

function md(value) {
  return String(value)
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
}

const rows = []
function add(menu, item) {
  rows.push({
    notation: notationFor(item.value, item.display),
    name: cleanTitle(item.title, item.value),
    latex: latexFor(item.value),
    menu,
  })
}

function addValue(menu, value, title = null, display = null) {
  add(menu, { value, title, display })
}

function addItems(menu, items) {
  for (const item of items) add(menu, item)
}

addValue('Quick notation', '\\frac{#?}{#?}', 'Fraction')
addValue('Quick notation', '\\sqrt', 'Square root')
addValue('Quick notation', '\\sqrt[]', 'Indexed root')
addValue('Quick notation', '^', 'Power / exponent')
addValue('Quick notation', '_', 'Subscript')
addValue('Quick notation', '\\underset', 'Lower bound')
addValue('Quick notation', '\\overset', 'Upper bound')
addValue('Quick notation', '\\bothset', 'Lower and upper bounds')
addValue('Quick notation', '\\left\\lvert{#?}\\right\\rvert', 'Absolute value')
addValue('Quick notation', '\\left({#?}\\right)', 'Parentheses')
addValue('Quick notation', '\\left[{#?}\\right]', 'Brackets')
addValue('Quick notation', '\\left\\lbrace{#?}\\right\\rbrace', 'Curly braces')

addItems('Arithmetic', groupItems('Arithmetic'))
addItems('Calculus', groupItems('Calculus'))

function parseOptionObjects(source, name) {
  const match = new RegExp(`const\\s+${name}\\b`).exec(source)
  if (!match) return []
  const valueStart = source.indexOf('=', match.index)
  const block = balancedBlock(source, valueStart)
  return block.split('\n').filter((line) => line.includes('{') && line.includes('}')).map((line) => {
    const fields = {}
    for (const field of ['label', 'env', 'left', 'right', 'leftCommand', 'rightCommand', 'description']) {
      const fieldMatch = new RegExp(`${field}:\\s*('(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*")`).exec(line)
      if (fieldMatch) fields[field] = decodeStringLiteral(fieldMatch[1])
    }
    return fields
  }).filter((fields) => Object.keys(fields).length > 0)
}

for (const option of parseOptionObjects(matrixSource, 'MATRIX_ENVIRONMENTS')) {
  if (!option.label) continue
  const value = option.env === 'array'
    ? '\\begin{array}{ccc} □ & □ \\\\ □ & □ \\end{array}'
    : `\\begin{${option.env}} □ & □ \\\\ □ & □ \\end{${option.env}}`
  rows.push({ notation: option.label, name: option.description ?? option.label, latex: value, menu: 'Matrix environments' })
}
for (const option of parseOptionObjects(matrixSource, 'MATRIX_DELIMITERS')) {
  if (!option.label) continue
  const latex = option.left || option.right ? `\\left${option.left} ... \\right${option.right}` : 'no delimiter'
  rows.push({ notation: option.label, name: `Matrix delimiter: ${option.label}`, latex, menu: 'Matrix delimiters' })
}
for (const option of parseOptionObjects(matrixSource, 'DELIMITER_SIZES')) {
  if (!option.label) continue
  rows.push({ notation: option.label, name: `Matrix delimiter size: ${option.label}`, latex: `${option.leftCommand} ... ${option.rightCommand}`, menu: 'Matrix delimiter sizes' })
}
for (const option of parseOptionObjects(casesSource, 'CASE_ENVIRONMENTS')) {
  if (!option.label) continue
  rows.push({
    notation: option.label,
    name: option.description ?? option.label,
    latex: `\\begin{${option.env}} □ & \\text{if } □ \\\\ □ & \\text{if } □ \\end{${option.env}}`,
    menu: 'Cases',
  })
}

addItems('Greek', groupItems('Greek'))
addItems('Accents', groupItems('Accents'))

for (const option of parseOptionObjects(toolbarSource, 'DELIMITER_PAIR_OPTIONS')) {
  if (!option.label) continue
  addValue('Delimiters', `\\Bigl${option.left}{#?}\\Bigr${option.right}`, option.label)
}
for (const option of parseOptionObjects(toolbarSource, 'DELIMITER_SIZE_PRESETS')) {
  if (!option.label) continue
  rows.push({ notation: option.label, name: `Delimiter size: ${option.label}`, latex: `${option.left} ... ${option.right}`, menu: 'Delimiters' })
}
addValue('Delimiters', '\\backslash', 'Backslash')

addItems('Operators', [...constArray('OPERATORS_COMMON_VALUES').map((value) => ({ value })), ...constObjectArray('OPERATORS_MISC_ITEMS')])
addItems('Fractions', groupItems('Fractions'))
addItems('Relations', [
  ...constObjectArray('RELATIONS_COMMON_ITEMS'),
  ...constArray('RELATIONS_OTHER_VALUES').map((value) => ({ value })),
  ...constArray('RELATIONS_NEGATED_VALUES').map((value) => ({ value })),
])
addItems('Sets and Logic', groupItems('Sets & Logic'))
addItems('Arrows', [
  ...constObjectArray('ARROWS_COMMON_ITEMS'),
  ...constArray('ARROWS_MORE_VALUES').map((value) => ({ value })),
  ...latexSlotItemsFromLines(balancedBlock(toolbarSource, toolbarSource.indexOf('const ARROWS_EXTENSIBLE_ITEMS'))),
])
addItems('Notation', groupItems('Notation'))
addItems('Layout', groupItems('Layout'))
addItems('Symbols', groupItems('Symbols'))
addItems('Functions', groupItems('Functions'))

const tableRows = rows.map((row) =>
  `| ${md(row.notation)} | ${md(row.name)} | \`${md(row.latex)}\` | ${md(row.menu)} |`
)

const generatedSection = `${SECTION_HEADING}

This table is generated from the toolbar source by \`scripts/update-help-notation-table.mjs\`. Run it after changing toolbar notation definitions.

| Notation as shown | Called | LaTeX inserted | Menu |
| --- | --- | --- | --- |
${tableRows.join('\n')}
`

const helpMarkdown = fs.readFileSync(helpPath, 'utf8')
const sectionIndex = helpMarkdown.indexOf(SECTION_HEADING)
const nextHelpMarkdown = sectionIndex >= 0
  ? `${helpMarkdown.slice(0, sectionIndex)}${generatedSection}`
  : `${helpMarkdown.trimEnd()}\n\n${generatedSection}`

fs.writeFileSync(helpPath, nextHelpMarkdown)
console.log(`Updated ${path.relative(root, helpPath)} with ${rows.length} notation rows.`)
