/// <reference types="vite/client" />

import type { FileMenuAction, WindowControlAction, WindowStatePayload } from './shared/ipc/channels'
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
			windowControl: (action: WindowControlAction) => Promise<void>
			getWindowState: () => Promise<WindowStatePayload>
			onWindowStateChange: (listener: (state: WindowStatePayload) => void) => () => void
		}
	}
}

export {}
