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
      document.title = 'Checklist';
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
    document.title = currentTitle + ' — Checklist';
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
          // Zone boundary: emit add-row for the zone that just ended (only if visible)
          if (collapsedLevel === Infinity) {
            itemListEl.appendChild(buildAddRow(i, currentZoneId));
          }
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

    // Emit add-row for the last visible zone
    if (collapsedLevel === Infinity) {
      itemListEl.appendChild(buildAddRow(items.length, currentZoneId));
    }
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
    });

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
    items.splice(insertAt, 0, newSection);
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
    const li = document.createElement('li');
    li.className = 'item-row' + (item.checked ? ' checked' : '');
    li.dataset.id = item.id;
    li.draggable = true;
    if (item.indent) li.style.paddingLeft = (6 + item.indent * 20) + 'px';

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
      if (e.key === 'Enter') {
        e.preventDefault();
        const newItem = { id: genId(), checked: false, text: '', indent: items[index].indent || 0 };
        items.splice(index + 1, 0, newItem);
        render();
        scheduleSave();
        const newRow = itemListEl.querySelector(`[data-id="${newItem.id}"] .item-text`);
        if (newRow) newRow.focus();
      }
      if (e.key === 'Backspace' && textEl.textContent === '') {
        e.preventDefault();
        removeItem(index);
      }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'item-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Delete item';
    delBtn.addEventListener('click', () => removeItem(index));

    // Drag events
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.querySelectorAll('.item-row, .add-item-row').forEach(r => r.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.item-row, .add-item-row').forEach(r => r.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex !== null && dragSrcIndex !== index) {
        const moved = items.splice(dragSrcIndex, 1)[0];
        items.splice(index, 0, moved);
        dragSrcIndex = null;
        render();
        scheduleSave();
      }
    });

    li.appendChild(handle);
    li.appendChild(checkbox);
    li.appendChild(textEl);
    li.appendChild(delBtn);
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

  function addItemAt(text, insertAt, zoneId, indent = 0) {
    if (!text.trim()) return;
    const newItem = { id: genId(), checked: false, text: text.trim() };
    if (indent) newItem.indent = indent;
    items.splice(insertAt, 0, newItem);
    render();
    scheduleSave();
    // Refocus the zone's add-row so the user can keep adding
    const zoneInput = itemListEl.querySelector(`.add-item-row[data-zone-id="${zoneId}"] .add-item-input`);
    if (zoneInput) zoneInput.focus();
  }

  function buildAddRow(insertAt, zoneId) {
    const li = document.createElement('li');
    li.className = 'add-item-row';
    li.dataset.zoneId = zoneId;

    // Determine default indent from last item in zone
    let indent = 0;
    for (let j = insertAt - 1; j >= 0; j--) {
      if (items[j].type === 'section') break;
      indent = items[j].indent || 0;
      break;
    }
    li.style.paddingLeft = indent ? (6 + indent * 20) + 'px' : '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'add-item-input';
    input.placeholder = 'Add an item...';
    input.autocomplete = 'off';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) indent = Math.max(0, indent - 1);
        else indent = Math.min(6, indent + 1);
        li.style.paddingLeft = indent ? (6 + indent * 20) + 'px' : '';
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (input.value.trim()) addItemAt(input.value, insertAt, zoneId, indent);
        else input.value = '';
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(input, -1);
      }
    });

    li.addEventListener('dragover', (e) => {
      if (dragSrcIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.item-row, .add-item-row').forEach(r => r.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (dragSrcIndex === null) return;
      let adjustedInsertAt = insertAt;
      if (dragSrcIndex < insertAt) adjustedInsertAt--;
      if (dragSrcIndex === adjustedInsertAt) { dragSrcIndex = null; return; }
      const moved = items.splice(dragSrcIndex, 1)[0];
      items.splice(adjustedInsertAt, 0, moved);
      dragSrcIndex = null;
      render();
      scheduleSave();
    });

    li.appendChild(input);
    return li;
  }

  // --- Focus navigation ---
  function getFocusableEls() {
    return [titleEl, ...itemListEl.querySelectorAll('.item-text, .add-item-input')];
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
    document.title = currentTitle + ' — Checklist';
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
      document.title = currentTitle + ' — Checklist';
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
    items.push(newSection);
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
    document.title = currentTitle + ' — Checklist';
    updateDocFilterBtn();
    render();
    if (parsed.hadMissingIds) scheduleSave();
  }

  // --- Listen for selection ---
  window.addEventListener('checklist-selected', (e) => loadChecklist(e.detail));

  window.checklistAPI.onFileChanged((filePath) => {
    if (filePath === currentPath) reloadCurrent();
  });

  return {};
})();
