import { describe, it, expect } from 'vitest';
import { parse, serialize, genId, extractDueDate, stripDueDate } from '../../renderer/parser.js';

// ─── genId ────────────────────────────────────────────────────────────────────

describe('genId', () => {
  it('returns an 8-character hex string', () => {
    expect(genId()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns different values on successive calls', () => {
    expect(genId()).not.toBe(genId());
  });
});

// ─── extractDueDate ───────────────────────────────────────────────────────────

describe('extractDueDate', () => {
  it('returns null when no date present', () => {
    expect(extractDueDate('buy milk')).toBeNull();
  });

  it('returns the ISO date string when present', () => {
    expect(extractDueDate('buy milk 2026-03-24')).toBe('2026-03-24');
  });

  it('finds date embedded in the middle of text', () => {
    expect(extractDueDate('due 2026-01-15 today')).toBe('2026-01-15');
  });

  it('returns null for non-ISO partial dates', () => {
    expect(extractDueDate('03-24')).toBeNull();
    expect(extractDueDate('2026-03')).toBeNull();
  });
});

// ─── stripDueDate ─────────────────────────────────────────────────────────────

describe('stripDueDate', () => {
  it('returns text unchanged when no date present', () => {
    expect(stripDueDate('buy milk')).toBe('buy milk');
  });

  it('removes trailing date and trims', () => {
    expect(stripDueDate('buy milk 2026-03-24')).toBe('buy milk');
  });

  it('removes mid-text date and collapses double spaces', () => {
    expect(stripDueDate('due 2026-01-15 today')).toBe('due today');
  });

  it('handles date-only string', () => {
    expect(stripDueDate('2026-03-24')).toBe('');
  });
});

// ─── parse — items ────────────────────────────────────────────────────────────

describe('parse — empty input', () => {
  it('returns empty structure for empty string', () => {
    const result = parse('');
    expect(result).toEqual({ title: '', items: [], hadMissingIds: false, docCompletedFilter: 'default' });
  });
});

describe('parse — items', () => {
  it('parses an unchecked item with id', () => {
    const { items } = parse('- [ ] task text <!-- id:abc12345 -->');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ checked: false, text: 'task text', indent: 0, id: 'abc12345' });
  });

  it('parses a checked item', () => {
    const { items } = parse('- [x] done task <!-- id:abc12345 -->');
    expect(items[0].checked).toBe(true);
  });

  it('parses uppercase X as checked', () => {
    const { items } = parse('- [X] done task <!-- id:abc12345 -->');
    expect(items[0].checked).toBe(true);
  });

  it('calculates indent:1 from 2 leading spaces', () => {
    const { items } = parse('  - [ ] indented <!-- id:abc12345 -->');
    expect(items[0].indent).toBe(1);
  });

  it('calculates indent:2 from 4 leading spaces', () => {
    const { items } = parse('    - [ ] double indent <!-- id:abc12345 -->');
    expect(items[0].indent).toBe(2);
  });

  it('splits context at first colon', () => {
    const { items } = parse('- [ ] task: some context <!-- id:abc12345 -->');
    expect(items[0].text).toBe('task');
    expect(items[0].context).toBe('some context');
  });

  it('does not split on :// (URL protection)', () => {
    const { items } = parse('- [ ] https://example.com <!-- id:abc12345 -->');
    expect(items[0].text).toBe('https://example.com');
    expect(items[0].context).toBeUndefined();
  });

  it('does not add context property when no colon', () => {
    const { items } = parse('- [ ] plain text <!-- id:abc12345 -->');
    expect(items[0]).not.toHaveProperty('context');
  });

  it('sets hadMissingIds:true when id comment is absent', () => {
    const { hadMissingIds, items } = parse('- [ ] no id here');
    expect(hadMissingIds).toBe(true);
    expect(items[0].id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('sets hadMissingIds:false when all items have ids', () => {
    const { hadMissingIds } = parse('- [ ] task <!-- id:abc12345 -->');
    expect(hadMissingIds).toBe(false);
  });
});

// ─── parse — sections ─────────────────────────────────────────────────────────

describe('parse — sections', () => {
  it('parses an H1 section', () => {
    const { items } = parse('# My Title <!-- sec:abc12345 -->');
    expect(items[0]).toMatchObject({
      type: 'section', level: 1, text: 'My Title', id: 'abc12345',
      collapsed: false, completedFilter: 'default',
    });
  });

  it('parses an H2 section', () => {
    const { items } = parse('## Sub <!-- sec:abc12345 -->');
    expect(items[0].level).toBe(2);
  });

  it('parses an H3 section', () => {
    const { items } = parse('### Sub Sub <!-- sec:abc12345 -->');
    expect(items[0].level).toBe(3);
  });

  it('parses section completedFilter:hide', () => {
    const { items } = parse('# Title <!-- sec:abc12345 cf:hide -->');
    expect(items[0].completedFilter).toBe('hide');
  });

  it('parses section completedFilter:show', () => {
    const { items } = parse('# Title <!-- sec:abc12345 cf:show -->');
    expect(items[0].completedFilter).toBe('show');
  });

  it('defaults completedFilter to default when cf absent', () => {
    const { items } = parse('# Title <!-- sec:abc12345 -->');
    expect(items[0].completedFilter).toBe('default');
  });
});

// ─── parse — doc-level filter ─────────────────────────────────────────────────

describe('parse — doc-level filter', () => {
  it('defaults to default when absent', () => {
    expect(parse('').docCompletedFilter).toBe('default');
  });

  it('parses <!-- cf:show --> as show', () => {
    expect(parse('<!-- cf:show -->').docCompletedFilter).toBe('show');
  });

  it('parses <!-- cf:hide --> as hide', () => {
    expect(parse('<!-- cf:hide -->').docCompletedFilter).toBe('hide');
  });
});

// ─── serialize ────────────────────────────────────────────────────────────────

describe('serialize', () => {
  const item = (overrides) => ({ id: 'abc12345', checked: false, text: 'task', indent: 0, ...overrides });
  const section = (overrides) => ({ type: 'section', id: 'abc12345', level: 1, text: 'Title', collapsed: false, completedFilter: 'default', ...overrides });

  it('serializes an unchecked item', () => {
    expect(serialize('', [item()])).toBe('- [ ] task <!-- id:abc12345 -->\n');
  });

  it('serializes a checked item', () => {
    expect(serialize('', [item({ checked: true })])).toBe('- [x] task <!-- id:abc12345 -->\n');
  });

  it('serializes indent:1 with 2 leading spaces', () => {
    expect(serialize('', [item({ indent: 1 })])).toBe('  - [ ] task <!-- id:abc12345 -->\n');
  });

  it('serializes indent:2 with 4 leading spaces', () => {
    expect(serialize('', [item({ indent: 2 })])).toBe('    - [ ] task <!-- id:abc12345 -->\n');
  });

  it('serializes item with context', () => {
    expect(serialize('', [item({ context: 'some note' })])).toBe('- [ ] task: some note <!-- id:abc12345 -->\n');
  });

  it('serializes an H1 section with blank line prefix', () => {
    expect(serialize('', [section()])).toBe('\n# Title <!-- sec:abc12345 -->\n');
  });

  it('serializes H2 section', () => {
    expect(serialize('', [section({ level: 2 })])).toBe('\n## Title <!-- sec:abc12345 -->\n');
  });

  it('serializes section with completedFilter:hide', () => {
    expect(serialize('', [section({ completedFilter: 'hide' })])).toContain('cf:hide');
  });

  it('does NOT include cf in section when completedFilter is default', () => {
    expect(serialize('', [section()])).not.toContain('cf:');
  });

  it('prepends <!-- cf:show --> for docCompletedFilter show', () => {
    expect(serialize('', [], 'show')).toMatch(/^<!-- cf:show -->/);
  });

  it('prepends <!-- cf:hide --> for docCompletedFilter hide', () => {
    expect(serialize('', [], 'hide')).toMatch(/^<!-- cf:hide -->/);
  });

  it('does NOT prepend cf comment for docCompletedFilter default', () => {
    expect(serialize('', [], 'default')).not.toContain('<!-- cf:');
  });

  it('does NOT prepend cf comment when docCompletedFilter is undefined', () => {
    expect(serialize('', [])).not.toContain('<!-- cf:');
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip: parse(serialize(...)) === original', () => {
  it('round-trips a plain item', () => {
    const items = [{ id: 'aabb1122', checked: false, text: 'buy milk', indent: 0 }];
    const { items: result } = parse(serialize('', items));
    expect(result[0]).toMatchObject(items[0]);
  });

  it('round-trips a checked indented item', () => {
    const items = [{ id: 'aabb1122', checked: true, text: 'done task', indent: 2 }];
    const { items: result } = parse(serialize('', items));
    expect(result[0]).toMatchObject(items[0]);
  });

  it('round-trips an item with context', () => {
    const items = [{ id: 'aabb1122', checked: false, text: 'task', indent: 0, context: 'my note' }];
    const { items: result } = parse(serialize('', items));
    expect(result[0]).toMatchObject(items[0]);
  });

  it('round-trips a section with completedFilter:hide', () => {
    const items = [{ type: 'section', id: 'aabb1122', level: 2, text: 'Work', collapsed: false, completedFilter: 'hide' }];
    const { items: result } = parse(serialize('', items));
    expect(result[0]).toMatchObject({ type: 'section', level: 2, text: 'Work', completedFilter: 'hide' });
  });

  it('round-trips docCompletedFilter:hide', () => {
    const { docCompletedFilter } = parse(serialize('', [], 'hide'));
    expect(docCompletedFilter).toBe('hide');
  });

  it('round-trips mixed items and sections', () => {
    const items = [
      { type: 'section', id: 'aa110011', level: 1, text: 'My List', collapsed: false, completedFilter: 'default' },
      { id: 'bb220022', checked: false, text: 'first item', indent: 0 },
      { id: 'cc330033', checked: true, text: 'done item', indent: 1, context: 'a note' },
    ];
    const { items: result } = parse(serialize('', items));
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'section', text: 'My List' });
    expect(result[1]).toMatchObject({ text: 'first item', indent: 0 });
    expect(result[2]).toMatchObject({ checked: true, indent: 1, context: 'a note' });
  });
});
