import { itemKey, parseItemLine, parseItemParts, formatItemName, formatItemLine } from './items.ts';
import type { CatalogItem, Item, ItemContext, StoredItem, Suggestion } from '../types.ts';

export const DUMMY_ITEMS: CatalogItem[] = [
  { name: 'Milk', code: 'DAI-01', quantity: 2, unit: 'ctn' },
  { name: 'Eggs', code: 'DAI-05', quantity: 1, unit: 'tray' },
  { name: 'Bread', code: 'BAK-01', quantity: 3, unit: 'loaf' },
  { name: 'Sugar', code: 'PAN-01', quantity: 2, unit: 'kg' },
  { name: 'Cooking oil', code: 'PAN-03', quantity: 3, unit: 'litter' },
  { name: 'Coffee beans', code: 'DRI-01', quantity: 1, unit: 'kg' },
  { name: 'Banana', code: 'FRU-01', quantity: 2, unit: 'kg' },
  { name: 'Lemon', code: 'FRU-02', quantity: 3, unit: 'kg' },
  { name: 'Green apple', code: 'FRU-03', quantity: 5, unit: 'nos' },
  { name: 'Orange', code: 'FRU-04', quantity: 1, unit: 'ctn' }
].map(item => ({ ...item, lastUsed: 0 }));

export function getItemContext(value: string, caret: number, selectionEnd = caret): ItemContext | null {
  if (caret !== selectionEnd) return null;
  const lineStart = caret === 0 ? 0 : value.lastIndexOf('\n', caret - 1) + 1;
  const newline = value.indexOf('\n', caret);
  const lineEnd = newline < 0 ? value.length : newline;
  const parsed = parseItemParts(value.slice(lineStart, lineEnd));
  if (!parsed) return null;
  const nameStart = lineStart + parsed.nameStart;
  const nameEnd = lineStart + parsed.nameEnd;
  if (caret < nameStart || caret > nameEnd) return null;
  const query = value.slice(nameStart, caret).trim();
  return query && query.length <= 80 ? { nameStart, nameEnd, query } : null;
}

export function getSuggestionCatalog(history: StoredItem[] = [], hiddenSamples: string[] = []): CatalogItem[] {
  const hidden = new Set(hiddenSamples);
  const catalog = new Map<string, CatalogItem>(DUMMY_ITEMS.filter(item => !hidden.has(itemKey(item.name))).map(item => [itemKey(item.name), { ...item }]));
  for (const item of history) {
    if (!parseItemLine(item.name)) continue;
    const key = itemKey(item.name);
    const sample = catalog.get(key);
    catalog.set(key, { ...sample, ...item, learned: true });
  }
  return [...catalog.values()].map(item => ({ ...item, name: formatItemName(item.name) }));
}

export function findItemSuggestions(query: string, history: StoredItem[] = [], hiddenSamples: string[] = []): Suggestion[] {
  const needle = itemKey(query);
  if (!needle) return [];
  return getSuggestionCatalog(history, hiddenSamples).map(item => {
    const name = itemKey(item.name);
    const code = itemKey(item.code || '');
    const rank = name === needle ? -1 : name.startsWith(needle) ? 0 : name.split(' ').some(word => word.startsWith(needle)) ? 1 : name.includes(needle) ? 2 : code.includes(needle) ? 3 : 99;
    return { ...item, rank };
  }).filter(item => item.rank < 99)
    .sort((a, b) => a.rank - b.rank || b.lastUsed - a.lastUsed || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, 5);
}

export function completeItem(value: string, context: ItemContext, item: Item): { value: string; caret: number } {
  const newline = value.indexOf('\n', context.nameEnd);
  const lineEnd = newline < 0 ? value.length : newline;
  const typed = parseItemParts(value.slice(context.nameStart, lineEnd));
  const formatted = formatItemLine({ name: item.name, quantity: typed?.quantity ?? item.quantity, unit: typed?.unit || item.unit });
  const before = value.slice(0, context.nameStart) + formatted;
  const remaining = newline < 0 ? '' : value.slice(newline + 1);
  const nextLine = remaining.split('\n')[0];
  return {
    value: before + '\n' + (nextLine.trim() ? '\n' : '') + remaining,
    caret: before.length + 1
  };
}
