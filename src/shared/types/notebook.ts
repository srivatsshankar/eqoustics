export type NotebookCellKind = 'rich-text' | 'math'

export interface NotebookCellBase {
  id: string
  kind: NotebookCellKind
}

export interface RichTextNotebookCell extends NotebookCellBase {
  kind: 'rich-text'
  lexicalState: string
}

export interface MathNotebookCell extends NotebookCellBase {
  kind: 'math'
  latex: string
  displayMode: boolean
}

export type NotebookCell = RichTextNotebookCell | MathNotebookCell

export interface NotebookMetadata {
  title: string
  createdAt: string
  updatedAt: string
}

export interface NotebookDocument {
  metadata: NotebookMetadata
  cells: NotebookCell[]
}

export interface StoredNotebookFile {
  path: string
  content: string
}

export interface RecentFileEntry {
  path: string
  title: string
  lastOpenedAt: string
}

export const EQOUSTICS_FILE_EXTENSION = 'tex'

type RichTextBlockType = 'paragraph' | 'h1' | 'h2'

function createRichTextBlockNode(text: string, blockType: RichTextBlockType) {
  const children = text
    ? [
        {
          detail: 0,
          format: 0,
          mode: 'normal',
          style: '',
          text,
          type: 'text',
          version: 1,
        },
      ]
    : []

  if (blockType === 'paragraph') {
    return {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'paragraph',
      version: 1,
    }
  }

  return {
    children,
    direction: null,
    format: '',
    indent: 0,
    tag: blockType,
    type: 'heading',
    version: 1,
  }
}

export function createRichTextLexicalStateFromText(text = '', blockType: RichTextBlockType = 'paragraph'): string {
  return JSON.stringify({
    root: {
      children: [createRichTextBlockNode(text, blockType)],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  })
}

export function createEmptyRichTextLexicalState(): string {
  return createRichTextLexicalStateFromText()
}

export function createRichTextNotebookCell(text = '', blockType: RichTextBlockType = 'paragraph'): RichTextNotebookCell {
  return {
    id: crypto.randomUUID(),
    kind: 'rich-text',
    lexicalState: createRichTextLexicalStateFromText(text, blockType),
  }
}

export function createMathNotebookCell(latex = '\\frac{a}{b}'): MathNotebookCell {
  return {
    id: crypto.randomUUID(),
    kind: 'math',
    latex,
    displayMode: true,
  }
}

export function createEmptyNotebookDocument(): NotebookDocument {
  const timestamp = new Date().toISOString()

  return {
    metadata: {
      title: 'Untitled Notebook',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    cells: [createRichTextNotebookCell()],
  }
}