# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

Always use git worktrees for any code changes. Use the Agent tool with `isolation: "worktree"` when delegating work, then merge the resulting branch back into main.

## Commands

```bash
npm start        # Run the app
npm run dev      # Run with auto-restart on file changes (uses nodemon)
```

## Architecture

This is an Electron app with the standard two-process model:

- **Main process** (`main/`) — Node.js, handles file I/O and native OS dialogs
- **Renderer process** (`renderer/`) — Chromium UI, no direct Node access
- **Preload** (`preload/preload.js`) — secure bridge between the two via `contextBridge`

The renderer communicates with the main process exclusively through `window.checklistAPI`, which is defined in `preload.js` and backed by `ipcMain.handle` registrations in `main/ipc-handlers.js`.

### Data flow

1. Checklists are stored as `.md` files in a user-chosen folder (default `~/Documents/Checklists`)
2. The folder path is persisted in `settings.json` in Electron's `userData` directory
3. Each file uses GFM task list syntax with inline HTML comments for item IDs:
   ```
   # Title
   - [ ] Item text <!-- id:a3f2b1c0 -->
   - [x] Done item <!-- id:d4e5f6a7 -->
   ```
4. `renderer/parser.js` converts between this markdown format and `{ title, items[] }` objects
5. The editor auto-saves 300ms after any change

### Renderer modules

The renderer uses plain globals (no bundler, no ES module imports). Script load order in `index.html` matters:

1. `parser.js` — pure functions `parse(markdown)` and `serialize(title, items)`, available as globals
2. `sidebar.js` — IIFE exposing `Sidebar` global; manages the checklist list panel
3. `editor.js` — IIFE exposing `Editor` global; manages the editing panel
4. `app.js` — entry point, calls `Sidebar.load(dataDir)` on startup

Sidebar and editor communicate via a `checklist-selected` CustomEvent dispatched on `window`.

### Key constraint

`prompt()` and `confirm()` are disabled in Electron's renderer. Use `window.checklistAPI.showConfirm()` for confirmation dialogs (backed by `dialog.showMessageBoxSync` in the main process). For text input from the user, inject an inline input element into the DOM.
