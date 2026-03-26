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
  let lastEditorFocusEl = null;

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
    default: 'Completed: inherit — click to show all (Ctrl+Shift+H)',
    show: 'Completed: shown — click to hide (Ctrl+Shift+H)',
    hide: 'Completed: hidden — click to inherit (Ctrl+Shift+H)',
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
    toggle.title = item.collapsed ? 'Expand (Ctrl+E)' : 'Collapse (Ctrl+E)';
    toggle.addEventListener('click', () => toggleSection(index));

    const cf = item.completedFilter || 'default';
    const cfBtn = document.createElement('button');
    cfBtn.className = 'section-cf-btn';
    cfBtn.textContent = CF_LABELS[cf];
    cfBtn.title = CF_TITLES[cf];
    cfBtn.dataset.state = cf;
    cfBtn.addEventListener('click', () => cycleCompletedFilter(index));

    const secDueDate = extractDueDate(item.text);

    const secDateBadge = document.createElement('span');
    secDateBadge.className = 'item-due-badge';
    const secBadgeText = document.createElement('span');
    const secRemoveBtn = document.createElement('button');
    secRemoveBtn.className = 'item-due-remove';
    secRemoveBtn.textContent = '×';
    secRemoveBtn.title = 'Remove due date';
    secRemoveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await window.checklistAPI.showDialog('Remove due date?', 'Remove');
      if (!confirmed) return;
      items[index].text = stripDueDate(items[index].text).trimEnd();
      secDateBadge.hidden = true;
      secTitleEl.textContent = items[index].text;
      scheduleSave();
    });
    secDateBadge.appendChild(secBadgeText);
    secDateBadge.appendChild(secRemoveBtn);
    if (secDueDate) {
      secBadgeText.textContent = secDueDate;
      applyDueDateStyling(secDateBadge, secDueDate);
    } else {
      secDateBadge.hidden = true;
    }

    const secCalBtn = document.createElement('button');
    secCalBtn.className = 'item-cal-btn';
    secCalBtn.title = 'Set due date';
    secCalBtn.textContent = '📅';

    const secDateInput = document.createElement('input');
    secDateInput.type = 'date';
    secDateInput.className = 'item-date-input';

    secCalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = extractDueDate(items[index].text);
      if (existing) secDateInput.value = existing;
      secDateInput.showPicker();
    });

    secDateInput.addEventListener('change', () => {
      const newDate = secDateInput.value;
      if (!newDate) return;
      items[index].text = stripDueDate(items[index].text).trimEnd() + ' ' + newDate;
      secTitleEl.textContent = stripDueDate(items[index].text);
      secBadgeText.textContent = newDate;
      secDateBadge.hidden = false;
      applyDueDateStyling(secDateBadge, newDate);
      scheduleSave();
      secDateInput.value = '';
    });

    const tag = ['h1', 'h2', 'h3'][item.level - 1];
    const secTitleEl = document.createElement(tag);
    secTitleEl.className = 'section-title';
    secTitleEl.contentEditable = 'true';
    secTitleEl.spellcheck = true;
    secTitleEl.textContent = stripDueDate(item.text);
    secTitleEl.addEventListener('input', () => {
      items[index].text = secTitleEl.textContent;
      const d = extractDueDate(secTitleEl.textContent);
      if (d) {
        secBadgeText.textContent = d;
        secDateBadge.hidden = false;
        applyDueDateStyling(secDateBadge, d);
      } else {
        secDateBadge.hidden = true;
      }
      scheduleSave();
    });
    secTitleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); }
      if (e.key === 'ArrowUp' && !e.shiftKey) { e.preventDefault(); moveFocus(secTitleEl, -1); }
      if (e.key === 'ArrowDown' && !e.shiftKey) { e.preventDefault(); moveFocus(secTitleEl, 1); }
      if (e.key === 'Backspace' && e.ctrlKey) {
        e.preventDefault();
        items.splice(index, 1);
        render();
        scheduleSave();
        return;
      }
      if (e.key === 'Backspace' && secTitleEl.textContent === '') {
        e.preventDefault();
        items.splice(index, 1);
        render();
        scheduleSave();
        return;
      }
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
    li.appendChild(secDateBadge);
    li.appendChild(secCalBtn);
    li.appendChild(secDateInput);

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
    delBtn.title = 'Delete section — items remain (Ctrl+Backspace)';
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

  function applyDueDateStyling(badge, dateStr) {
    const today = new Date().toISOString().slice(0, 10);
    badge.classList.remove('due-overdue', 'due-today', 'due-future');
    if (dateStr < today) badge.classList.add('due-overdue');
    else if (dateStr === today) badge.classList.add('due-today');
    else badge.classList.add('due-future');
  }

  function renderItemText(el, text) {
    let html = stripDueDate(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Replace markdown links [label](url) before bare URLs to avoid double-linking
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a class="item-link" href="$2">$1</a>'
    );
    // Replace remaining bare URLs
    html = html.replace(
      /(?<!href=")(https?:\/\/[^\s<>"]+)/g,
      '<a class="item-link" href="$1">$1</a>'
    );
    el.innerHTML = html;
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
    renderItemText(textEl, item.text);

    // --- Due date badge & calendar button ---
    const dueDate = extractDueDate(item.text);

    const dateBadge = document.createElement('span');
    dateBadge.className = 'item-due-badge';
    const badgeText = document.createElement('span');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'item-due-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove due date';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await window.checklistAPI.showDialog('Remove due date?', 'Remove');
      if (!confirmed) return;
      items[index].text = stripDueDate(items[index].text).trimEnd();
      dateBadge.hidden = true;
      renderItemText(textEl, items[index].text);
      scheduleSave();
    });
    dateBadge.appendChild(badgeText);
    dateBadge.appendChild(removeBtn);
    if (dueDate) {
      badgeText.textContent = dueDate;
      applyDueDateStyling(dateBadge, dueDate);
    } else {
      dateBadge.hidden = true;
    }

    const calBtn = document.createElement('button');
    calBtn.className = 'item-cal-btn';
    calBtn.title = 'Set due date';
    calBtn.textContent = '📅';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'item-date-input';
    itemMain.appendChild(dateInput);

    calBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = extractDueDate(items[index].text);
      if (existing) dateInput.value = existing;
      dateInput.showPicker();
    });

    dateInput.addEventListener('change', () => {
      const newDate = dateInput.value;
      if (!newDate) return;
      items[index].text = stripDueDate(items[index].text).trimEnd() + ' ' + newDate;
      badgeText.textContent = newDate;
      dateBadge.hidden = false;
      applyDueDateStyling(dateBadge, newDate);
      renderItemText(textEl, items[index].text);
      scheduleSave();
      dateInput.value = '';
    });

    textEl.addEventListener('input', () => {
      items[index].text = textEl.textContent;
      const d = extractDueDate(items[index].text);
      if (d) {
        badgeText.textContent = d;
        dateBadge.hidden = false;
        applyDueDateStyling(dateBadge, d);
      } else {
        dateBadge.hidden = true;
      }
      scheduleSave();
    });
    textEl.addEventListener('focus', () => {
      textEl.textContent = items[index].text;
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
    textEl.addEventListener('blur', () => {
      renderItemText(textEl, items[index].text);
    });
    textEl.addEventListener('mousedown', (e) => {
      const link = e.target.closest('.item-link');
      if (link) {
        e.preventDefault(); // prevents focus from firing, keeping link rendering intact
        window.checklistAPI.openExternal(link.href);
      }
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === ':' && !items[index].contextExpanded) {
        const currentText = textEl.textContent;
        // Don't trigger if the colon will complete a URL scheme (e.g. user is typing http://)
        if (/https?$/i.test(currentText)) return;
        const stripped = currentText.replace(/https?:\/\/[^\s]*/gi, '');
        const nonUrlColons = (stripped.match(/:/g) || []).length;
        if (nonUrlColons === 0) {
          e.preventDefault();
          toggleContext();
        }
      }
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
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        if (index === 0) return;
        const blockEnd = getItemBlockEnd(index);
        const block = items.splice(index, blockEnd - index);
        items.splice(index - 1, 0, ...block);
        render();
        scheduleSave();
        itemListEl.querySelector(`[data-id="${block[0].id}"] .item-text`)?.focus();
        return;
      }
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        const blockEnd = getItemBlockEnd(index);
        if (blockEnd >= items.length || items[blockEnd].type === 'section') return;
        const block = items.splice(index, blockEnd - index);
        items.splice(index + 1, 0, ...block);
        render();
        scheduleSave();
        itemListEl.querySelector(`[data-id="${block[0].id}"] .item-text`)?.focus();
        return;
      }
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        if (isCaretOnFirstLine(textEl)) {
          e.preventDefault();
          moveFocus(textEl, -1);
        }
      }
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        if (isCaretOnLastLine(textEl)) {
          e.preventDefault();
          moveFocus(textEl, 1);
        }
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey) {
        if (isCaretAtStart(textEl)) {
          e.preventDefault();
          const els = Array.from(getFocusableEls());
          const i = els.indexOf(textEl);
          const target = els[i - 1];
          if (target) {
            target.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
      if (e.key === 'ArrowRight' && !e.shiftKey) {
        if (isCaretAtEnd(textEl)) {
          e.preventDefault();
          const els = Array.from(getFocusableEls());
          const i = els.indexOf(textEl);
          const target = els[i + 1];
          if (target) {
            target.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
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
      if (e.key === ' ' && e.ctrlKey) {
        e.preventDefault();
        toggleItem(index);
      }
      if (e.key === 'Backspace' && e.ctrlKey) {
        e.preventDefault();
        removeItem(index);
        return;
      }
      if (e.key === 'Backspace' && textEl.textContent === '') {
        e.preventDefault();
        removeItem(index);
      }
      if (e.key === 'h' && e.ctrlKey) {
        e.preventDefault();
        let level = 1;
        for (let i = index - 1; i >= 0; i--) {
          if (items[i].type === 'section') { level = items[i].level; break; }
        }
        const blockEnd = getItemBlockEnd(index);
        const newSection = { type: 'section', id: genId(), level, text: '', collapsed: false, completedFilter: 'default' };
        const newItem = { id: genId(), checked: false, text: '', indent: 0 };
        items.splice(blockEnd, 0, newSection, newItem);
        render();
        scheduleSave();
        const newEl = itemListEl.querySelector(`[data-sec-id="${newSection.id}"] .section-title`);
        if (newEl) newEl.focus();
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
    delBtn.title = 'Delete item (Ctrl+Backspace)';
    delBtn.addEventListener('click', () => removeItem(index));

    // --- Context area ---
    const contextArea = document.createElement('div');
    contextArea.className = 'item-context-area';
    contextArea.hidden = !item.contextExpanded;

    const contextTextEl = document.createElement('textarea');
    contextTextEl.className = 'item-context-text';
    contextTextEl.placeholder = 'Add context...';
    contextTextEl.value = item.context || '';
    function autoResizeContext() {
      contextTextEl.style.height = 'auto';
      contextTextEl.style.height = contextTextEl.scrollHeight + 'px';
    }
    if (item.contextExpanded) requestAnimationFrame(autoResizeContext);
    contextTextEl.addEventListener('input', () => {
      items[index].context = contextTextEl.value || undefined;
      contextBtn.textContent = items[index].context ? '▾' : '▸';
      li.classList.toggle('has-context', !!items[index].context);
      autoResizeContext();
      scheduleSave();
    });
    contextTextEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (items[index].contextExpanded) toggleContext();
        focusAtEnd(textEl);
      }
      if (e.key === 'Backspace' && (e.ctrlKey || contextTextEl.value === '')) {
        e.preventDefault();
        items[index].context = undefined;
        contextTextEl.value = '';
        items[index].text = (items[index].text || '').replace(/:+$/, '').trimEnd();
        if (items[index].contextExpanded) toggleContext();
        textEl.textContent = items[index].text;
        focusAtEnd(textEl);
        scheduleSave();
      }
      if (e.key === 'ArrowUp' && !e.shiftKey) { e.preventDefault(); moveFocus(contextTextEl, -1); }
      if (e.key === 'ArrowDown' && !e.shiftKey) { e.preventDefault(); moveFocus(contextTextEl, 1); }
    });
    contextArea.appendChild(contextTextEl);

    function focusAtEnd(el) {
      el.focus();
      if (el.tagName === 'TEXTAREA') {
        el.selectionStart = el.selectionEnd = el.value.length;
      } else {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    function toggleContext() {
      items[index].contextExpanded = !items[index].contextExpanded;
      contextArea.hidden = !items[index].contextExpanded;
      contextBtn.textContent = items[index].contextExpanded ? '▾' : '▸';
      li.classList.toggle('has-context', items[index].contextExpanded || !!items[index].context);
      if (items[index].contextExpanded) {
        autoResizeContext();
        focusAtEnd(contextTextEl);
      }
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
    itemMain.appendChild(dateBadge);
    itemMain.appendChild(calBtn);
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
    const all = [titleEl, ...itemListEl.querySelectorAll('.section-title, .item-text, .item-context-text')];
    return all.filter(el => {
      if (el.classList.contains('item-context-text')) {
        return !el.closest('.item-context-area').hidden;
      }
      return true;
    });
  }

  function isCaretOnFirstLine(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return true;
    // getClientRects() returns a non-zero rect for collapsed ranges in Chromium;
    // getBoundingClientRect() on a collapsed range returns zero and cannot be used.
    const rects = sel.getRangeAt(0).getClientRects();
    if (!rects.length) return true;
    const caretRect = rects[0];
    return caretRect.top < el.getBoundingClientRect().top + caretRect.height;
  }

  function isCaretOnLastLine(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return true;
    const rects = sel.getRangeAt(0).getClientRects();
    if (!rects.length) return true;
    const caretRect = rects[0];
    return caretRect.bottom > el.getBoundingClientRect().bottom - caretRect.height;
  }

  function isCaretAtStart(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    if (range.startOffset !== 0) return false;
    const container = range.startContainer;
    return container === el || container === el.firstChild;
  }

  function isCaretAtEnd(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const endRange = document.createRange();
    endRange.selectNodeContents(el);
    endRange.collapse(false);
    return range.compareBoundaryPoints(Range.END_TO_END, endRange) === 0;
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
    const show = isGitRepo && !!currentPath;
    gitCommitBtn.style.display = show ? '' : 'none';
    gitCommitBtn.disabled = isCommitting || !isGitDirty;
    gitCommitBtn.textContent = isCommitting ? 'committing\u2026' : 'commit';
    gitRevertBtn.style.display = show ? '' : 'none';
    gitRevertBtn.disabled = isCommitting || !isGitDirty;
    titleEl.classList.toggle('git-dirty', isGitRepo && isGitDirty);
  }

  document.getElementById('editor-content').addEventListener('focusin', (e) => {
    lastEditorFocusEl = e.target;
  });

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
  addH1Btn.title = 'Add top-level section (Ctrl+H)';
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
  gitCommitBtn.title = 'Commit this file to git (Ctrl+Shift+G)';
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

  // --- Git revert button ---
  const gitRevertBtn = document.createElement('button');
  gitRevertBtn.id = 'git-revert-btn';
  gitRevertBtn.textContent = 'revert';
  gitRevertBtn.title = 'Revert file to last committed state (Ctrl+Shift+Z)';
  gitRevertBtn.style.display = 'none';
  gitRevertBtn.addEventListener('click', async () => {
    if (!currentPath || isCommitting) return;
    const basename = currentPath.replace(/.*[/\\]/, '');
    const confirmed = await window.checklistAPI.showDialog(
      `Revert "${basename}" to its last committed state? All unsaved changes will be lost.`,
      'Revert'
    );
    if (!confirmed) return;
    const result = await window.checklistAPI.gitRevert(currentPath);
    if (result.success) {
      await reloadCurrent();
      await refreshGitStatus();
    }
  });
  document.getElementById('title-row').appendChild(gitRevertBtn);

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

  // --- Global hotkeys ---
  function findSectionIndexForFocus() {
    const active = document.activeElement;
    if (!active) return -1;
    const secLi = active.closest('[data-sec-id]');
    if (secLi) {
      return items.findIndex(it => it.type === 'section' && it.id === secLi.dataset.secId);
    }
    const itemLi = active.closest('[data-id]');
    if (itemLi) {
      const itemIdx = items.findIndex(it => it.id === itemLi.dataset.id);
      for (let i = itemIdx - 1; i >= 0; i--) {
        if (items[i].type === 'section') return i;
      }
    }
    return -1;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' && e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (document.activeElement?.closest('#sidebar')) {
        (lastEditorFocusEl || titleEl).focus();
      } else {
        Sidebar.focusSidebar();
      }
    }
    if (e.key === 'G' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (!gitCommitBtn.disabled) gitCommitBtn.click();
    }
    if (e.key === 'Z' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (gitRevertBtn.style.display !== 'none' && !gitRevertBtn.disabled) gitRevertBtn.click();
    }
    if (e.key === 'e' && e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      const idx = findSectionIndexForFocus();
      if (idx === -1) return;
      const secId = items[idx].id;
      toggleSection(idx);
      const secTitleEl = itemListEl.querySelector(`[data-sec-id="${secId}"] .section-title`);
      if (secTitleEl) secTitleEl.focus();
    }
    if (e.key === 'H' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (!currentPath) return;
      const states = ['default', 'show', 'hide'];
      const secIdx = findSectionIndexForFocus();
      // Save focus identity before render destroys the DOM
      const active = document.activeElement;
      const focusSecId = active?.closest('[data-sec-id]')?.dataset.secId;
      const focusItemId = active?.closest('[data-id]')?.dataset.id;
      const focusIsContext = active?.classList.contains('item-context-text');
      if (secIdx !== -1) {
        const cur = items[secIdx].completedFilter || 'default';
        items[secIdx].completedFilter = states[(states.indexOf(cur) + 1) % 3];
      } else {
        docCompletedFilter = states[(states.indexOf(docCompletedFilter) + 1) % 3];
        updateDocFilterBtn();
      }
      render();
      // Restore focus
      if (focusSecId) {
        itemListEl.querySelector(`[data-sec-id="${focusSecId}"] .section-title`)?.focus();
      } else if (focusItemId) {
        const li = itemListEl.querySelector(`[data-id="${focusItemId}"]`);
        li?.querySelector(focusIsContext ? '.item-context-text' : '.item-text')?.focus();
      }
      scheduleSave();
    }
  });

  // --- Auto-scroll during drag ---
  itemListEl.addEventListener('dragover', (e) => {
    if (dragSrcIndex === null) return;
    const rect = itemListEl.getBoundingClientRect();
    const ZONE = 60;
    const SPEED = 10;
    if (e.clientY < rect.top + ZONE) {
      itemListEl.scrollBy(0, -SPEED);
    } else if (e.clientY > rect.bottom - ZONE) {
      itemListEl.scrollBy(0, SPEED);
    }
  });

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
