import type { Item, ItemStorage, ItemStore, StoredItem } from '../types.ts';

export const ITEM_HISTORY_KEY = 'order-pad.item-history.v3';
const PREVIOUS_KEY = 'order-pad.item-history.v2';
const LEGACY_KEY = 'order-pad.item-history.v1';
export const itemKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export const itemSeparator = /[ \t]+[—–][ \t]*|[ \t]+-[ \t]+|[ \t]*:[ \t]+/;
const amountPattern = /^(?:[x×][ \t]*)?(\d+(?:[.,]\d+)?|\.\d+)[ \t]*([\p{L}][\p{L}\p{N} /.-]*)?$/u;
interface ItemParts extends Item { nameStart: number; nameEnd: number }

export function parseItemParts(line: string): ItemParts | null {
  const prefix = line.match(/^[ \t]*(?:[-*•][ \t]+|\d+[.)][ \t]+)?/)![0];
  const content = line.slice(prefix.length).trimEnd();
  const split = content.search(itemSeparator);
  let rawName = content;
  let amount: RegExpMatchArray | null = null;
  if (split >= 0) {
    rawName = content.slice(0, split).trimEnd();
    amount = content.slice(split).replace(itemSeparator, '').trim().match(amountPattern);
  } else {
    const suffix = content.match(/^(.*?)[ \t]+((?:[x×][ \t]*)?(?:\d+(?:[.,]\d+)?|\.\d+)[ \t]*(?:[\p{L}][\p{L}\p{N} /.-]*)?)$/u);
    if (suffix) { rawName = suffix[1].trimEnd(); amount = suffix[2].match(amountPattern); }
  }
  const name = rawName.trim().replace(/[ \t]+/g, ' ');
  if (name.length < 1 || name.length > 80 || !/\p{L}/u.test(name)) return null;
  const quantity = amount ? Number(amount[1].replace(',', '.')) : null;
  const unit = amount?.[2]?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() || '';
  if ((quantity !== null && !Number.isFinite(quantity)) || unit.length > 32) return null;
  return { name, quantity, unit, nameStart: prefix.length, nameEnd: prefix.length + rawName.length };
}

export function parseItemLine(line: string): Item | null {
  const parsed = parseItemParts(line);
  return parsed && parsed.name.length >= 2 ? { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit } : null;
}

export function upsertItem(history: StoredItem[], incoming: Item, now = Date.now()): StoredItem[] {
  const key = itemKey(incoming.name);
  const previous = history.find(item => itemKey(item.name) === key);
  const next: StoredItem = {
    name: incoming.name.trim().replace(/\s+/g, ' '),
    quantity: incoming.quantity ?? previous?.quantity ?? null,
    unit: incoming.unit || previous?.unit || '',
    lastUsed: now
  };
  return [next, ...history.filter(item => itemKey(item.name) !== key)].slice(0, 200);
}

export function normalizeItemHistory(records: unknown): StoredItem[] {
  if (!Array.isArray(records)) return [];
  let result: StoredItem[] = [];
  const timestamp = (record: unknown): number => {
    const time = Number(record && typeof record === 'object' && 'lastUsed' in record ? record.lastUsed : 0);
    return Number.isFinite(time) ? time : 0;
  };
  for (const record of [...records].sort((a, b) => timestamp(a) - timestamp(b))) {
    const data: Record<string, unknown> = record && typeof record === 'object' ? record : {};
    const rawName = typeof record === 'string' ? record : data.name;
    const parsed = typeof rawName === 'string' ? parseItemLine(rawName) : null;
    if (!parsed) continue;
    const quantity = typeof data.quantity === 'number' && Number.isFinite(data.quantity) && data.quantity >= 0 ? data.quantity : parsed.quantity;
    const unit = typeof data.unit === 'string' && data.unit !== 'Saved item' ? data.unit.trim().toLocaleLowerCase().slice(0, 32) : parsed.unit;
    result = upsertItem(result, { name: parsed.name, quantity, unit }, timestamp(record));
  }
  return result.sort((a, b) => b.lastUsed - a.lastUsed);
}

export function createItemStore(storage: ItemStorage): ItemStore {
  let history: StoredItem[] = [];
  let hiddenSamples: string[] = [];
  try {
    const current = storage.getItem(ITEM_HISTORY_KEY);
    if (current !== null) {
      const data: unknown = JSON.parse(current);
      if (data && typeof data === 'object' && 'items' in data) {
        history = normalizeItemHistory(data.items);
        if ('hiddenSamples' in data && Array.isArray(data.hiddenSamples)) {
          hiddenSamples = [...new Set(data.hiddenSamples.filter((name): name is string => typeof name === 'string').map(itemKey))];
        }
      }
    } else {
      history = normalizeItemHistory(JSON.parse(storage.getItem(PREVIOUS_KEY) ?? storage.getItem(LEGACY_KEY) ?? '[]'));
    }
  } catch { /* Local suggestions still work in memory. */ }
  function persist(): boolean {
    try {
      // One write keeps learned items and removed samples consistent on reload.
      const serialized = JSON.stringify({ items: history, hiddenSamples });
      storage.setItem(ITEM_HISTORY_KEY, serialized);
      return storage.getItem(ITEM_HISTORY_KEY) === serialized;
    } catch { return false; }
  }
  // Reading, including legacy migration, never writes suggestion history.
  return {
    getItems: () => history.map(item => ({ ...item })),
    getSnapshot: () => ({ items: history.map(item => ({ ...item })), hiddenSamples: [...hiddenSamples] }),
    saveOrder(value) {
      const orderItems = value.split('\n').map(parseItemLine).filter((item): item is Item => item !== null);
      if (!orderItems.length) return false;
      const now = Date.now();
      for (const item of orderItems) history = upsertItem(history, item, now);
      return persist();
    },
    importSuggestions(items) {
      const incoming = new Map(items.map(item => [itemKey(item.name), item]));
      const remaining = history.filter(item => !incoming.has(itemKey(item.name)));
      if (remaining.length + incoming.size > 200) throw new Error('This import would exceed 200 saved items. Delete some suggestions and try again.');
      if (!incoming.size) return true;
      const now = Date.now();
      history = [...incoming.values()].map(item => ({ ...item, lastUsed: now })).concat(remaining);
      return persist();
    },
    deleteSuggestion(name) {
      const key = itemKey(name);
      history = history.filter(item => itemKey(item.name) !== key);
      hiddenSamples = [...new Set([...hiddenSamples, key])];
      return persist();
    },
    clearSuggestions(sampleNames) {
      history = [];
      hiddenSamples = [...new Set([...hiddenSamples, ...sampleNames.map(itemKey)])];
      return persist();
    },
    restoreSuggestions(snapshot) {
      history = snapshot.items.map(item => ({ ...item }));
      hiddenSamples = [...snapshot.hiddenSamples];
      return persist();
    }
  };
}

export function formatItemAmount(item: Item): string {
  return item.quantity === null ? item.unit : String(item.quantity) + (item.unit ? ' ' + item.unit : '');
}
export function formatItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase().replace(/^\p{L}/u, letter => letter.toLocaleUpperCase());
}
export function formatItemLine(item: Item): string {
  return formatItemName(item.name) + (item.quantity === null ? '' : ' — ' + formatItemAmount(item));
}
