# Automated Testing Strategy

This document describes the planned approach for automating tests from `TEST_PLAN.md`. No tests have been implemented yet — this is the reference plan for when testing work begins.

---

## Two-layer approach

### Layer 1 — Unit tests (Vitest)

Target: `renderer/parser.js` pure functions only.

`parser.js` already has a CommonJS export guard at the bottom, so it imports cleanly in Node.js with no source changes required:

```js
const { parse, serialize, extractDueDate, stripDueDate, genId } = require('./renderer/parser.js');
```

**Dependencies to add:**
```
npm install --save-dev vitest
```

**Scripts to add to `package.json`:**
```json
"test":       "vitest run tests/unit",
"test:watch": "vitest tests/unit"
```

**TEST_PLAN.md coverage (as pure data assertions):**

| Manual test | Unit test description |
|---|---|
| 9.2 Round-trip fidelity | `parse(serialize(title, items))` equals original items |
| 9.1 Readable markdown | `serialize()` output is valid GFM task-list syntax |
| 4.5 Context persists | `item text: context text` round-trips through parse/serialize |
| 4.2 URL not triggering context | `://` in item text does not split into context |
| 3.x Filter syntax | `<!-- cf:show/hide -->` doc-level and section-level round-trips |
| 2.x Sections | Level, completedFilter, id all survive serialize → parse |
| Due dates | `extractDueDate()` / `stripDueDate()` edge cases |
| ID generation | `genId()` returns 8-char hex; no two successive calls collide |

**Test file layout:**
```
tests/unit/
  parser.test.js         # core parse/serialize round-trips
  parser-dates.test.js   # extractDueDate, stripDueDate
  parser-ids.test.js     # genId, hadMissingIds
```

---

### Layer 2 — E2E tests (Playwright + Electron)

Uses `@playwright/test` with `playwright`'s `_electron` fixture to launch the real Electron app.

**Dependencies to add:**
```
npm install --save-dev @playwright/test playwright
```

**Scripts to add to `package.json`:**
```json
"test:e2e": "playwright test --config tests/playwright.config.js",
"test:all": "vitest run tests/unit && playwright test --config tests/playwright.config.js"
```

#### Test isolation — no mocking needed

Each test:
1. Creates a temp `userDataDir` and writes a `settings.json` pointing to a temp `checklistDir`
2. Launches Electron with `--user-data-dir=<tmpDir>` — Electron maps this to `app.getPath('userData')`, so the real app reads the pre-written settings with no IPC mocking
3. Seeds `.md` files into `checklistDir` as needed before launch
4. Interacts via Playwright DOM APIs
5. Asserts DOM state or reads actual `.md` file content from disk (after 400 ms auto-save)
6. Closes the app and removes the temp dirs

#### Confirmation dialogs

`dialog.showMessageBoxSync` is synchronous and blocks the renderer, so it can't be handled with Playwright's normal dialog handler. Stub it from the main process before clicking:

```js
await app.evaluate(({ dialog }) => {
  dialog.showMessageBoxSync = () => 1; // returns "Delete" / confirm button index
});
```

#### E2E spec files

```
tests/e2e/
  fixtures/
    electron-app.js          # base fixture: tmpDir, launch, teardown
    git-app.js               # extends base: git init + seed commit in checklistDir
  items.spec.js              # §1: Lists and items (1.1–1.8)
  sections.spec.js           # §2: Sections and hierarchy (2.1, 2.3–2.5)
  completed-filter.spec.js   # §3: Show/hide completed (3.1–3.3)
  context.spec.js            # §4: Context / inline notes (4.1–4.5)
  autosave.spec.js           # §7: Auto-save (7.1–7.3)
  git.spec.js                # §6: Git integration (6.1, 6.2, 6.4)
  keyboard.spec.js           # §1.9, §1.11, §10: selected keyboard shortcuts
```

**TEST_PLAN.md coverage:**

| Spec file | Tests automated |
|---|---|
| `items.spec.js` | 1.1 Create, 1.2 Rename, 1.3 Delete, 1.4 Add item, 1.5 Edit, 1.6 Delete empty, 1.7 Ctrl+Backspace, 1.8 Check/uncheck |
| `sections.spec.js` | 2.1 Add H1, 2.3 Promote/demote, 2.4 Collapse/expand, 2.5 Collapse persists (reload app) |
| `completed-filter.spec.js` | 3.1 Doc-level filter, 3.2 Section-level filter, 3.3 Filter persists |
| `context.spec.js` | 4.1 `:` opens context, 4.2 URL doesn't, 4.3 Ctrl+Enter toggle, 4.4 Indicator, 4.5 Persists |
| `autosave.spec.js` | 7.1 Save on edit, 7.2 No data loss on rapid typing, 7.3 External change reload |
| `git.spec.js` | 6.1 Dirty indicator, 6.2 Commit, 6.4 Revert |
| `keyboard.spec.js` | 1.9 Tab/Shift+Tab indent, 1.11 Arrow nav, selected shortcuts from §10 |

---

## What stays manual

| Tests | Reason |
|---|---|
| 1.10, 2.6, 8.x — drag and drop | Drag-and-drop automation is fragile and slow in Playwright |
| 5.1, 5.2 — add/remove root folder | Requires native OS folder picker dialog; can't be driven by Playwright |
| 7.4 — external change during active edit | Race condition; inherently timing-dependent |
| 6.5 — revert cancel | Requires native dialog interaction for cancel path |
| 6.6 — non-git file | Low priority; straightforward to verify manually |

---

## Key design decisions

- **No source changes required.** `parser.js` already has `if (typeof module !== 'undefined') module.exports = ...`, making it importable in Node.js/Vitest without modification.
- **`--user-data-dir` for isolation.** Electron maps this flag to `app.getPath('userData')`, where `file-manager.js` reads `settings.json`. Pre-writing a settings file to a temp dir gives full test isolation without mocking the IPC layer.
- **`app.evaluate()` for dialog stubbing.** Because `dialog.showMessageBoxSync` is synchronous and runs in the main process, the only way to intercept it is via `app.evaluate()` which executes code in the Electron main process context.
- **`main/file-manager.js` not unit tested directly.** It has `require('electron')` at the module level, which fails outside Electron. Its behavior is covered by the E2E layer instead.
