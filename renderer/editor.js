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
  const addInput = document.getElementById('add-item-input');

  // --- Load ---
  async function loadChecklist(cl) {
    if (!cl) {
      currentPath = null;
      currentTitle = '';
      items = [];
      titleEl.textContent = '';
      document.title = 'Checklist';
      render();
      return;
    }
    currentPath = cl.path;
    const markdown = await window.checklistAPI.read(cl.path);
    const parsed = parse(markdown);
    currentTitle = parsed.title;
    items = parsed.items;
    titleEl.textContent = currentTitle;
    document.title = currentTitle + ' — Checklist';
    render();
  }

  // --- Render ---
  function render() {
    itemListEl.innerHTML = '';
    items.forEach((item, i) => {
      itemListEl.appendChild(buildItemRow(item, i));
    });
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
        addInput.focus();
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
      document.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.item-row').forEach(r => r.classList.remove('drag-over'));
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
    const row = itemListEl.children[index];
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

  function addItem(text) {
    if (!text.trim()) return;
    items.push({ id: genId(), checked: false, text: text.trim() });
    render();
    scheduleSave();
  }

  // --- Focus navigation ---
  function getFocusableEls() {
    return [titleEl, ...itemListEl.querySelectorAll('.item-text'), addInput];
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
    if (newName !== oldName) {
      const newPath = await window.checklistAPI.rename(currentPath, newName);
      const oldPath = currentPath;
      currentPath = newPath;
      currentTitle = newName;
      await Sidebar.updateName(oldPath, newName);
      document.title = newName + ' — Checklist';
    }
  });

  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
      addInput.focus();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(titleEl, 1);
    }
  });

  // --- Add item input ---
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addInput.value.trim()) {
      addItem(addInput.value);
      addInput.value = '';
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(addInput, -1);
    }
  });

  // --- Listen for selection ---
  window.addEventListener('checklist-selected', (e) => loadChecklist(e.detail));

  return {};
})();
