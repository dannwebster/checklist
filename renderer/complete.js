// Pure function: move all checked task items into a "Completed" H1 section.
// Returns a new items array; the original is not mutated.
// genIdFn is injected so callers (and tests) can supply their own id generator.

function collectCompleted(items, genIdFn) {
  const checkedItems = items.filter(it => !it.type && it.checked);
  if (!checkedItems.length) return items.slice();

  const checkedIds = new Set(checkedItems.map(it => it.id));
  const remaining = items.filter(it => !checkedIds.has(it.id));

  let secIdx = remaining.findIndex(
    it => it.type === 'section' && it.level === 1 && it.text.trim().toLowerCase() === 'completed'
  );
  if (secIdx === -1) {
    remaining.push({ type: 'section', id: genIdFn(), level: 1, text: 'Completed', collapsed: false, completedFilter: 'default' });
    secIdx = remaining.length - 1;
  }

  let insertAt = secIdx + 1;
  while (insertAt < remaining.length) {
    if (remaining[insertAt].type === 'section' && remaining[insertAt].level <= 1) break;
    insertAt++;
  }

  remaining.splice(insertAt, 0, ...checkedItems);
  return remaining;
}

if (typeof module !== 'undefined') {
  module.exports = { collectCompleted };
}
