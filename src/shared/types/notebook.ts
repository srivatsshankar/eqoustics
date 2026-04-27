export interface NotebookCell {
  id: string
  latex: string
}

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

export function createNotebookCell(latex = ''): NotebookCell {
  return {
    id: crypto.randomUUID(),
    latex,
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
    cells: [createNotebookCell()],
  }
}