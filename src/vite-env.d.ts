/// <reference types="vite/client" />

import type * as React from 'react'

import type { FileMenuAction } from './shared/ipc/channels'
import type { NotebookDocument, RecentFileEntry, StoredNotebookFile } from './shared/types/notebook'

declare global {
	interface Window {
		eqoustics: {
			createNotebook: () => Promise<NotebookDocument>
			onMenuAction: (listener: (action: FileMenuAction) => void) => () => void
			openNotebook: () => Promise<StoredNotebookFile | null>
			openNotebookAtPath: (filePath: string) => Promise<StoredNotebookFile>
			exportNotebookPdf: (payload: { title: string; html: string }) => Promise<{ path: string } | null>
			saveNotebook: (file: StoredNotebookFile & { title: string }) => Promise<{ path: string }>
			saveNotebookAs: (file: { title: string; content: string }) => Promise<{ path: string } | null>
			listRecentFiles: () => Promise<RecentFileEntry[]>
		}
		mathVirtualKeyboard?: {
			show: () => void
			hide: () => void
		}
	}

	namespace JSX {
		interface IntrinsicElements {
			'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
				children?: React.ReactNode
			}
		}
	}
}

export {}
