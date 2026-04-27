import type { NotebookDocument } from '../shared/types/notebook'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render the notebook as a self-contained HTML document for print/PDF export.
 *
 * Each cell's LaTeX is rendered client-side by embedding the KaTeX auto-render
 * script from a CDN.  This avoids needing `katex` as a build dependency.
 */
export function renderPrintableNotebook(document: NotebookDocument): string {
  const content = document.cells
    .map((cell) => {
      if (!cell.latex.trim()) return '' // skip empty cells
      // Wrap in $$ for display-mode rendering by KaTeX auto-render
      return `<section class="print-cell">$$${escapeHtml(cell.latex)}$$</section>`
    })
    .filter(Boolean)
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.metadata.title)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"
            onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]})"></script>
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
        margin-bottom: 8px;
        padding: 8px 16px;
        break-inside: avoid;
        font-size: 1.1rem;
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