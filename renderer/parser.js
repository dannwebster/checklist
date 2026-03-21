// Pure functions: markdown string <-> structured data
// No imports, no side effects.

const ITEM_RE = /^(\s*)- \[(x| )\] (.+?)(?:\s*<!-- id:([a-f0-9]{8}) -->)?$/i;
const SECTION_RE = /^(#{1,3}) (.+?)(?:\s*<!-- sec:([a-f0-9]{8})(?:\s+cf:(show|hide))? -->)?$/;
const DOC_FILTER_RE = /^<!-- cf:(show|hide) -->$/;

function genId() {
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

function parse(markdown) {
  const lines = markdown.split('\n').map(l => l.replace(/\r$/, ''));
  let title = '';
  const items = [];
  let hadMissingIds = false;
  let docCompletedFilter = 'default';

  for (const line of lines) {
    const d = line.match(DOC_FILTER_RE);
    if (d) {
      docCompletedFilter = d[1];
      continue;
    }
    const s = line.match(SECTION_RE);
    if (s) {
      const id = s[3] || (hadMissingIds = true, genId());
      items.push({ type: 'section', id, level: s[1].length, text: s[2].trim(), collapsed: false, completedFilter: s[4] || 'default' });
      continue;
    }
    const m = line.match(ITEM_RE);
    if (m) {
      const id = m[4] || (hadMissingIds = true, genId());
      const rawText = m[3].trim();
      const colonIdx = rawText.indexOf(':');
      const itemText = colonIdx !== -1 ? rawText.slice(0, colonIdx).trimEnd() : rawText;
      const itemContext = colonIdx !== -1 ? rawText.slice(colonIdx + 1).trimStart() : undefined;
      const entry = { id, checked: m[2].toLowerCase() === 'x', text: itemText, indent: Math.round(m[1].length / 2) };
      if (itemContext) entry.context = itemContext;
      items.push(entry);
    }
  }

  return { title, items, hadMissingIds, docCompletedFilter };
}

function serialize(title, items, docCompletedFilter) {
  let md = '';
  if (docCompletedFilter === 'show' || docCompletedFilter === 'hide') {
    md += `<!-- cf:${docCompletedFilter} -->\n`;
  }
  for (const item of items) {
    if (item.type === 'section') {
      const hashes = '#'.repeat(item.level);
      const cf = item.completedFilter && item.completedFilter !== 'default' ? ` cf:${item.completedFilter}` : '';
      md += `\n${hashes} ${item.text} <!-- sec:${item.id}${cf} -->\n`;
      continue;
    }
    const check = item.checked ? 'x' : ' ';
    const prefix = '  '.repeat(item.indent || 0);
    const fullText = item.context ? `${item.text}: ${item.context}` : item.text;
    md += `${prefix}- [${check}] ${fullText} <!-- id:${item.id} -->\n`;
  }
  return md;
}

// Export for ES module usage in renderer
if (typeof module !== 'undefined') {
  module.exports = { parse, serialize, genId };
}
