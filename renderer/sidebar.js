// Sidebar module: manages checklist file tree and folder controls
// Communicates with editor via custom events on window

const Sidebar = (() => {
  let dataDirs = [];
  let checklistsByRoot = new Map(); // rootDir -> checklist[]
  let activePath = null;
  let collapsedDirs = new Set(JSON.parse(localStorage.getItem('collapsedDirs') || '[]'));
  let dirContainers = new Map(); // absPath -> childrenEl (populated during render)
  let gitDirtyPaths = new Set();

  const listEl = document.getElementById('checklist-list');

  function getSidebarFocusableEls() {
    return Array.from(document.querySelectorAll(
      '#checklist-list .tree-dir-header, #checklist-list .checklist-item'
    )).filter(el => el.offsetParent !== null);
  }

  function moveSidebarFocus(current, delta) {
    const els = getSidebarFocusableEls();
    const i = els.indexOf(current);
    if (i === -1) return;
    const target = els[i + delta];
    if (target) target.focus();
  }

  function focusSidebar() {
    const active = document.querySelector('#checklist-list .checklist-item.active');
    if (active) { active.focus(); return; }
    const first = getSidebarFocusableEls()[0];
    if (first) first.focus();
  }

  function returnToEditor() {
    const editorTitle = document.getElementById('editor-title');
    if (editorTitle) editorTitle.focus();
  }

  async function load(dirs) {
    dataDirs = dirs.slice();
    for (const dir of dataDirs) {
      checklistsByRoot.set(dir, await window.checklistAPI.list(dir));
    }
    render();
    for (const cls of checklistsByRoot.values()) {
      if (cls.length > 0) { openCl(cls[0]); break; }
    }
  }

  function buildTree(items) {
    const root = { children: {} };
    for (const cl of items) {
      const parts = cl.name.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node.children[parts[i]]) {
          node.children[parts[i]] = { type: 'dir', name: parts[i], children: {} };
        }
        node = node.children[parts[i]];
      }
      const fname = parts[parts.length - 1];
      node.children[fname] = { type: 'file', name: fname, cl };
    }
    return root;
  }

  function sortedChildren(node) {
    return Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  function render() {
    listEl.innerHTML = '';
    dirContainers = new Map();
    for (const rootDir of dataDirs) {
      const cls = checklistsByRoot.get(rootDir) || [];
      const tree = buildTree(cls);
      const rootName = rootDir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || rootDir;
      renderRootDir({ name: rootName, children: tree.children }, rootDir);
    }
  }

  function makeIconBtn(cls, text, title, onClick) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  function makeDirActions(...btns) {
    const el = document.createElement('span');
    el.className = 'tree-dir-actions';
    for (const btn of btns) el.appendChild(btn);
    return el;
  }

  function renderRootDir(node, rootDir) {
    const collapseKey = rootDir;
    const isCollapsed = collapsedDirs.has(collapseKey);

    const dirEl = document.createElement('div');
    dirEl.className = 'tree-dir';

    const headerEl = document.createElement('div');
    headerEl.className = 'tree-dir-header root';
    headerEl.style.paddingLeft = '16px';

    const toggleEl = document.createElement('span');
    toggleEl.className = 'tree-toggle';
    toggleEl.textContent = isCollapsed ? '▶' : '▼';

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-dir-name';
    nameEl.textContent = node.name;

    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-dir-children';
    if (isCollapsed) childrenEl.style.display = 'none';
    dirContainers.set(rootDir, childrenEl);

    const addBtn = makeIconBtn('tree-dir-add', '+', 'New checklist in this folder (Ctrl+N)',
      () => createNew(rootDir, childrenEl, 1));
    const removeBtn = makeIconBtn('tree-dir-remove', '×', 'Remove this root folder',
      async () => {
        if (!await window.checklistAPI.showDialog(`Remove folder "${rootDir}" from your collection?`, 'Remove from Collection')) return;
        const updated = await window.checklistAPI.removeDataDir(rootDir);
        dataDirs = updated;
        checklistsByRoot.delete(rootDir);
        const stillActive = [...checklistsByRoot.values()].flat().some(c => c.path === activePath);
        if (!stillActive) activePath = null;
        render();
        if (activePath === null) {
          const allCls = [...checklistsByRoot.values()].flat();
          if (allCls.length > 0) openCl(allCls[0]);
          else window.dispatchEvent(new CustomEvent('checklist-selected', { detail: null }));
        }
      });

    headerEl.appendChild(toggleEl);
    headerEl.appendChild(nameEl);
    headerEl.appendChild(makeDirActions(addBtn, removeBtn));
    dirEl.appendChild(headerEl);

    renderChildren(node, childrenEl, rootDir, '', 1);
    dirEl.appendChild(childrenEl);

    headerEl.tabIndex = 0;
    headerEl.addEventListener('click', () => {
      if (collapsedDirs.has(collapseKey)) {
        collapsedDirs.delete(collapseKey);
        childrenEl.style.display = '';
        toggleEl.textContent = '▼';
      } else {
        collapsedDirs.add(collapseKey);
        childrenEl.style.display = 'none';
        toggleEl.textContent = '▶';
      }
      localStorage.setItem('collapsedDirs', JSON.stringify([...collapsedDirs]));
    });
    headerEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSidebarFocus(headerEl, 1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveSidebarFocus(headerEl, -1); }
      if (e.key === 'Enter')     { e.preventDefault(); headerEl.click(); }
      if (e.key === 'Escape')    { e.preventDefault(); returnToEditor(); }
    });

    listEl.appendChild(dirEl);
  }

  function renderChildren(node, container, rootDir, relDirPath, depth) {
    for (const child of sortedChildren(node)) {
      if (child.type === 'dir') {
        renderDir(child, container, rootDir, relDirPath, depth);
      } else {
        renderFile(child, container, depth);
      }
    }
  }

  function renderDir(node, container, rootDir, parentRelPath, depth) {
    const relPath = parentRelPath ? parentRelPath + '/' + node.name : node.name;
    const collapseKey = rootDir + '::' + relPath;
    const absDirPath = rootDir.replace(/\\/g, '/') + '/' + relPath;
    const isCollapsed = collapsedDirs.has(collapseKey);

    const dirEl = document.createElement('div');
    dirEl.className = 'tree-dir';

    const headerEl = document.createElement('div');
    headerEl.className = 'tree-dir-header';
    headerEl.style.paddingLeft = (16 + depth * 16) + 'px';

    const toggleEl = document.createElement('span');
    toggleEl.className = 'tree-toggle';
    toggleEl.textContent = isCollapsed ? '▶' : '▼';

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-dir-name';
    nameEl.textContent = node.name;

    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-dir-children';
    if (isCollapsed) childrenEl.style.display = 'none';
    dirContainers.set(absDirPath, childrenEl);

    const addBtn = makeIconBtn('tree-dir-add', '+', 'New checklist in this subfolder',
      () => createNew(absDirPath, childrenEl, depth + 1));

    headerEl.appendChild(toggleEl);
    headerEl.appendChild(nameEl);
    headerEl.appendChild(makeDirActions(addBtn));
    dirEl.appendChild(headerEl);

    renderChildren(node, childrenEl, rootDir, relPath, depth + 1);
    dirEl.appendChild(childrenEl);

    headerEl.tabIndex = 0;
    headerEl.addEventListener('click', () => {
      if (collapsedDirs.has(collapseKey)) {
        collapsedDirs.delete(collapseKey);
        childrenEl.style.display = '';
        toggleEl.textContent = '▼';
      } else {
        collapsedDirs.add(collapseKey);
        childrenEl.style.display = 'none';
        toggleEl.textContent = '▶';
      }
      localStorage.setItem('collapsedDirs', JSON.stringify([...collapsedDirs]));
    });
    headerEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSidebarFocus(headerEl, 1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveSidebarFocus(headerEl, -1); }
      if (e.key === 'Enter')     { e.preventDefault(); headerEl.click(); }
      if (e.key === 'Escape')    { e.preventDefault(); returnToEditor(); }
    });

    container.appendChild(dirEl);
  }

  function renderFile(node, container, depth) {
    const cl = node.cl;
    const el = document.createElement('div');
    el.className = 'checklist-item'
      + (cl.path === activePath ? ' active' : '')
      + (gitDirtyPaths.has(cl.path) ? ' git-dirty' : '');
    el.style.paddingLeft = (16 + depth * 16) + 'px';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'checklist-item-name';
    nameSpan.textContent = node.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'checklist-item-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Delete checklist';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCl(cl);
    });

    el.appendChild(nameSpan);
    el.appendChild(delBtn);
    el.tabIndex = 0;
    el.addEventListener('click', () => openCl(cl));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSidebarFocus(el, 1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveSidebarFocus(el, -1); }
      if (e.key === 'Enter')     { e.preventDefault(); openCl(cl); }
      if (e.key === 'Escape')    { e.preventDefault(); returnToEditor(); }
    });
    el.addEventListener('dragover', (e) => {
      if (!window._editorDragging) return;
      if (cl.path === activePath) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!window._editorDragging) return;
      if (cl.path === activePath) return;
      window.dispatchEvent(new CustomEvent('editor-to-sidebar-drop', {
        detail: { destPath: cl.path, destName: node.name }
      }));
    });
    container.appendChild(el);
  }

  function openCl(cl) {
    activePath = cl.path;
    render();
    window.dispatchEvent(new CustomEvent('checklist-selected', { detail: cl }));
  }

  function setActive(filePath) {
    activePath = filePath;
    render();
  }

  function createNew(targetDir, container, depth) {
    if (!container && dataDirs.length > 0) {
      targetDir = dataDirs[0];
      container = dirContainers.get(dataDirs[0]);
      depth = 1;
    }
    if (!container) return;
    if (container.querySelector('.new-checklist-input-row')) return;

    const row = document.createElement('div');
    row.className = 'checklist-item new-checklist-input-row';
    row.style.paddingLeft = (16 + depth * 16) + 'px';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'new-checklist-input';
    input.placeholder = 'Checklist name...';
    input.autocomplete = 'off';

    async function commit() {
      const name = input.value.trim().replace(/[\\/:*?"<>|]/g, '_');
      row.remove();
      if (!name) return;
      const filePath = await window.checklistAPI.create(targetDir, name);
      await refresh();
      const allCls = [...checklistsByRoot.values()].flat();
      const cl = allCls.find(c => c.path === filePath);
      if (cl) openCl(cl);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') row.remove();
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (row.isConnected) row.remove(); }, 150);
    });

    row.appendChild(input);
    container.insertBefore(row, container.firstChild);
    input.focus();
  }

  async function deleteCl(cl) {
    if (!await window.checklistAPI.showConfirm(`Delete "${cl.name}"?`)) return;
    await window.checklistAPI.delete(cl.path);
    if (activePath === cl.path) activePath = null;
    await refresh();
    const allCls = [...checklistsByRoot.values()].flat();
    if (activePath === null && allCls.length > 0) openCl(allCls[0]);
    else if (allCls.length === 0) window.dispatchEvent(new CustomEvent('checklist-selected', { detail: null }));
  }

  async function refresh() {
    for (const dir of dataDirs) {
      checklistsByRoot.set(dir, await window.checklistAPI.list(dir));
    }
    render();
  }

  async function updateName(oldPath, newName) {
    for (const cls of checklistsByRoot.values()) {
      const cl = cls.find(c => c.path === oldPath);
      if (cl) {
        cl.name = cl.name.replace(/[^/]+$/, newName + '.md');
        cl.path = oldPath.replace(/[^/\\]+\.md$/, newName + '.md');
        if (activePath === oldPath) activePath = cl.path;
        render();
        break;
      }
    }
  }

  async function addRoot() {
    const updated = await window.checklistAPI.addDataDir();
    if (!updated) return;
    dataDirs = updated;
    for (const dir of dataDirs) {
      if (!checklistsByRoot.has(dir)) {
        checklistsByRoot.set(dir, await window.checklistAPI.list(dir));
      }
    }
    render();
  }

  // Wire DOM events
  document.getElementById('btn-folder').addEventListener('click', addRoot);

  window.checklistAPI.onMenuNewChecklist(() => {
    if (dataDirs.length === 0) return;
    createNew(dataDirs[0], dirContainers.get(dataDirs[0]), 1);
  });

  window.checklistAPI.onMenuOpenFolder(() => addRoot());

  window.checklistAPI.onDirChanged(() => Sidebar.refresh());

  function setGitDirty(filePath, isDirty) {
    if (isDirty) gitDirtyPaths.add(filePath);
    else gitDirtyPaths.delete(filePath);
    render();
  }

  return { load, refresh, updateName, setActive, setGitDirty, focusSidebar };
})();
