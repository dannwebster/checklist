# Punchcard — Manual Test Plan

This plan covers all features described in README.md. Tests are grouped by feature area and intended to be run top-to-bottom. Each test lists the action and the expected result.

---

## 1. Lists and items

### 1.1 Create a checklist
1. Click `+` next to a root folder in the sidebar.
2. Type a name and press Enter.
- **Expected:** File appears in the sidebar. The editor opens it with an empty item ready to type.

### 1.2 Rename a checklist
1. Click the filename in the title bar; edit the text; press Enter or click away.
- **Expected:** Sidebar updates to show the new name. File on disk is renamed.

### 1.3 Delete a checklist
1. Click the `×` button next to a file in the sidebar.
2. Confirm deletion in the dialog.
- **Expected:** File disappears from the sidebar and is removed from disk.

### 1.4 Add an item
1. Click an empty item row or press Enter on an existing item.
2. Type text.
- **Expected:** Text appears inline. A new item is inserted immediately below when Enter is pressed.

### 1.5 Edit an item
1. Click on existing item text and modify it.
- **Expected:** Changes are reflected immediately; file auto-saves within ~300 ms.

### 1.6 Delete an item — empty
1. Navigate to an item and delete all its text.
2. Press Backspace.
- **Expected:** Item is removed.

### 1.7 Delete an item — unconditional
1. Focus any item (even one with text).
2. Press Ctrl+Backspace.
- **Expected:** Item is deleted regardless of content.

### 1.8 Check and uncheck an item
1. Click the checkbox on an item, or press Ctrl+Space while focused on its text.
- **Expected:** Checkbox toggles. Checked items display with strikethrough and dimmed text. Unchecking restores normal appearance.

### 1.9 Indent and unindent
1. Focus an item and press Tab.
- **Expected:** Item indents one level (max 6). Pressing Tab again continues indenting up to the limit.
2. Press Shift+Tab.
- **Expected:** Item unindents one level (min 0).

### 1.10 Drag to reorder items
1. Drag an item by its drag handle (⠿) to a different position within the same section.
- **Expected:** Item moves to the drop position. Indented sub-items move with their parent.

### 1.11 Arrow key navigation
1. Focus an item and press ↑ / ↓.
- **Expected:** Focus moves to the previous/next focusable element (section titles and item text fields included).

---

## 2. Sections and hierarchy

### 2.1 Add a top-level section
1. Click `+ add header` in the title row, or press Ctrl+H while focused on an item.
- **Expected:** A new H1 section header is inserted below the current item. The section title is focused and ready to type.

### 2.2 Add sub-sections
1. Hover a section header and click `+ Section` (H1) or `+ Subsection` (H2).
- **Expected:** A child section at the next heading level is inserted at the end of the current section.

### 2.3 Promote and demote section headers
1. Focus a section title and press Tab.
- **Expected:** Header demotes one level (H1→H2→H3 max).
2. Press Shift+Tab.
- **Expected:** Header promotes one level (H3→H2→H1 min).

### 2.4 Collapse and expand a section
1. Click the ▼ toggle on a section header, or press Ctrl+E while focused inside the section.
- **Expected:** Section collapses; items inside are hidden. Toggle changes to ▶. Focus moves to the section title.
2. Toggle again.
- **Expected:** Section expands; items reappear. Focus stays on the section title.

### 2.5 Collapsed state persists
1. Collapse a section.
2. Close and reopen the app (or reload the file).
- **Expected:** Section remains collapsed.

### 2.6 Drag section headers
1. Drag a section header to a different position.
- **Expected:** The entire section (header + all items beneath it) moves as a block.

---

## 3. Show/hide completed

### 3.1 Document-level filter
1. Click the `·` / `show ✓` / `hide ✓` button in the title row, or press Ctrl+Shift+H with no section in scope.
- **Expected:** Cycles through three states — inherit (default), show all, hide all. Checked items appear or disappear accordingly.

### 3.2 Section-level filter
1. Focus an item inside a section and press Ctrl+Shift+H.
- **Expected:** Cycles the *section's* filter independently of the document filter. The section button label updates.

### 3.3 Filter persists across restarts
1. Set a section filter to "hide ✓" and close/reopen the app.
- **Expected:** The filter state is preserved (stored in the file).

---

## 4. Context (inline notes)

### 4.1 Open context by typing `:`
1. Type text in an item with no existing colon, then type `:`.
- **Expected:** Context area expands below the item and focus moves to it.

### 4.2 Context not triggered by URLs
1. Type `https://example.com` into an item text.
- **Expected:** Context area does NOT open; the URL is kept in the item text intact.

### 4.3 Toggle context open/closed
1. Focus an item with or without context; press Ctrl+Enter.
- **Expected:** Context area toggles. When opening, cursor is placed at the end of the context text.
2. Press Ctrl+Enter while in the context area.
- **Expected:** Context closes and focus returns to the item text.

### 4.4 Context indicator
1. Add context text to an item, then close the context.
- **Expected:** The ▸ arrow button is bright/accented, indicating context exists.
2. Clear all context text.
- **Expected:** Indicator returns to its dimmed state.

### 4.5 Context persists across saves
1. Add context text; wait for auto-save; close and reopen the file.
- **Expected:** Context text is preserved. The file on disk uses `item text: context text` format.

### 4.6 URLs in context
1. Open the context area and type a URL containing `://`.
- **Expected:** URL is stored and displayed correctly.

---

## 5. Multiple folders

### 5.1 Add a root folder
1. Click `+ Add folder` in the sidebar footer.
2. Choose a directory.
- **Expected:** Folder appears in the sidebar. Its checklist files are listed immediately.

### 5.2 Remove a root folder
1. Click the `×` next to a root folder name.
2. Confirm in the dialog.
- **Expected:** Folder disappears from the sidebar. No files are deleted from disk.

### 5.3 File tree — collapsible folders
1. Click a folder header in the sidebar.
- **Expected:** Folder collapses/expands. Collapsed state persists on restart.

### 5.4 Auto-detection of new files
1. With the app open, copy a `.md` file into a watched folder using Explorer/Finder.
- **Expected:** File appears in the sidebar within a few seconds with no manual refresh.

### 5.5 Sidebar keyboard navigation
1. Press Ctrl+B to focus the sidebar.
- **Expected:** Focus moves to the active file (or first item).
2. Use ↑ / ↓ to move between items and folder headers.
3. Press Enter to open a file or toggle a folder.
4. Press Escape to return focus to the editor.

---

## 6. Git integration

### 6.1 Dirty indicator
1. Open a file in a git repo. Edit and save it (wait for auto-save).
- **Expected:** Filename in the title bar turns amber/orange. Sidebar entry is also highlighted.

### 6.2 Commit button
1. With a dirty file open, click `commit` or press Ctrl+Shift+G.
- **Expected:** Button shows "committing…" briefly. On success, the amber tint clears. `git log` shows a new commit for this file.

### 6.3 Commit disabled when clean
1. Open a committed file with no changes.
- **Expected:** `commit` and `revert` buttons are visible but disabled (dimmed).

### 6.4 Revert button
1. Edit a file, let it auto-save (dirty state).
2. Click `revert` or press Ctrl+Shift+Z. Confirm in the dialog.
- **Expected:** File content reverts to the last committed state. Amber tint clears.

### 6.5 Revert cancel
1. Click `revert` and then click Cancel in the confirmation dialog.
- **Expected:** No changes. File remains in its edited state.

### 6.6 Non-git file
1. Open a file not inside any git repository.
- **Expected:** `commit` and `revert` buttons are hidden.

---

## 7. Auto-save

### 7.1 Save on edit
1. Edit any item; wait ~400 ms.
- **Expected:** Changes appear on disk immediately (check the file in a text editor).

### 7.2 No data loss on quick edits
1. Type rapidly across multiple items.
- **Expected:** All changes are present after the 300 ms debounce settles. No partial saves.

### 7.3 External change reload
1. Open a file. In an external editor, change a line and save.
- **Expected:** App reloads the file and shows the external change automatically.

### 7.4 External change ignored during edit
1. Start typing in an item (do not stop — keep the save timer running).
2. Simultaneously modify the file externally.
- **Expected:** App does not overwrite the in-progress edit with the external version.

---

## 8. Cross-file drag and drop

### 8.1 Drag item to another file
1. Drag an item from the editor and drop it onto a different file in the sidebar.
2. Choose "Copy" or "Move" in the dialog.
- **Expected (Copy):** Item appears in the destination file. Source file is unchanged.
- **Expected (Move):** Item appears in the destination file. Item is removed from the source file.

### 8.2 Cancel cross-file drag
1. Drag an item to a different sidebar file; click Cancel in the dialog.
- **Expected:** No changes to either file.

---

## 9. Data format

### 9.1 Readable markdown
1. Open a Punchcard file in a plain text editor or Markdown viewer.
- **Expected:** Content is valid GFM task-list syntax. IDs appear as HTML comments and are invisible in rendered Markdown.

### 9.2 Round-trip fidelity
1. Edit items in the app, save, re-open.
- **Expected:** All text, check states, indentation, section levels, context, and filter settings are preserved exactly.

### 9.3 New file extension
1. Create a new checklist whose name does not match any known Markdown extension.
- **Expected:** The app appends `.cl.md` to the filename.

---

## 10. Complete button

### 10.1 Button visibility
1. Open a checklist file.
- **Expected:** `complete` button appears in the title row alongside commit/revert.
2. Close the file (select nothing in the sidebar).
- **Expected:** `complete` button is hidden.

### 10.2 Confirm dialog — cancel
1. Check one or more items, then click `complete`.
2. Click Cancel in the confirmation dialog.
- **Expected:** No items are moved. List is unchanged.

### 10.3 Move to new Completed section
1. Open a file with no existing "Completed" section. Check several items.
2. Click `complete` and confirm.
- **Expected:** All checked items are removed from their original positions and placed under a new "Completed" H1 section at the bottom of the file.
- — automated: tests/unit/complete.test.mjs

### 10.4 Append to existing Completed section
1. Open a file that already has a "Completed" H1 section with some items. Check additional items elsewhere.
2. Click `complete` and confirm.
- **Expected:** Newly checked items are appended after the existing items in the "Completed" section. Nothing is duplicated.
- — automated: tests/unit/complete.test.mjs

### 10.5 No-op when nothing is checked
1. Ensure no items are checked. Click `complete` and confirm.
- **Expected:** Dialog appears, confirm is clicked, but no changes occur (no section created, list unchanged).
- — automated: tests/unit/complete.test.mjs

---

## 11. Keyboard shortcut reference

Verify each shortcut from the README table works end-to-end:

| Shortcut | Expected action |
|---|---|
| Enter | New item inserted below current item |
| Backspace (empty item) | Item deleted |
| Ctrl+Backspace | Item deleted unconditionally |
| Tab | Item indented one level |
| Shift+Tab | Item unindented one level |
| Alt+↑ | Item moves up one position |
| Alt+↓ | Item moves down one position |
| ↑ / ↓ | Focus moves to previous/next item |
| Ctrl+H | New section header inserted below current item |
| Ctrl+Space | Item checked/unchecked |
| Ctrl+Enter | Context area toggled open/closed |
| Ctrl+Enter (in context) | Context closed; focus returns to item |
| Ctrl+B | Sidebar focused |
| Ctrl+Shift+G | Current file committed to git |
| Ctrl+Shift+Z | Current file reverted to last commit |
| Ctrl+E | Current section collapsed/expanded; focus → section title |
| Ctrl+Shift+H | Section completed filter cycled |
