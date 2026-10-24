import type { ItemStorage, Profile } from '../types.ts';

export const PROFILE_KEY = 'order-pad.profile.v1';
export const DRAFT_KEY = 'order-pad.draft.v1';
export const DATE_KEY = 'order-pad.delivery-date.v1';

// Access can throw in browsers that block storage. Keep the editor usable.
export function getBrowserStorage(): ItemStorage {
  try { return window.localStorage; }
  catch {
    return {
      getItem: () => null,
      setItem: () => { throw new Error('Browser storage is unavailable'); }
    };
  }
}

export function readValue(storage: ItemStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

export function readProfile(storage: ItemStorage): Profile | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null');
    if (value && typeof value === 'object' && 'name' in value && 'company' in value &&
        typeof value.name === 'string' && value.name.trim() &&
        typeof value.company === 'string' && value.company.trim()) {
      return { name: value.name.trim(), company: value.company.trim() };
    }
  } catch { /* Invalid or inaccessible profile: show onboarding. */ }
  return null;
}
