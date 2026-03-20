// Editor module: renders and manages a single checklist
// Listens for 'checklist-selected' events from sidebar

const Editor = (() => {
  let currentPath = null;
  let currentTitle = '';
  let items = [];
  let saveTimer = null;
  let dragSrcIndex = null;

  const titleEl = document.getElementById('editor-title');
  const itemListEl = document.getElementById('item-list');

  // --- Load ---
  async function loadChecklist(cl) {
    if (!cl) {
      currentPath = null;
      currentTitle = '';
      items = [];
      titleEl.textContent = '';
      document.title = 'Checklist';
      addH1Btn.style.display = 'none';
      render();
      return;
    }
    currentPath = cl.path;
    const markdown = await window.checklistAPI.read(cl.path);
    const parsed = parse(markdown);
    currentTitle = cl.path.replace(/.*[/\\]/, '');
    items = parsed.items;
    for (const item of items) {
      if (item.type === 'section') {
        item.collapsed = localStorage.getItem('sec-collapsed:' + item.id) === '1';
      }
    }
    titleEl.textContent = currentTitle;
    document.title = currentTitle + ' — Checklist';
    addH1Btn.style.display = '';
    render();
    if (parsed.hadMissingIds) scheduleSave();
  }

  // --- Render ---
  function render() {
    itemListEl.innerHTML = '';
    let collapsedLevel = Infinity;
    let currentZoneId = 'root';

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
        }
      } else {
        if (collapsedLevel === Infinity) {
          itemListEl.appendChild(buildItemRow(item, i));
        }
      }
    });

    // Emit add-row for the last visible zone
    if (collapsedLevel === Infinity) {
      itemListEl.appendChild(buildAddRow(items.length, currentZoneId));
    }
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
    const newSection = { type: 'section', id: genId(), level: childLevel, text: 'New Section', collapsed: false };
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
        // Find the zone this item belongs to
        let zoneId = 'root';
        for (let j = index - 1; j >= 0; j--) {
          if (items[j].type === 'section') { zoneId = items[j].id; break; }
        }
        const zoneInput = itemListEl.querySelector(`.add-item-row[data-zone-id="${zoneId}"] .add-item-input`);
        if (zoneInput) zoneInput.focus();
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

    // Determine default indent: one level deeper than last item in zone
    let indent = 0;
    for (let j = insertAt - 1; j >= 0; j--) {
      if (items[j].type === 'section') break;
      indent = Math.min(6, (items[j].indent || 0) + 1);
      break;
    }
    li.style.paddingLeft = (6 + indent * 20) + 'px';

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
        li.style.paddingLeft = (6 + indent * 20) + 'px';
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
    const markdown = serialize(currentTitle, items);
    await window.checklistAPI.write(currentPath, markdown);
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
    const newSection = { type: 'section', id: genId(), level: 1, text: 'New Section', collapsed: false };
    items.push(newSection);
    render();
    scheduleSave();
    const newLi = itemListEl.querySelector(`[data-sec-id="${newSection.id}"]`);
    if (newLi) newLi.querySelector('.section-title').focus();
  });
  document.getElementById('title-row').appendChild(addH1Btn);

  // --- Reload from disk ---
  async function reloadCurrent() {
    if (!currentPath || saveTimer) return;
    const markdown = await window.checklistAPI.read(currentPath);
    const parsed = parse(markdown);
    currentTitle = currentPath.replace(/.*[/\\]/, '');
    items = parsed.items;
    for (const item of items) {
      if (item.type === 'section') {
        item.collapsed = localStorage.getItem('sec-collapsed:' + item.id) === '1';
      }
    }
    titleEl.textContent = currentTitle;
    document.title = currentTitle + ' — Checklist';
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
