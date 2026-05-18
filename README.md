# Eqoustics

A WYSIWYG math notebook editor with speech-to-LaTeX dictation. Write math the way you speak it.

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
| Math rendering | Custom |
| Speech model | `google/gemma-4-E2B-it` & `google/gemma-4-E4B-it` (multimodal) |
| File format | LaTeX (`.tex`) |
| Build | Vite + electron-builder |

---

## Getting Started

### Quick Demo and Manual

For a fast first run, use the bundled sample notebook and manual:

- **Demo notebook:** [demo/Demo Notebook.tex](demo/Demo%20Notebook.tex)
- **User manual:** [manual/Eqoustics Manual.pdf](manual/Eqoustics%20Manual.pdf)

After launching Eqoustics, open the demo notebook to see a ready-made document with example math content. Use the manual alongside it for a walkthrough of the editor, toolbar, file workflow, and speech controls.

### Option 1: Run the Windows Portable App

The easiest way to test Eqoustics is to run the Windows portable executable from the beta release folder:

```text
release/beta/0.0.0-beta.0/Eqoustics-Beta-Windows-Portable-0.0.0-beta.0.exe
```

The portable launcher is silent. On first launch it caches the bundled app files in the Windows temp directory, then later launches reuse that cache and open directly from the same single executable.

### Option 2: Install Dependencies and Run Development Mode

Use this path if you want to run from source with hot reloading.

On Windows:

```bat
run-dev-install.bat
run-dev.bat
```

On macOS or Linux:

```bash
sh run-dev-install.sh
sh run-dev.sh
```

The `sh ...` form does not require executable permissions. If you prefer to run the scripts directly, run this once first:

```bash
chmod +x run-dev-install.sh run-dev.sh
./run-dev-install.sh
./run-dev.sh
```

The install scripts install the required Node packages and create a local `.eqoustics-python` virtual environment for the LiteRT speech dependency. Development setup skips the portable Python packaging step so hot-reload testing does not rebuild the executable runtime.

### Build a Windows Beta Release

Install dependencies before building. On Windows, either run the install script first:

```bat
run-dev-install.bat
npm run build:win
```

or use the build helper, which runs `npm install` before building:

```bat
build-all.bat
```

If dependencies are already installed, you can build directly:

```bash
npm run build:win
```

The Windows build command prepares a LiteRT-only Python runtime before packaging. It creates a self-contained `.eqoustics-python-portable` runtime from the embeddable Windows Python package and embeds it in the portable executable as `python-venv`, so external users can run Eqoustics without installing Python or speech packages. The portable executable uses a silent cache-aware launcher, so users see the app open directly instead of an extraction window remaining behind it. The build prints periodic `Still packaging...` messages while the executable is being assembled.

Build artifacts are written to:

```text
release/beta/<version>/
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
├── demo/                      # Sample notebook for trying the app quickly
├── manual/                    # User manual
└── instructions/              # Project and coding guidelines
```

---

## License

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
