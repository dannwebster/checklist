// Pure functions: markdown string <-> structured data
// No imports, no side effects.

const ITEM_RE = /^(\s*)- \[(x| )\] (.+?)(?:\s*<!-- id:([a-f0-9]{8}) -->)?$/i;

function genId() {
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

function parse(markdown) {
  const lines = markdown.split('\n').map(l => l.replace(/\r$/, ''));
  let title = '';
  const items = [];

  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    const m = line.match(ITEM_RE);
    if (m) {
      items.push({
        id: m[4] || genId(),
        checked: m[2].toLowerCase() === 'x',
        text: m[3].trim(),
        indent: Math.round(m[1].length / 2),
      });
    }
  }

  return { title, items };
}

function serialize(title, items) {
  let md = `# ${title}\n\n`;
  for (const item of items) {
    const check = item.checked ? 'x' : ' ';
    const prefix = '  '.repeat(item.indent || 0);
    md += `${prefix}- [${check}] ${item.text} <!-- id:${item.id} -->\n`;
  }
  return md;
}

// Export for ES module usage in renderer
if (typeof module !== 'undefined') {
  module.exports = { parse, serialize, genId };
}
