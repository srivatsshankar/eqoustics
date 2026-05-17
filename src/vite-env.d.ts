/// <reference types="vite/client" />

import type {
	FileMenuAction,
	AppSettingsPayload,
	AppSettingsUpdatePayload,
	SpeechAudioChunkPayload,
	SpeechCommandAliasPayload,
	SpeechCommandInfo,
	SpeechModelStatusPayload,
	SpeechTranscriptResult,
	WindowControlAction,
	WindowStatePayload,
} from './shared/ipc/channels'
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
			captureHtml: (html: string) => Promise<void>
			writeClipboardText: (text: string) => Promise<void>
			writeClipboardImage?: (dataUrl: string) => void
			getSettings: () => Promise<AppSettingsPayload>
			updateSettings: (settings: AppSettingsUpdatePayload) => Promise<AppSettingsPayload>
			restartApp: () => Promise<void>
			getSpeechModelStatus: () => Promise<SpeechModelStatusPayload>
			loadSpeechModel: () => Promise<SpeechModelStatusPayload>
			listSpeechCommands: () => Promise<SpeechCommandInfo[]>
			addSpeechCommandAlias: (payload: SpeechCommandAliasPayload) => Promise<SpeechCommandInfo[]>
			deleteSpeechCommandAlias: (payload: SpeechCommandAliasPayload) => Promise<SpeechCommandInfo[]>
			transcribeSpeechChunk: (payload: SpeechAudioChunkPayload) => Promise<SpeechTranscriptResult>
			onSpeechModelStatusChange: (listener: (status: SpeechModelStatusPayload) => void) => () => void
			windowControl: (action: WindowControlAction) => Promise<void>
			getWindowState: () => Promise<WindowStatePayload>
			onWindowStateChange: (listener: (state: WindowStatePayload) => void) => () => void
		}
	}
}

export {}
