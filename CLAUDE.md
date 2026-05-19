# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # Run with auto-restart on file changes (uses nodemon)
npm start        # Single launch, no auto-restart
```

## Generating the app icon

Before building for the first time (or after editing the icon), generate platform icon formats from the source SVG:

```bash
npm run icons    # converts build/icon.svg to platform icon formats
```

## Building a standalone app

The icons must be generated before running a build.

```bash
npm run dist:win    # Windows: NSIS installer + portable EXE → dist/
npm run dist:mac    # macOS: DMG → dist/
npm run dist:linux  # Linux: AppImage + .deb → dist/
npm run dist        # all platforms
```

Output lands in `dist/`.

## Architecture

This is an Electron app with the standard two-process model:

- **Main process** (`main/`) — Node.js, handles file I/O and native OS dialogs
- **Renderer process** (`renderer/`) — Chromium UI, no direct Node access
- **Preload** (`preload/preload.js`) — secure bridge between the two via `contextBridge`

The renderer communicates with the main process exclusively through `window.checklistAPI`, which is defined in `preload.js` and backed by `ipcMain.handle` registrations in `main/ipc-handlers.js`.

### Data flow

1. Checklists are stored as `.md` files in a user-chosen folder (default `~/Documents/Punchcard`)
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

### Due dates

Items can have a due date stored as an ISO-8601 date string (e.g., `2026-03-24`) anywhere in `item.text`. Key details:

- `extractDueDate(text)` and `stripDueDate(text)` in `parser.js` are the canonical helpers for reading/removing the date
- `renderItemText()` in `editor.js` calls `stripDueDate` before rendering, so the date doesn't appear in the contenteditable span — it's shown as a separate badge instead
- The date is appended to `item.text` (not a separate field) and round-trips transparently through `parse`/`serialize`
- The calendar button uses `<input type="date">` with `showPicker()` (Chromium-only API) to open the native date picker without showing the input element

### Collapsible items (and sections)

Both section headers and items can be collapsed to hide their children:

- **Sections** track collapse via `localStorage` key `sec-collapsed:<id>`; the render loop (`editor.js`) uses `collapsedLevel` to skip everything under a collapsed section
- **Items** with sub-items (any next-item at a deeper indent) use `localStorage` key `item-collapsed:<id>`; the render loop uses a parallel `itemCollapsedIndent` tracker, **reset on every section boundary** so a collapsed item never bleeds across sections
- `collapsed` is purely renderer state — it is never written to the markdown file by `serialize`
- Helpers: `hasSubItems(index)` (peek at the next item's indent), `toggleItemCollapse(index)` (mirrors `toggleSection`)
- Chevron slot in `buildItemRow` is **always created** but set to `visibility: hidden` for leaf items, so checkbox columns stay aligned across all rows
- `Ctrl+E` checks for item focus first; if the focused item has sub-items it toggles that item, otherwise it falls through to the section toggle
- `Tab` indent walks back to the nearest ancestor — if that ancestor is collapsed it auto-expands, so a newly-indented child never silently disappears

### Key constraint

`prompt()` and `confirm()` are disabled in Electron's renderer. Use `window.checklistAPI.showConfirm()` for confirmation dialogs (backed by `dialog.showMessageBoxSync` in the main process). For text input from the user, inject an inline input element into the DOM.
