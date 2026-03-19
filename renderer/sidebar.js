// Sidebar module: manages checklist file tree and folder controls
// Communicates with editor via custom events on window

const Sidebar = (() => {
  let dataDir = '';
  let checklists = [];
  let activePath = null;
  let collapsedDirs = new Set(JSON.parse(localStorage.getItem('collapsedDirs') || '[]'));

  const listEl = document.getElementById('checklist-list');
  const folderPathEl = document.getElementById('folder-path');

  async function load(dir) {
    dataDir = dir;
    folderPathEl.textContent = dir;
    checklists = await window.checklistAPI.list(dir);
    render();
    if (checklists.length > 0) openCl(checklists[0]);
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
    const tree = buildTree(checklists);
    const rootName = dataDir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dataDir;
    renderDir({ name: rootName, children: tree.children }, listEl, '', 0, true);
  }

  function renderChildren(node, container, dirPath, depth) {
    for (const child of sortedChildren(node)) {
      if (child.type === 'dir') {
        renderDir(child, container, dirPath, depth);
      } else {
        renderFile(child, container, depth);
      }
    }
  }

  function renderDir(node, container, parentPath, depth, isRoot = false) {
    const fullDirPath = isRoot ? '' : (parentPath ? parentPath + '/' + node.name : node.name);
    const isCollapsed = collapsedDirs.has(fullDirPath || '__root__');

    const dirEl = document.createElement('div');
    dirEl.className = 'tree-dir';

    const headerEl = document.createElement('div');
    headerEl.className = 'tree-dir-header' + (isRoot ? ' root' : '');
    headerEl.style.paddingLeft = (16 + depth * 16) + 'px';

    const toggleEl = document.createElement('span');
    toggleEl.className = 'tree-toggle';
    toggleEl.textContent = isCollapsed ? '▶' : '▼';

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-dir-name';
    nameEl.textContent = node.name;

    headerEl.appendChild(toggleEl);
    headerEl.appendChild(nameEl);
    dirEl.appendChild(headerEl);

    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-dir-children';
    if (isCollapsed) childrenEl.style.display = 'none';
    renderChildren(node, childrenEl, fullDirPath, depth + 1);
    dirEl.appendChild(childrenEl);

    headerEl.addEventListener('click', () => {
      const key = fullDirPath || '__root__';
      if (collapsedDirs.has(key)) {
        collapsedDirs.delete(key);
        childrenEl.style.display = '';
        toggleEl.textContent = '▼';
      } else {
        collapsedDirs.add(key);
        childrenEl.style.display = 'none';
        toggleEl.textContent = '▶';
      }
      localStorage.setItem('collapsedDirs', JSON.stringify([...collapsedDirs]));
    });

    container.appendChild(dirEl);
  }

  function renderFile(node, container, depth) {
    const cl = node.cl;
    const el = document.createElement('div');
    el.className = 'checklist-item' + (cl.path === activePath ? ' active' : '');
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
    el.addEventListener('click', () => openCl(cl));
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

  function createNew() {
    if (listEl.querySelector('.new-checklist-input-row')) return;

    const row = document.createElement('div');
    row.className = 'checklist-item new-checklist-input-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'new-checklist-input';
    input.placeholder = 'Checklist name...';
    input.autocomplete = 'off';

    async function commit() {
      const name = input.value.trim().replace(/[\\/:*?"<>|]/g, '_');
      row.remove();
      if (!name) return;
      const filePath = await window.checklistAPI.create(dataDir, name);
      await refresh();
      const cl = checklists.find(c => c.path === filePath);
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
    listEl.insertBefore(row, listEl.firstChild);
    input.focus();
  }

  async function deleteCl(cl) {
    if (!await window.checklistAPI.showConfirm(`Delete "${cl.name}"?`)) return;
    await window.checklistAPI.delete(cl.path);
    if (activePath === cl.path) activePath = null;
    await refresh();
    if (activePath === null && checklists.length > 0) openCl(checklists[0]);
    else if (checklists.length === 0) window.dispatchEvent(new CustomEvent('checklist-selected', { detail: null }));
  }

  async function refresh() {
    checklists = await window.checklistAPI.list(dataDir);
    render();
  }

  async function updateName(oldPath, newName) {
    const cl = checklists.find(c => c.path === oldPath);
    if (cl) {
      cl.name = cl.name.replace(/[^/]+$/, newName + '.md');
      cl.path = oldPath.replace(/[^/\\]+\.md$/, newName + '.md');
      if (activePath === oldPath) activePath = cl.path;
      render();
    }
  }

  function getDataDir() { return dataDir; }

  // Wire DOM events
  document.getElementById('btn-new').addEventListener('click', createNew);

  document.getElementById('btn-folder').addEventListener('click', async () => {
    const newDir = await window.checklistAPI.setDataDir();
    if (newDir) await load(newDir);
  });

  window.checklistAPI.onMenuNewChecklist(() => createNew());
  window.checklistAPI.onMenuOpenFolder(async () => {
    const newDir = await window.checklistAPI.setDataDir();
    if (newDir) await load(newDir);
  });

  return { load, refresh, updateName, setActive, getDataDir };
})();
