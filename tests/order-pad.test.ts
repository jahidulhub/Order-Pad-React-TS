import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeliveryDates, resolveDeliveryDate } from '../src/lib/dates.ts';
import { createItemStore, formatItemLine, ITEM_HISTORY_KEY, normalizeItemHistory, parseItemLine } from '../src/lib/items.ts';
import { completeItem, DUMMY_ITEMS, findItemSuggestions, getItemContext, getSuggestionCatalog } from '../src/lib/suggestions.ts';
import { prepareOrderShare } from '../src/lib/share.ts';
import { DATE_KEY, DRAFT_KEY, PROFILE_KEY, readProfile, readValue } from '../src/lib/storage.ts';
import type { ItemStorage } from '../src/types.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  return { data, writes, getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes.push(key); data.set(key, value); } };
}
const now = new Date(2026, 9, 24, 10);
const profile = { name: 'Alex', company: 'Old town cafe' };

test('local calendar dates span today through seven days, default to tomorrow, and flag Sundays', () => {
  const dates = getDeliveryDates(now);
  assert.equal(dates.length, 8);
  assert.equal(dates[0].key, '2026-10-24');
  assert.equal(dates[7].key, '2026-10-31');
  assert.equal(resolveDeliveryDate(null, dates), '2026-10-25');
  assert.equal(resolveDeliveryDate('2026-10-23', dates), '2026-10-25');
  assert.equal(resolveDeliveryDate('2026-10-24', dates), '2026-10-24');
  assert.equal(dates[1].sunday, true);
  const yearEnd = getDeliveryDates(new Date(2026, 11, 29));
  assert.equal(yearEnd[7].key, '2027-01-05');
});

test('freeform order lines become structured name, quantity and unit objects', () => {
  assert.deepEqual(['lemon 3kg', 'banana 2kg', 'green apple 5nos', 'orange 1ctn'].map(parseItemLine), [
    { name: 'lemon', quantity: 3, unit: 'kg' },
    { name: 'banana', quantity: 2, unit: 'kg' },
    { name: 'green apple', quantity: 5, unit: 'nos' },
    { name: 'orange', quantity: 1, unit: 'ctn' }
  ]);
  assert.deepEqual(parseItemLine('• almond milk — 2.5 PKT'), { name: 'almond milk', quantity: 2.5, unit: 'pkt' });
  assert.equal(formatItemLine(parseItemLine('COOKING OIL 3litter')!), 'Cooking oil — 3 litter');
});

test('restoring profiles, drafts and legacy suggestion history never writes suggestions', () => {
  const storage = memoryStorage({
    [PROFILE_KEY]: JSON.stringify(profile), [DRAFT_KEY]: 'Milk 9wrongunit', [DATE_KEY]: '2026-10-25',
    'order-pad.item-history.v1': JSON.stringify([{ name: 'lemon 3kg', lastUsed: 1 }])
  });
  const store = createItemStore(storage);
  assert.deepEqual(readProfile(storage), profile);
  assert.equal(readValue(storage, DRAFT_KEY), 'Milk 9wrongunit');
  assert.equal(store.getItems()[0].quantity, 3);
  assert.equal(findItemSuggestions('lem', store.getItems())[0].unit, 'kg');
  getSuggestionCatalog(store.getItems());
  assert.equal(storage.writes.length, 0);
});

test('only a validated Send learns final items; editing and rejected sends leave history intact', () => {
  const storage = memoryStorage();
  const store = createItemStore(storage);
  // Draft edits and suggestion use are reads; these should never affect history.
  storage.setItem(DRAFT_KEY, 'milk 9wrongunit\nunsent typo 4badunit');
  findItemSuggestions('milk', store.getItems());
  assert.equal(storage.data.has(ITEM_HISTORY_KEY), false);
  assert.equal(prepareOrderShare(profile, '2026-10-25', '  ', store, now).ok, false);
  assert.equal(prepareOrderShare(profile, '2026-10-23', 'milk 9wrongunit', store, now).ok, false);
  assert.equal(storage.data.has(ITEM_HISTORY_KEY), false);
  const result = prepareOrderShare(profile, '2026-10-25', 'milk 2kg\nMILK 4pkt\nlemon 3kg', store, now);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(new URL(result.url).pathname, '/601127201336');
  assert.match(new URL(result.url).searchParams.get('text')!, /Old town cafe has an order for Sunday, 25 October 2026/);
  assert.match(new URL(result.url).searchParams.get('text')!, /Ordered by: Alex/);
  assert.equal(storage.writes.filter(key => key === ITEM_HISTORY_KEY).length, 1);
  assert.equal(store.getItems().length, 2);
  const milk = store.getItems().find(item => item.name.toLowerCase() === 'milk')!;
  assert.equal(milk.quantity, 4);
  assert.equal(milk.unit, 'pkt');
  const reloaded = createItemStore(storage);
  assert.deepEqual(reloaded.getItems().sort((a, b) => a.name.localeCompare(b.name)), store.getItems().sort((a, b) => a.name.localeCompare(b.name)));
  assert.equal(storage.writes.filter(key => key === ITEM_HISTORY_KEY).length, 1);
});

test('history deduplicates names by case and spacing while retaining the most recent fields', () => {
  const history = normalizeItemHistory([
    { name: 'Almond milk', quantity: 1, unit: 'kg', lastUsed: 1 },
    { name: 'almond   MILK', quantity: 5, unit: 'pkt', lastUsed: 2 }, null
  ]);
  assert.equal(history.length, 1);
  assert.equal(history[0].quantity, 5);
  assert.equal(history[0].unit, 'pkt');
  assert.equal(findItemSuggestions('alm', history)[0].learned, true);
});

test('accepting a suggestion formats the item and advances the caret without overwriting following lines', () => {
  const chosen = { name: 'almond milk', quantity: 5, unit: 'pkt' };
  const context = getItemContext('alm', 3)!;
  const completed = completeItem('alm', context, chosen);
  assert.equal(completed.value, 'Almond milk — 5 pkt\n');
  assert.equal(completed.caret, completed.value.length);
  const middle = 'lemon 3kg\nalm\nbanana 2kg';
  const at = middle.indexOf('alm') + 3;
  const inserted = completeItem(middle, getItemContext(middle, at)!, chosen);
  assert.equal(inserted.value, 'lemon 3kg\nAlmond milk — 5 pkt\n\nbanana 2kg');
  assert.equal(inserted.value[inserted.caret], '\n');
  const typed = 'alm 2kg';
  assert.equal(completeItem(typed, getItemContext(typed, 3)!, chosen).value, 'Almond milk — 2 kg\n');
  assert.equal(getItemContext('milk 2kg', 8), null);
  assert.equal(getItemContext('milk', 0, 4), null);
});

test('corrupt or blocked storage does not stop local suggestions and editing', () => {
  const corrupt = memoryStorage({ [ITEM_HISTORY_KEY]: '{broken', [PROFILE_KEY]: '{broken' });
  assert.deepEqual(createItemStore(corrupt).getItems(), []);
  assert.equal(readProfile(corrupt), null);
  const blocked: ItemStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const store = createItemStore(blocked);
  assert.doesNotThrow(() => store.saveOrder('lemon 3kg'));
  assert.equal(store.getItems()[0].unit, 'kg');
  assert.equal(readValue(blocked, DRAFT_KEY), null);
});

test('ten sample suggestions include quantities and units for immediate completion', () => {
  assert.equal(DUMMY_ITEMS.length, 10);
  assert.equal(new Set(DUMMY_ITEMS.map(item => item.name.toLowerCase())).size, 10);
  for (const item of DUMMY_ITEMS) {
    assert.ok(item.quantity !== null && item.quantity > 0);
    assert.ok(item.unit.trim());
  }
  const lemon = findItemSuggestions('lem')[0];
  assert.equal(completeItem('lem', getItemContext('lem', 3)!, lemon).value, 'Lemon — 3 kg\n');
});

test('deleting a saved sample removes its fallback, persists, and can be undone', () => {
  const storage = memoryStorage({
    'order-pad.item-history.v2': JSON.stringify([
      { name: 'Milk', quantity: 5, unit: 'pkt', lastUsed: 1 },
      { name: 'Salmon', quantity: 3, unit: 'kg', lastUsed: 2 }
    ])
  });
  const store = createItemStore(storage);
  const before = store.getSnapshot();
  assert.equal(storage.writes.length, 0);
  assert.equal(store.getItems().find(item => item.name === 'Milk')!.unit, 'pkt');
  assert.equal(store.deleteSuggestion(' MILK '), true);
  assert.equal(storage.writes.length, 1);
  const reloaded = createItemStore(storage);
  const removed = reloaded.getSnapshot();
  assert.equal(findItemSuggestions('milk', removed.items, removed.hiddenSamples).length, 0);
  assert.equal(removed.items.some(item => item.name === 'Salmon'), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(reloaded.restoreSuggestions(before), true);
  const restored = createItemStore(storage).getSnapshot();
  const milk = findItemSuggestions('milk', restored.items, restored.hiddenSamples)[0];
  assert.equal(milk.quantity, 5);
  assert.equal(milk.unit, 'pkt');
  assert.equal(getSuggestionCatalog(restored.items, restored.hiddenSamples).filter(item => item.name === 'Milk').length, 1);
  assert.equal(reloaded.deleteSuggestion('Salmon'), true);
  assert.equal(reloaded.getItems().some(item => item.name === 'Salmon'), false);
});

test('clear all persists an empty catalog, preserves profile and draft, and supports Undo', () => {
  const storage = memoryStorage({
    'order-pad.item-history.v1': JSON.stringify(['lemon 9nos', 'salmon 2kg']),
    [PROFILE_KEY]: JSON.stringify(profile), [DRAFT_KEY]: 'Unsent typo 4badunit'
  });
  const store = createItemStore(storage);
  const before = store.getSnapshot();
  assert.equal(store.clearSuggestions(DUMMY_ITEMS.map(item => item.name)), true);
  const cleared = createItemStore(storage).getSnapshot();
  assert.deepEqual(getSuggestionCatalog(cleared.items, cleared.hiddenSamples), []);
  assert.deepEqual(findItemSuggestions('lem', cleared.items, cleared.hiddenSamples), []);
  assert.equal(storage.getItem(DRAFT_KEY), 'Unsent typo 4badunit');
  assert.deepEqual(readProfile(storage), profile);
  assert.equal(store.restoreSuggestions(before), true);
  const restored = createItemStore(storage).getSnapshot();
  assert.equal(getSuggestionCatalog(restored.items, restored.hiddenSamples).length, 11);
  assert.equal(findItemSuggestions('lem', restored.items, restored.hiddenSamples)[0].quantity, 9);
});

test('after clearing suggestions only a valid Share relearns an item; other samples stay hidden', () => {
  const storage = memoryStorage();
  const store = createItemStore(storage);
  store.clearSuggestions(DUMMY_ITEMS.map(item => item.name));
  const writes = storage.writes.length;
  const blocked = prepareOrderShare(profile, '2026-10-23', 'lemon 4nos', store, now);
  assert.equal(blocked.ok, false);
  assert.equal(storage.writes.length, writes);
  assert.equal(prepareOrderShare(profile, '2026-10-25', 'lemon 4nos', store, now).ok, true);
  const state = createItemStore(storage).getSnapshot();
  const catalog = getSuggestionCatalog(state.items, state.hiddenSamples);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'Lemon');
  assert.equal(catalog[0].quantity, 4);
  assert.equal(catalog[0].unit, 'nos');
  assert.equal(catalog[0].learned, true);
});

test('failed storage writes keep suggestion management usable in memory and report failure', () => {
  const storage: ItemStorage = { getItem: () => null, setItem() { throw Error('blocked'); } };
  const store = createItemStore(storage);
  const before = store.getSnapshot();
  assert.equal(store.deleteSuggestion('Milk'), false);
  assert.equal(findItemSuggestions('milk', store.getItems(), store.getSnapshot().hiddenSamples).length, 0);
  assert.equal(store.clearSuggestions(DUMMY_ITEMS.map(item => item.name)), false);
  assert.equal(getSuggestionCatalog(store.getItems(), store.getSnapshot().hiddenSamples).length, 0);
  assert.equal(store.restoreSuggestions(before), false);
  assert.equal(getSuggestionCatalog(store.getItems(), store.getSnapshot().hiddenSamples).length, 10);
});

test('Share returns a WhatsApp URL only after a verified persistent write', () => {
  const storage = memoryStorage();
  let store = createItemStore(storage);
  const first = prepareOrderShare(profile, '2026-10-25', 'broccoli 4kg', store, now);
  assert.equal(first.ok, true);
  // The record is durable as soon as the caller receives permission to open WhatsApp.
  store = createItemStore(storage);
  assert.equal(store.getItems()[0].quantity, 4);
  assert.equal(store.getItems()[0].unit, 'kg');
  const second = prepareOrderShare(profile, '2026-10-25', 'BROCCOLI 6pkt', store, now);
  assert.equal(second.ok, true);
  const persisted = createItemStore(storage).getItems();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].quantity, 6);
  assert.equal(persisted[0].unit, 'pkt');
});

test('Share reports blocked or discarded writes instead of opening WhatsApp without saved items', () => {
  for (const storage of [
    { getItem: () => null, setItem() { throw Error('quota exceeded'); } },
    { getItem: () => null, setItem() { /* Simulate a browser host discarding writes. */ } }
  ] satisfies ItemStorage[]) {
    const result = prepareOrderShare(profile, '2026-10-25', 'broccoli 4kg', createItemStore(storage), now);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, 'storage');
    assert.equal('url' in result, false);
    assert.equal(createItemStore(storage).getItems().length, 0);
  }
});

test('Share does not silently skip an order with no recognizable item names', () => {
  const storage = memoryStorage();
  const result = prepareOrderShare(profile, '2026-10-25', '123\n---', createItemStore(storage), now);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'items');
  assert.equal(storage.writes.length, 0);
});
