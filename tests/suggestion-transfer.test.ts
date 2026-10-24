import test from 'node:test';
import assert from 'node:assert/strict';
import { createItemStore } from '../src/lib/items.ts';
import { DUMMY_ITEMS, getSuggestionCatalog } from '../src/lib/suggestions.ts';
import { MAX_IMPORT_BYTES, parseSuggestionImport, serializeSuggestions } from '../src/lib/suggestion-transfer.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return { getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes.push(key); data.set(key, value); }, writes };
}

test('suggestion JSON round-trips names, quantities and units, including empty lists', () => {
  const text = serializeSuggestions([
    { name: 'almond milk', quantity: 5, unit: 'pkt' },
    { name: 'Salt', quantity: null, unit: '' },
    { name: 'Sugar', quantity: 0, unit: 'kg' }
  ]);
  assert.deepEqual(parseSuggestionImport('\uFEFF' + text), [
    { name: 'Almond milk', quantity: 5, unit: 'pkt' },
    { name: 'Salt', quantity: null, unit: '' },
    { name: 'Sugar', quantity: 0, unit: 'kg' }
  ]);
  assert.deepEqual(parseSuggestionImport(serializeSuggestions([])), []);
  assert.equal(parseSuggestionImport(serializeSuggestions(DUMMY_ITEMS)).length, 10);
});

test('imports merge by normalized name, preserve other items, persist, and support Undo', () => {
  const storage = memoryStorage();
  const store = createItemStore(storage);
  store.saveOrder('milk 2kg\nbroccoli 4kg');
  const before = store.getSnapshot();
  const incoming = parseSuggestionImport(JSON.stringify([
    { name: ' MILK ', quantity: 3, unit: ' CTN ' },
    { name: 'milk', quantity: 6, unit: 'pkt' },
    { name: 'Cauliflower', quantity: 2, unit: 'kg' }
  ]));
  assert.equal(incoming.length, 2);
  assert.equal(store.importSuggestions(incoming), true);
  const reloaded = createItemStore(storage).getItems();
  assert.equal(reloaded.length, 3);
  assert.equal(reloaded.find(item => item.name.toLowerCase() === 'milk')!.quantity, 6);
  assert.equal(reloaded.find(item => item.name.toLowerCase() === 'milk')!.unit, 'pkt');
  assert.equal(reloaded.find(item => item.name === 'broccoli')!.quantity, 4);
  assert.equal(store.restoreSuggestions(before), true);
  const restored = createItemStore(storage).getItems();
  assert.equal(restored.length, 2);
  assert.equal(restored.find(item => item.name === 'milk')!.unit, 'kg');
  store.importSuggestions([{ name: 'Milk', quantity: null, unit: '' }]);
  const clearedAmount = createItemStore(storage).getSnapshot();
  const milk = getSuggestionCatalog(clearedAmount.items, clearedAmount.hiddenSamples).find(item => item.name === 'Milk')!;
  assert.equal(milk.quantity, null);
  assert.equal(milk.unit, '');
});

test('imports after Clear all restore only imported items and honor explicit null amounts', () => {
  const storage = memoryStorage();
  const store = createItemStore(storage);
  store.clearSuggestions(DUMMY_ITEMS.map(item => item.name));
  store.importSuggestions(parseSuggestionImport('[{"name":"Lemon","quantity":4,"unit":"nos"}]'));
  store.importSuggestions(parseSuggestionImport('[{"name":"Lemon","quantity":null,"unit":""}]'));
  const snapshot = createItemStore(storage).getSnapshot();
  const catalog = getSuggestionCatalog(snapshot.items, snapshot.hiddenSamples);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'Lemon');
  assert.equal(catalog[0].quantity, null);
  assert.equal(catalog[0].unit, '');
});

test('invalid, unsupported and oversized imports reject before any store writes', () => {
  const storage = memoryStorage();
  const store = createItemStore(storage);
  const invalid = [
    '{broken', '{"format":"other","version":1,"items":[]}',
    '{"format":"order-pad-suggestions","version":99,"items":[]}',
    '[{"name":"Milk","quantity":"3","unit":"kg"}]',
    '[{"name":"Milk","quantity":-1,"unit":"kg"}]',
    '[{"name":"Milk 3kg","quantity":3,"unit":"kg"}]',
    '[{"name":"Milk\\nEggs","quantity":3,"unit":"kg"}]',
    '[{"name":"Milk","quantity":3,"unit":"kg\\n"}]',
    '[{"name":"Milk","quantity":3}]',
    ' '.repeat(MAX_IMPORT_BYTES + 1)
  ];
  for (const text of invalid) assert.throws(() => store.importSuggestions(parseSuggestionImport(text)));
  assert.equal(storage.writes.length, 0);
  assert.equal(store.getItems().length, 0);
});

test('imports enforce the saved-item limit without dropping existing data', () => {
  const storage = memoryStorage();
  const store = createItemStore(storage);
  const items = Array.from({ length: 200 }, (_, i) => ({
    name: `Product ${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`,
    quantity: 1, unit: 'kg'
  }));
  store.importSuggestions(parseSuggestionImport(JSON.stringify(items)));
  const before = store.getSnapshot();
  const writes = storage.writes.length;
  assert.throws(() => store.importSuggestions([{ name: 'Papaya', quantity: 2, unit: 'kg' }]), /200/);
  assert.deepEqual(store.getSnapshot(), before);
  assert.equal(storage.writes.length, writes);
  assert.throws(() => parseSuggestionImport(JSON.stringify([...items, { name: 'Papaya', quantity: 2, unit: 'kg' }])));
  assert.equal(store.importSuggestions([{ ...items[0], quantity: 3, unit: 'ctn' }]), true);
  assert.equal(createItemStore(storage).getItems().length, 200);
});
