import { formatItemName, itemKey, parseItemLine } from './items.ts';
import type { Item } from '../types.ts';

export const MAX_IMPORT_BYTES = 1024 * 1024;
const FORMAT = 'order-pad-suggestions';

export function serializeSuggestions(items: Item[]): string {
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    items: items.map(item => ({ name: formatItemName(item.name), quantity: item.quantity, unit: item.unit }))
  }, null, 2) + '\n';
}

export function parseSuggestionImport(text: string): Item[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Choose a JSON file smaller than 1 MB.');
  let data: unknown;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('This file is not valid JSON. Choose an Order Pad suggestion export.'); }
  let rows: unknown;
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === 'object' && 'format' in data && data.format === FORMAT &&
      'version' in data && data.version === 1 && 'items' in data) rows = data.items;
  else throw new Error('Choose an Order Pad suggestion export or a JSON array of items.');
  if (!Array.isArray(rows)) throw new Error('The file must contain a list of items.');
  if (rows.length > 200) throw new Error('Import up to 200 items at a time.');
  const items = new Map<string, Item>();
  for (const [index, row] of rows.entries()) {
    const invalid = () => new Error(`Item ${index + 1} needs a name, a quantity (number or null), and a unit.`);
    if (!row || typeof row !== 'object' || !('name' in row) || typeof row.name !== 'string' ||
        !('quantity' in row) || !('unit' in row) || typeof row.unit !== 'string') throw invalid();
    if (/[\r\n\t]/.test(row.name) || /[\r\n\t]/.test(row.unit)) throw invalid();
    const name = row.name.trim().replace(/\s+/g, ' ');
    const unit = row.unit.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const parsed = parseItemLine(name);
    if (!parsed || parsed.name !== name || parsed.quantity !== null || unit.length > 32 ||
        (row.quantity !== null && (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity < 0))) throw invalid();
    items.set(itemKey(name), { name, quantity: row.quantity as number | null, unit });
  }
  return [...items.values()];
}
