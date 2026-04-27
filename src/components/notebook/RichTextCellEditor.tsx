import { useMemo, useState } from 'react'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import type { EditorState, LexicalEditor } from 'lexical'

import type { RichTextNotebookCell } from '../../shared/types/notebook'

interface RichTextCellEditorProps {
  cell: RichTextNotebookCell
  documentRevision: number
  onChange: (nextState: string) => void
  onActivateEditor: (editor: LexicalEditor) => void
}

function EditorLifecyclePlugin({
  onReady,
}: {
  onReady: (editor: LexicalEditor) => void
}) {
  const [editor] = useLexicalComposerContext()

  useState(() => {
    onReady(editor)
  })

  return null
}

const editorTheme = {
  heading: {
    h1: 'rich-text-heading rich-text-heading-1',
    h2: 'rich-text-heading rich-text-heading-2',
    h3: 'rich-text-heading rich-text-heading-3',
  },
  list: {
    listitem: 'rich-text-list-item',
    nested: {
      listitem: 'rich-text-list-item',
    },
    ol: 'rich-text-list rich-text-list-ordered',
    ul: 'rich-text-list rich-text-list-unordered',
  },
  paragraph: 'rich-text-paragraph',
  quote: 'rich-text-quote',
  text: {
    bold: 'rich-text-bold',
    code: 'rich-text-code',
    italic: 'rich-text-italic',
    strikethrough: 'rich-text-strikethrough',
    underline: 'rich-text-underline',
  },
}

export function RichTextCellEditor({ cell, documentRevision, onChange, onActivateEditor }: RichTextCellEditorProps) {
  const [editor, setEditor] = useState<LexicalEditor | null>(null)
  const initialConfig = useMemo(
    () => ({
      editorState: cell.lexicalState,
      namespace: `eqoustics-cell-${cell.id}-${documentRevision}`,
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
      onError: (error: Error) => {
        throw error
      },
      theme: editorTheme,
    }),
    [cell.id, cell.lexicalState, documentRevision],
  )

  return (
    <div
      className="rich-text-cell-editor"
      onPointerDown={() => {
        if (editor) {
          onActivateEditor(editor)
        }
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <EditorLifecyclePlugin
          onReady={(nextEditor) => {
            setEditor(nextEditor)
          }}
        />
        <RichTextPlugin
          contentEditable={<ContentEditable className="rich-text-editable" />}
          placeholder={<div className="rich-text-placeholder">Write an explanation, derivation, or proof.</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <OnChangePlugin
          ignoreHistoryMergeTagChange
          onChange={(editorState: EditorState) => {
            onChange(JSON.stringify(editorState.toJSON()))
          }}
        />
      </LexicalComposer>
    </div>
  )
}