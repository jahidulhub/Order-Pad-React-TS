import { getDeliveryDates, resolveDeliveryDate } from './dates.ts';
import { parseItemLine } from './items.ts';
import type { DeliveryDate, ItemStore, Profile } from '../types.ts';

// WhatsApp click-to-chat uses international digits without the leading plus.
export const WHATSAPP_RECIPIENT = '601127201336';

export function buildOrderMessage(profile: Profile, deliveryDate: string, items: string): string {
  return `${profile.company} has an order for ${deliveryDate}.\n\n${items.trim()}\n\nOrdered by: ${profile.name}`;
}
export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_RECIPIENT}?text=` + encodeURIComponent(message);
}
type ShareResult = { ok: true; url: string; dates: DeliveryDate[] } |
  { ok: false; reason: 'empty' | 'date' | 'items' | 'storage'; selectedDate: string; dates: DeliveryDate[] };

// Persist the final items before giving the UI a WhatsApp URL to open.
export function prepareOrderShare(profile: Profile, selectedDate: string, value: string, store: ItemStore, now = new Date()): ShareResult {
  const dates = getDeliveryDates(now);
  const resolved = resolveDeliveryDate(selectedDate, dates);
  if (!value.trim()) return { ok: false, reason: 'empty', selectedDate: resolved, dates };
  if (resolved !== selectedDate) return { ok: false, reason: 'date', selectedDate: resolved, dates };
  if (!value.split('\n').some(line => parseItemLine(line))) return { ok: false, reason: 'items', selectedDate: resolved, dates };
  const date = dates.find(date => date.key === selectedDate)!;
  const url = buildWhatsAppUrl(buildOrderMessage(profile, date.fullLabel, value));
  if (!store.saveOrder(value)) return { ok: false, reason: 'storage', selectedDate: resolved, dates };
  return { ok: true, url, dates };
}
