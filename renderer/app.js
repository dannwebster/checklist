// App entry point: initializes the app on load
(async () => {
  const dataDir = await window.checklistAPI.getDataDir();
  await Sidebar.load(dataDir);
})();
