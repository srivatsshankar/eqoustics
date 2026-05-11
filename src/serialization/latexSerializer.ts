import type { NotebookCell, NotebookDocument } from '../shared/types/notebook'

const EQOUSTICS_VERSION = '2'

function shouldSerializeAsTextMode(latex: string): boolean {
  return /^(\\section|\\subsection|\\subsubsection|\\paragraph)\s*\{/.test(latex)
    || /^\\begin\{(?:itemize|enumerate)\}/.test(latex)
}

function serializeCell(cell: NotebookCell): string {
  const latex = (cell.latex || '').replace(/\s*\n\s*/g, ' ').trim()
  if (shouldSerializeAsTextMode(latex)) {
    return `% @cell ${cell.id}\n${latex}`
  }

  return `% @cell ${cell.id}\n$$${latex}$$`
}

export function serializeNotebookToLatex(document: NotebookDocument): string {
  const header = [
    `%! eqoustics-notebook: version=${EQOUSTICS_VERSION}`,
    `%! title=${document.metadata.title}`,
    `%! createdAt=${document.metadata.createdAt}`,
    `%! updatedAt=${document.metadata.updatedAt}`,
  ]

  const cells = document.cells.map(serializeCell).join('\n')

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
