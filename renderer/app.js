// App entry point: initializes the app on load
(async () => {
  const dataDir = await window.checklistAPI.getDataDir();
  await Sidebar.load(dataDir);
})();

// Sidebar resize
(() => {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  const STORAGE_KEY = 'sidebarWidth';
  const MIN = 140;
  const MAX = 600;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) document.documentElement.style.setProperty('--sidebar-width', saved + 'px');

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('dragging');

    const onMove = (e) => {
      const w = Math.min(MAX, Math.max(MIN, e.clientX));
      document.documentElement.style.setProperty('--sidebar-width', w + 'px');
      localStorage.setItem(STORAGE_KEY, w);
    };

    const onUp = () => {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();
