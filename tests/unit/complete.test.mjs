import { describe, it, expect } from 'vitest';
import { collectCompleted } from '../../renderer/complete.js';

// Helpers
const fakeId = (() => { let n = 0; return () => `test${String(n++).padStart(4, '0')}`; })();
const task = (overrides) => ({ id: fakeId(), checked: false, text: 'task', indent: 0, ...overrides });
const section = (overrides) => ({ type: 'section', id: fakeId(), level: 1, text: 'Section', collapsed: false, completedFilter: 'default', ...overrides });

// Reset counter before each suite so ids are predictable within a test
function makeId() {
  let n = 0;
  return () => `gen${String(n++).padStart(4, '0')}`;
}

// ─── No-op when nothing is checked ────────────────────────────────────────────

describe('collectCompleted — no checked items', () => {
  it('returns equivalent items when nothing is checked', () => {
    const items = [task({ text: 'a' }), task({ text: 'b' })];
    const result = collectCompleted(items, makeId());
    expect(result).toHaveLength(2);
    expect(result.map(i => i.text)).toEqual(['a', 'b']);
  });

  it('does not create a Completed section when nothing is checked', () => {
    const items = [task({ text: 'a' })];
    const result = collectCompleted(items, makeId());
    expect(result.some(i => i.type === 'section')).toBe(false);
  });

  it('returns a new array (does not mutate original)', () => {
    const items = [task()];
    const result = collectCompleted(items, makeId());
    expect(result).not.toBe(items);
  });
});

// ─── Creates a Completed section when none exists ─────────────────────────────

describe('collectCompleted — creates Completed section', () => {
  it('creates a Completed H1 section when none exists', () => {
    const items = [task({ checked: true, text: 'done' })];
    const result = collectCompleted(items, makeId());
    const sec = result.find(i => i.type === 'section');
    expect(sec).toBeDefined();
    expect(sec.text).toBe('Completed');
    expect(sec.level).toBe(1);
  });

  it('places the Completed section before the moved items', () => {
    const items = [task({ checked: true, text: 'done' })];
    const result = collectCompleted(items, makeId());
    const secIdx = result.findIndex(i => i.type === 'section' && i.text === 'Completed');
    const doneIdx = result.findIndex(i => i.text === 'done');
    expect(secIdx).toBeLessThan(doneIdx);
  });

  it('removes checked items from their original positions', () => {
    const items = [
      task({ text: 'first', checked: true }),
      task({ text: 'second' }),
    ];
    const result = collectCompleted(items, makeId());
    const nonSection = result.filter(i => !i.type);
    // 'first' should be after the Completed section, not at index 0
    const secIdx = result.findIndex(i => i.type === 'section');
    const firstIdx = result.findIndex(i => i.text === 'first');
    expect(firstIdx).toBeGreaterThan(secIdx);
    // 'second' (unchecked) should come before the Completed section
    const secondIdx = result.findIndex(i => i.text === 'second');
    expect(secondIdx).toBeLessThan(secIdx);
  });

  it('gives the new section a generated id', () => {
    const genId = makeId();
    const items = [task({ checked: true })];
    const result = collectCompleted(items, genId);
    const sec = result.find(i => i.type === 'section');
    expect(sec.id).toBeTruthy();
  });

  it('sets completedFilter to default on the new section', () => {
    const items = [task({ checked: true })];
    const result = collectCompleted(items, makeId());
    const sec = result.find(i => i.type === 'section');
    expect(sec.completedFilter).toBe('default');
  });
});

// ─── Appends to existing Completed section ────────────────────────────────────

describe('collectCompleted — appends to existing Completed section', () => {
  it('does not create a duplicate Completed section', () => {
    const items = [
      section({ text: 'Completed' }),
      task({ text: 'already done', checked: false }),
      task({ text: 'newly done', checked: true }),
    ];
    const result = collectCompleted(items, makeId());
    const completedSections = result.filter(i => i.type === 'section' && i.text === 'Completed');
    expect(completedSections).toHaveLength(1);
  });

  it('appends newly checked items after existing items in the Completed section', () => {
    const items = [
      section({ text: 'Completed' }),
      task({ text: 'old done', checked: false }),
      task({ text: 'newly done', checked: true }),
    ];
    const result = collectCompleted(items, makeId());
    const secIdx = result.findIndex(i => i.type === 'section' && i.text === 'Completed');
    const oldIdx = result.findIndex(i => i.text === 'old done');
    const newIdx = result.findIndex(i => i.text === 'newly done');
    expect(oldIdx).toBeGreaterThan(secIdx);
    expect(newIdx).toBeGreaterThan(oldIdx);
  });

  it('stops inserting before the next level-1 section', () => {
    const items = [
      task({ text: 'done item', checked: true }),
      section({ text: 'Completed' }),
      task({ text: 'already here', checked: false }),
      section({ text: 'Other', level: 1 }),
    ];
    const result = collectCompleted(items, makeId());
    const completedIdx = result.findIndex(i => i.type === 'section' && i.text === 'Completed');
    const otherIdx = result.findIndex(i => i.type === 'section' && i.text === 'Other');
    const doneIdx = result.findIndex(i => i.text === 'done item');
    // done item should be between Completed and Other sections
    expect(doneIdx).toBeGreaterThan(completedIdx);
    expect(doneIdx).toBeLessThan(otherIdx);
  });

  it('matches "completed" case-insensitively', () => {
    const items = [
      section({ text: 'COMPLETED' }),
      task({ text: 'done', checked: true }),
    ];
    const result = collectCompleted(items, makeId());
    const completedSections = result.filter(i => i.type === 'section');
    expect(completedSections).toHaveLength(1);
  });
});

// ─── Multiple checked items ────────────────────────────────────────────────────

describe('collectCompleted — multiple checked items', () => {
  it('moves all checked items, preserving their relative order', () => {
    const items = [
      task({ text: 'a', checked: true }),
      task({ text: 'b' }),
      task({ text: 'c', checked: true }),
    ];
    const result = collectCompleted(items, makeId());
    const secIdx = result.findIndex(i => i.type === 'section');
    const moved = result.slice(secIdx + 1).map(i => i.text);
    expect(moved).toEqual(['a', 'c']);
  });

  it('leaves unchecked items in place', () => {
    const items = [
      task({ text: 'keep', checked: false }),
      task({ text: 'move', checked: true }),
    ];
    const result = collectCompleted(items, makeId());
    expect(result[0].text).toBe('keep');
  });
});
