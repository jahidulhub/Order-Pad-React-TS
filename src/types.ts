export interface Profile { name: string; company: string }
export type Page = 'home' | 'Settings' | 'Suggestions';
export interface Item { name: string; quantity: number | null; unit: string }
export interface StoredItem extends Item { lastUsed: number }
export interface CatalogItem extends StoredItem { code?: string; learned?: boolean }
export interface Suggestion extends CatalogItem { rank: number }
export interface ItemContext { nameStart: number; nameEnd: number; query: string }
export interface DeliveryDate {
  key: string;
  today: boolean;
  tomorrow: boolean;
  sunday: boolean;
  weekdayShort: string;
  dayNumber: string;
  shortLabel: string;
  label: string;
  fullLabel: string;
}
export interface ItemStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ItemStore {
  getItems(): StoredItem[];
  getSnapshot(): SuggestionSnapshot;
  saveOrder(value: string): boolean;
  importSuggestions(items: Item[]): boolean;
  deleteSuggestion(name: string): boolean;
  clearSuggestions(sampleNames: string[]): boolean;
  restoreSuggestions(snapshot: SuggestionSnapshot): boolean;
}
export interface SuggestionSnapshot { items: StoredItem[]; hiddenSamples: string[] }
