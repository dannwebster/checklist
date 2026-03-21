// Editor module: renders and manages a single checklist
// Listens for 'checklist-selected' events from sidebar

const Editor = (() => {
  let currentPath = null;
  let currentTitle = '';
  let items = [];
  let saveTimer = null;
  let dragSrcIndex = null;
  let docCompletedFilter = 'default';
  let isGitRepo = false;
  let isGitDirty = false;
  let isCommitting = false;

  const titleEl = document.getElementById('editor-title');
  const itemListEl = document.getElementById('item-list');

  // --- Load ---
  async function loadChecklist(cl) {
    if (!cl) {
      currentPath = null;
      currentTitle = '';
      items = [];
      docCompletedFilter = 'default';
      isGitRepo = false;
      isGitDirty = false;
      titleEl.textContent = '';
      document.title = 'Punchcard';
      addH1Btn.style.display = 'none';
      applyGitUI();
      render();
      return;
    }
    currentPath = cl.path;
    const markdown = await window.checklistAPI.read(cl.path);
    const parsed = parse(markdown);
    currentTitle = cl.path.replace(/.*[/\\]/, '');
    items = parsed.items;
    docCompletedFilter = parsed.docCompletedFilter || 'default';
    for (const item of items) {
      if (item.type === 'section') {
        item.collapsed = localStorage.getItem('sec-collapsed:' + item.id) === '1';
      }
    }
    titleEl.textContent = currentTitle;
    document.title = currentTitle + ' — Punchcard';
    addH1Btn.style.display = '';
    updateDocFilterBtn();
    render();
    if (parsed.hadMissingIds) scheduleSave();
    await refreshGitStatus();
  }

  // --- Render ---
  function render() {
    itemListEl.innerHTML = '';
    let collapsedLevel = Infinity;
    let currentZoneId = 'root';
    const docEffective = docCompletedFilter === 'hide' ? 'hide' : 'show';
    const effectiveByLevel = [docEffective];
    let currentEffectiveFilter = docEffective;

    items.forEach((item, i) => {
      if (item.type === 'section') {
        if (item.level <= collapsedLevel) {
          collapsedLevel = item.collapsed ? item.level : Infinity;
          currentZoneId = item.id;
          itemListEl.appendChild(buildSectionHeader(item, i));
          // Update filter inheritance stack
          effectiveByLevel.length = item.level;
          const parentFilter = effectiveByLevel[effectiveByLevel.length - 1];
          const thisFilter = item.completedFilter === 'default' ? parentFilter : item.completedFilter;
          effectiveByLevel.push(thisFilter);
          currentEffectiveFilter = thisFilter;
        }
      } else {
        if (collapsedLevel === Infinity) {
          if (item.checked && currentEffectiveFilter === 'hide') return;
          itemListEl.appendChild(buildItemRow(item, i));
        }
      }
    });

  }

  const CF_LABELS = { default: '·', show: 'show ✓', hide: 'hide ✓' };
  const CF_TITLES = {
    default: 'Completed: inherit — click to show all',
    show: 'Completed: shown — click to hide',
    hide: 'Completed: hidden — click to inherit',
  };

  function cycleCompletedFilter(index) {
    const states = ['default', 'show', 'hide'];
    const current = items[index].completedFilter || 'default';
    items[index].completedFilter = states[(states.indexOf(current) + 1) % 3];
    render();
    scheduleSave();
  }

  function buildSectionHeader(item, index) {
    const li = document.createElement('li');
    li.className = 'section-header level-' + item.level;
    li.dataset.secId = item.id;
    li.draggable = true;

    const secHandle = document.createElement('span');
    secHandle.className = 'drag-handle';
    secHandle.textContent = '⠿';
    secHandle.title = 'Drag to reorder section';

    const toggle = document.createElement('button');
    toggle.className = 'section-toggle';
    toggle.textContent = item.collapsed ? '▶' : '▼';
    toggle.title = item.collapsed ? 'Expand' : 'Collapse';
    toggle.addEventListener('click', () => toggleSection(index));

    const cf = item.completedFilter || 'default';
    const cfBtn = document.createElement('button');
    cfBtn.className = 'section-cf-btn';
    cfBtn.textContent = CF_LABELS[cf];
    cfBtn.title = CF_TITLES[cf];
    cfBtn.dataset.state = cf;
    cfBtn.addEventListener('click', () => cycleCompletedFilter(index));

    const tag = ['h1', 'h2', 'h3'][item.level - 1];
    const secTitleEl = document.createElement(tag);
    secTitleEl.className = 'section-title';
    secTitleEl.contentEditable = 'true';
    secTitleEl.spellcheck = true;
    secTitleEl.textContent = item.text;
    secTitleEl.addEventListener('input', () => {
      items[index].text = secTitleEl.textContent;
      scheduleSave();
    });
    secTitleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          items[index].level = Math.max(1, items[index].level - 1);
        } else {
          items[index].level = Math.min(3, items[index].level + 1);
        }
        render();
        scheduleSave();
        const newEl = itemListEl.querySelector(`[data-sec-id="${item.id}"] .section-title`);
        if (newEl) newEl.focus();
      }
    });

    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      window._editorDragging = true;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    li.addEventListener('dragend', () => {
      window._editorDragging = false;
      li.classList.remove('dragging');
      document.querySelectorAll('.section-header, .item-row').forEach(r => r.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      if (dragSrcIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.section-header, .item-row').forEach(r => r.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === index) { dragSrcIndex = null; return; }
      const src = items[dragSrcIndex];
      if (src.type === 'section') {
        const blockEnd = getInsertionIndex(dragSrcIndex);
        const block = items.splice(dragSrcIndex, blockEnd - dragSrcIndex);
        let targetIdx = index;
        if (dragSrcIndex < index) targetIdx -= block.length;
        items.splice(targetIdx, 0, ...block);
      } else {
        const blockEnd = getItemBlockEnd(dragSrcIndex);
        const block = items.splice(dragSrcIndex, blockEnd - dragSrcIndex);
        let targetIdx = index;
        if (dragSrcIndex < index) targetIdx -= block.length;
        items.splice(targetIdx, 0, ...block);
      }
      dragSrcIndex = null;
      render();
      scheduleSave();
    });

    li.appendChild(secHandle);
    li.appendChild(toggle);
    li.appendChild(cfBtn);
    li.appendChild(secTitleEl);

    if (item.level < 3) {
      const addBtn = document.createElement('button');
      addBtn.className = 'section-add-child';
      addBtn.textContent = item.level === 1 ? '+ Section' : '+ Subsection';
      addBtn.title = item.level === 1 ? 'Add a section (H2)' : 'Add a subsection (H3)';
      addBtn.addEventListener('click', () => addChildSection(index, item.level + 1));
      li.appendChild(addBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'item-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Delete section (items remain)';
    delBtn.addEventListener('click', () => {
      items.splice(index, 1);
      render();
      scheduleSave();
    });
    li.appendChild(delBtn);
    return li;
  }

  function getItemBlockEnd(itemIndex) {
    const indent = items[itemIndex].indent;
    for (let i = itemIndex + 1; i < items.length; i++) {
      if (items[i].type === 'section') return i;
      if (items[i].indent <= indent) return i;
    }
    return items.length;
  }

  function getInsertionIndex(headerIndex) {
    const level = items[headerIndex].level;
    for (let i = headerIndex + 1; i < items.length; i++) {
      if (items[i].type === 'section' && items[i].level <= level) {
        return i;
      }
    }
    return items.length;
  }

  function addChildSection(parentIndex, childLevel) {
    if (!currentPath) return;
    const insertAt = getInsertionIndex(parentIndex);
    const newSection = { type: 'section', id: genId(), level: childLevel, text: 'New Section', collapsed: false, completedFilter: 'default' };
    const newItem = { id: genId(), checked: false, text: '', indent: 0 };
    items.splice(insertAt, 0, newSection, newItem);
    render();
    scheduleSave();
    const newLi = itemListEl.querySelector(`[data-sec-id="${newSection.id}"]`);
    if (newLi) newLi.querySelector('.section-title').focus();
  }

  function toggleSection(index) {
    items[index].collapsed = !items[index].collapsed;
    if (items[index].collapsed) {
      localStorage.setItem('sec-collapsed:' + items[index].id, '1');
    } else {
      localStorage.removeItem('sec-collapsed:' + items[index].id);
    }
    render();
  }

  function buildItemRow(item, index) {
    item.contextExpanded = item.contextExpanded ?? !!item.context;

    const li = document.createElement('li');
    li.className = 'item-row' + (item.checked ? ' checked' : '') + (item.context ? ' has-context' : '');
    li.dataset.id = item.id;
    li.draggable = true;
    if (item.indent) li.style.paddingLeft = (6 + item.indent * 20) + 'px';

    // --- Main row ---
    const itemMain = document.createElement('div');
    itemMain.className = 'item-main';

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'item-checkbox';
    checkbox.checked = item.checked;
    checkbox.addEventListener('change', () => toggleItem(index));

    const textEl = document.createElement('span');
    textEl.className = 'item-text';
    textEl.contentEditable = 'true';
    textEl.spellcheck = true;
    textEl.textContent = item.text;
    textEl.addEventListener('input', () => {
      items[index].text = textEl.textContent;
      scheduleSave();
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          items[index].indent = Math.max(0, (items[index].indent || 0) - 1);
        } else {
          items[index].indent = Math.min(6, (items[index].indent || 0) + 1);
        }
        li.style.paddingLeft = items[index].indent ? (6 + items[index].indent * 20) + 'px' : '';
        scheduleSave();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(textEl, -1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(textEl, 1);
      }
      if (e.key === 'Enter' && !e.ctrlKey) {
        e.preventDefault();
        const newItem = { id: genId(), checked: false, text: '', indent: items[index].indent || 0 };
        items.splice(index + 1, 0, newItem);
        render();
        scheduleSave();
        const newRow = itemListEl.querySelector(`[data-id="${newItem.id}"] .item-text`);
        if (newRow) newRow.focus();
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        toggleContext();
      }
      if (e.key === ':') {
        e.preventDefault();
        items[index].text = textEl.textContent;
        if (!items[index].contextExpanded) toggleContext();
      }
      if (e.key === 'Backspace' && textEl.textContent === '') {
        e.preventDefault();
        removeItem(index);
      }
    });

    // --- Context toggle button ---
    const contextBtn = document.createElement('button');
    contextBtn.className = 'item-context-btn';
    contextBtn.title = 'Toggle context (Ctrl+Enter)';
    contextBtn.textContent = item.contextExpanded ? '▾' : '▸';
    contextBtn.addEventListener('click', () => toggleContext());

    const delBtn = document.createElement('button');
    delBtn.className = 'item-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Delete item';
    delBtn.addEventListener('click', () => removeItem(index));

    // --- Context area ---
    const contextArea = document.createElement('div');
    contextArea.className = 'item-context-area';
    contextArea.hidden = !item.contextExpanded;

    const contextTextEl = document.createElement('textarea');
    contextTextEl.className = 'item-context-text';
    contextTextEl.placeholder = 'Add context...';
    contextTextEl.value = item.context || '';
    contextTextEl.rows = 2;
    contextTextEl.addEventListener('input', () => {
      items[index].context = contextTextEl.value || undefined;
      contextBtn.textContent = items[index].context ? '▾' : '▸';
      li.classList.toggle('has-context', !!items[index].context);
      scheduleSave();
    });
    contextTextEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { toggleContext(); textEl.focus(); }
    });
    contextArea.appendChild(contextTextEl);

    function toggleContext() {
      items[index].contextExpanded = !items[index].contextExpanded;
      contextArea.hidden = !items[index].contextExpanded;
      contextBtn.textContent = items[index].contextExpanded ? '▾' : '▸';
      li.classList.toggle('has-context', items[index].contextExpanded || !!items[index].context);
      if (items[index].contextExpanded) contextTextEl.focus();
    }

    // Drag events
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      window._editorDragging = true;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    li.addEventListener('dragend', () => {
      window._editorDragging = false;
      li.classList.remove('dragging');
      document.querySelectorAll('.section-header, .item-row').forEach(r => r.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.section-header, .item-row').forEach(r => r.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === index) return;
      if (items[dragSrcIndex] && items[dragSrcIndex].type === 'section') {
        dragSrcIndex = null;
        return;
      }
      const blockEnd = getItemBlockEnd(dragSrcIndex);
      const block = items.splice(dragSrcIndex, blockEnd - dragSrcIndex);
      let targetIdx = index;
      if (dragSrcIndex < index) targetIdx -= block.length;
      items.splice(targetIdx, 0, ...block);
      dragSrcIndex = null;
      render();
      scheduleSave();
    });

    itemMain.appendChild(handle);
    itemMain.appendChild(checkbox);
    itemMain.appendChild(textEl);
    itemMain.appendChild(contextBtn);
    itemMain.appendChild(delBtn);
    li.appendChild(itemMain);
    li.appendChild(contextArea);
    return li;
  }

  // --- Item mutations ---
  function toggleItem(index) {
    items[index].checked = !items[index].checked;
    const row = itemListEl.querySelector(`[data-id="${items[index].id}"]`);
    if (row) {
      row.classList.toggle('checked', items[index].checked);
      row.querySelector('.item-checkbox').checked = items[index].checked;
    }
    scheduleSave();
  }

  function removeItem(index) {
    items.splice(index, 1);
    render();
    scheduleSave();
  }

  // --- Focus navigation ---
  function getFocusableEls() {
    return [titleEl, ...itemListEl.querySelectorAll('.item-text')];
  }

  function moveFocus(currentEl, delta) {
    const els = Array.from(getFocusableEls());
    const i = els.indexOf(currentEl);
    if (i === -1) return;
    const target = els[i + delta];
    if (target) target.focus();
  }

  // --- Save ---
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  async function save() {
    if (!currentPath) return;
    const markdown = serialize(currentTitle, items, docCompletedFilter);
    await window.checklistAPI.write(currentPath, markdown);
    await refreshGitStatus();
  }

  async function refreshGitStatus() {
    if (!currentPath) return;
    const status = await window.checklistAPI.gitStatus(currentPath);
    isGitRepo = status.isGitRepo;
    isGitDirty = status.isDirty;
    applyGitUI();
    Sidebar.setGitDirty(currentPath, isGitRepo && isGitDirty);
  }

  function applyGitUI() {
    gitCommitBtn.style.display = isGitRepo ? '' : 'none';
    gitCommitBtn.disabled = isCommitting || !isGitDirty;
    gitCommitBtn.textContent = isCommitting ? 'committing\u2026' : 'commit';
    titleEl.classList.toggle('git-dirty', isGitRepo && isGitDirty);
  }

  // --- Title editing ---
  titleEl.addEventListener('input', () => {
    currentTitle = titleEl.textContent.trim();
    document.title = currentTitle + ' — Punchcard';
    scheduleSave();
  });

  titleEl.addEventListener('blur', async () => {
    const newName = titleEl.textContent.trim();
    if (!newName || !currentPath) return;
    const oldName = currentPath.replace(/.*[/\\]/, '').replace(/\.md$/, '');
    const newBaseName = newName.replace(/\.md$/i, '');
    if (newBaseName !== oldName) {
      const newPath = await window.checklistAPI.rename(currentPath, newBaseName);
      const oldPath = currentPath;
      currentPath = newPath;
      currentTitle = newBaseName + '.md';
      titleEl.textContent = currentTitle;
      await Sidebar.updateName(oldPath, newBaseName);
      document.title = currentTitle + ' — Punchcard';
    }
  });

  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(titleEl, 1);
    }
  });

  // --- H1 section button ---
  const addH1Btn = document.createElement('button');
  addH1Btn.id = 'add-h1-section-btn';
  addH1Btn.textContent = '+ add header';
  addH1Btn.title = 'Add a top-level section (H1)';
  addH1Btn.style.display = 'none';
  addH1Btn.addEventListener('click', () => {
    if (!currentPath) return;
    const newSection = { type: 'section', id: genId(), level: 1, text: 'New Section', collapsed: false, completedFilter: 'default' };
    const newItem = { id: genId(), checked: false, text: '', indent: 0 };
    items.push(newSection, newItem);
    render();
    scheduleSave();
    const newLi = itemListEl.querySelector(`[data-sec-id="${newSection.id}"]`);
    if (newLi) newLi.querySelector('.section-title').focus();
  });
  document.getElementById('title-row').appendChild(addH1Btn);

  // --- Document-level completed filter button ---
  const docFilterBtn = document.createElement('button');
  docFilterBtn.id = 'doc-completed-filter-btn';
  docFilterBtn.dataset.state = 'default';

  function updateDocFilterBtn() {
    docFilterBtn.textContent = CF_LABELS[docCompletedFilter];
    docFilterBtn.title = CF_TITLES[docCompletedFilter];
    docFilterBtn.dataset.state = docCompletedFilter;
  }

  updateDocFilterBtn();

  docFilterBtn.addEventListener('click', () => {
    if (!currentPath) return;
    const states = ['default', 'show', 'hide'];
    docCompletedFilter = states[(states.indexOf(docCompletedFilter) + 1) % 3];
    updateDocFilterBtn();
    render();
    scheduleSave();
  });
  document.getElementById('title-row').appendChild(docFilterBtn);

  // --- Git commit button ---
  const gitCommitBtn = document.createElement('button');
  gitCommitBtn.id = 'git-commit-btn';
  gitCommitBtn.textContent = 'commit';
  gitCommitBtn.title = 'Commit this file to git';
  gitCommitBtn.style.display = 'none';
  gitCommitBtn.addEventListener('click', async () => {
    if (!currentPath || isCommitting) return;
    isCommitting = true;
    applyGitUI();
    const result = await window.checklistAPI.gitCommit(currentPath);
    isCommitting = false;
    if (result.success) {
      await refreshGitStatus();
    } else {
      applyGitUI();
    }
  });
  document.getElementById('title-row').appendChild(gitCommitBtn);

  // --- Reload from disk ---
  async function reloadCurrent() {
    if (!currentPath || saveTimer) return;
    const markdown = await window.checklistAPI.read(currentPath);
    const parsed = parse(markdown);
    currentTitle = currentPath.replace(/.*[/\\]/, '');
    items = parsed.items;
    docCompletedFilter = parsed.docCompletedFilter || 'default';
    for (const item of items) {
      if (item.type === 'section') {
        item.collapsed = localStorage.getItem('sec-collapsed:' + item.id) === '1';
      }
    }
    titleEl.textContent = currentTitle;
    document.title = currentTitle + ' — Punchcard';
    updateDocFilterBtn();
    render();
    if (parsed.hadMissingIds) scheduleSave();
  }

  function showCrossFileDragDialog(destName) {
    let modal = document.getElementById('cfd-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'cfd-modal';
      modal.innerHTML = `
        <div class="cfd-box">
          <p class="cfd-msg">Add to <strong class="cfd-dest"></strong>?</p>
          <div class="cfd-btns">
            <button class="cfd-btn" data-action="copy">Copy</button>
            <button class="cfd-btn" data-action="move">Move</button>
            <button class="cfd-btn cfd-cancel" data-action="cancel">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    modal.querySelector('.cfd-dest').textContent = destName;
    modal.style.display = 'flex';
    return new Promise((resolve) => {
      function handler(ev) {
        const action = ev.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        modal.style.display = 'none';
        modal.removeEventListener('click', handler);
        resolve(action);
      }
      modal.addEventListener('click', handler);
    });
  }

  // --- Listen for selection ---
  window.addEventListener('checklist-selected', (e) => loadChecklist(e.detail));

  window.addEventListener('editor-to-sidebar-drop', async (e) => {
    if (dragSrcIndex === null) return;
    const { destPath, destName } = e.detail;

    const src = items[dragSrcIndex];
    const blockEnd = src.type === 'section'
      ? getInsertionIndex(dragSrcIndex)
      : getItemBlockEnd(dragSrcIndex);
    const block = items.slice(dragSrcIndex, blockEnd);
    const srcStart = dragSrcIndex;
    const srcEnd = blockEnd;

    const action = await showCrossFileDragDialog(destName);
    if (action === 'cancel') return;

    const blockCopy = block.map(item => ({ ...item, id: genId() }));

    const destMarkdown = await window.checklistAPI.read(destPath);
    const destParsed = parse(destMarkdown);
    destParsed.items.push(...blockCopy);
    await window.checklistAPI.write(destPath, serialize('', destParsed.items, destParsed.docCompletedFilter));

    if (action === 'move') {
      items.splice(srcStart, srcEnd - srcStart);
      render();
      scheduleSave();
    }
  });

  window.checklistAPI.onFileChanged((filePath) => {
    if (filePath === currentPath) reloadCurrent();
  });

  return {};
})();
