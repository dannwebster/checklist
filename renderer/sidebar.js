// Sidebar module: manages checklist list and folder controls
// Communicates with editor via custom events on window

const Sidebar = (() => {
  let dataDir = '';
  let checklists = [];
  let activeIndex = -1;

  const listEl = document.getElementById('checklist-list');
  const folderPathEl = document.getElementById('folder-path');

  async function load(dir) {
    dataDir = dir;
    folderPathEl.textContent = dir;
    checklists = await window.checklistAPI.list(dir);
    render();
    if (checklists.length > 0) openAt(0);
  }

  function render() {
    listEl.innerHTML = '';
    checklists.forEach((cl, i) => {
      const li = document.createElement('li');
      li.className = 'checklist-item' + (i === activeIndex ? ' active' : '');
      li.dataset.index = i;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'checklist-item-name';
      nameSpan.textContent = cl.name;

      const delBtn = document.createElement('button');
      delBtn.className = 'checklist-item-delete';
      delBtn.textContent = '×';
      delBtn.title = 'Delete checklist';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAt(i);
      });

      li.appendChild(nameSpan);
      li.appendChild(delBtn);
      li.addEventListener('click', () => openAt(i));
      listEl.appendChild(li);
    });
  }

  function openAt(index) {
    activeIndex = index;
    render();
    const cl = checklists[index];
    window.dispatchEvent(new CustomEvent('checklist-selected', { detail: cl }));
  }

  function setActive(filePath) {
    const index = checklists.findIndex(cl => cl.path === filePath);
    if (index >= 0) {
      activeIndex = index;
      render();
    }
  }

  function createNew() {
    if (listEl.querySelector('.new-checklist-input-row')) return;

    const li = document.createElement('li');
    li.className = 'checklist-item new-checklist-input-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'new-checklist-input';
    input.placeholder = 'Checklist name...';
    input.autocomplete = 'off';

    async function commit() {
      const name = input.value.trim().replace(/[\\/:*?"<>|]/g, '_');
      li.remove();
      if (!name) return;
      const filePath = await window.checklistAPI.create(dataDir, name);
      await refresh();
      const index = checklists.findIndex(cl => cl.path === filePath);
      if (index >= 0) openAt(index);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') li.remove();
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (li.isConnected) li.remove(); }, 150);
    });

    li.appendChild(input);
    listEl.insertBefore(li, listEl.firstChild);
    input.focus();
  }

  async function deleteAt(index) {
    const cl = checklists[index];
    if (!await window.checklistAPI.showConfirm(`Delete "${cl.name}"?`)) return;
    await window.checklistAPI.delete(cl.path);
    await refresh();
    if (activeIndex >= checklists.length) activeIndex = checklists.length - 1;
    if (checklists.length > 0) openAt(activeIndex >= 0 ? activeIndex : 0);
    else window.dispatchEvent(new CustomEvent('checklist-selected', { detail: null }));
  }

  async function refresh() {
    checklists = await window.checklistAPI.list(dataDir);
    render();
  }

  async function updateName(oldPath, newName) {
    const index = checklists.findIndex(cl => cl.path === oldPath);
    if (index >= 0) {
      checklists[index].name = newName;
      checklists[index].path = oldPath.replace(/[^/\\]+\.md$/, newName + '.md');
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
