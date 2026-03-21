# Punchcard

A desktop task manager built with Electron. Lists are stored as standard GitHub Flavored Markdown files on your disk — no cloud, no accounts. Files are readable in any text editor and can be committed to git.

## Features

### Lists and items

- Create, rename, and delete checklists
- Add, edit, and delete items inline
- Press Enter on any item to insert a new item immediately below it
- Check items off; checked items display with strikethrough
- Indent items up to 6 levels deep with Tab / Shift+Tab
- Drag and drop to reorder items within a section; drag section headers to reorder entire sections (with all their items); drag any item or section to a different file in the sidebar to copy or move it
- Navigate between items with arrow keys

### Sections and hierarchy

- Organize items under H1, H2, and H3 section headers
- Collapse and expand sections; collapsed state persists across restarts
- Add sections at any level; new sections start with a blank item ready to type

### Show/hide completed

- Toggle completed items visible or hidden per section or globally
- The setting is stored in the file itself, so it persists across restarts

### Multiple folders

- Watch multiple root folders simultaneously
- File-tree sidebar with collapsible folders
- Files are detected automatically by the watcher — no manual refresh needed

### Git integration

- Detects when a file lives inside a git repo
- Files with uncommitted changes are highlighted with an orange tint in the sidebar and title bar
- A one-click commit button stages and commits the current file with an auto-generated message

### Auto-save

- Saves 300 ms after you stop typing — no save button needed
- Detects external file changes and reloads the file if there are no pending local edits

## Data format

Files use standard GFM task-list syntax:

```markdown
# Title

## Section

- [ ] An open item <!-- id:a3f2b1c0 -->
- [x] A completed item <!-- id:d4e5f6a7 -->
```

Each item carries a stable ID in an HTML comment so reordering never loses state. The IDs are invisible in any Markdown renderer and the files remain fully readable and editable outside the app.

## Development

```bash
npm install
npm run dev      # launches Electron and restarts on source file changes
# or
npm start        # single launch, no auto-restart
```

## Generating the app icon

Before building for the first time (or after editing the icon), generate the platform icon formats from the source SVG:

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
