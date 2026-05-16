# Eqoustics

A Notion-style WYSIWYG math notebook editor with speech-to-LaTeX dictation. Write math the way you speak it.

---

## Features

### Math Editor

- **Live WYSIWYG rendering** — math is rendered in real time; content is saved as portable `.tex` files in the background
- **Row-based document model** — each document is a list of cells (rows), each containing one line of LaTeX; designed for the same ease-of-use feel as Notion
- **Rich toolbar** — insert fractions, matrices, symbols, and other math constructs with a click; all objects behave as atomic units for consistent selection and deletion
- **Raw LaTeX mode** — toggle any row between WYSIWYG and raw LaTeX editing
- **Undo/redo** — 100-entry history with smart grouping (typing bursts within 1.2 s are collapsed; word boundaries force a new entry)
- **Auto-save** — debounced 1.2 s save after any change when a file is open

### Speech Recognition

- **Hands-free math input** — dictate mathematical expressions naturally; Gemma 4 transcribes speech to LaTeX and inserts it into the active editor row
- **Floating microphone widget** — a small, repositionable panel for toggling the mic on/off
- **Context-aware editing** — Gemma 4 receives the current row's content so spoken corrections update existing text, not just append new text
- **Voice commands** — control the editor without touching the keyboard: `new line`, `go to line N`, and more

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron |
| UI | React + TypeScript |
| Math rendering | 
| Speech model | `google/gemma-4-E4B-it` (multimodal) |
| File format | LaTeX (`.tex`) |
| Build | Vite + electron-builder |

---

## Getting Started

```bash
npm install
npm run dev          # start in development mode (hot reload)
npm run build        # build for production
npm run dist         # package into a distributable
```

---

## Project Structure

```
eqoustics/
├── electron/                  # Main process
│   ├── main.ts                # App entry, window creation, menu
│   ├── preload.ts             # IPC bridge (window.eqoustics API)
│   └── ipc/                   # File and speech IPC handlers
│
├── src/                       # Renderer process (React)
│   ├── App.tsx                # Document state, history, auto-save
│   ├── components/
│   │   ├── notebook/          # Cell list, drag-to-reorder
│   │   ├── cell/              # Per-row WYSIWYG + raw LaTeX editor
│   │   ├── toolbar/           # Symbol/formatting toolbar
│   │   └── speech/            # Microphone widget and speech UI
│   ├── serialization/         # .tex parser and serializer
│   └── shared/                # Types, IPC channels, previews
│
└── instructions/              # Project and coding guidelines
```

---

## License

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
