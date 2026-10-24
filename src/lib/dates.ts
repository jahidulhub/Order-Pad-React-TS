import type { DeliveryDate } from '../types.ts';

// Local calendar days avoid UTC date changes and daylight-saving offsets.
export function getDeliveryDates(now = new Date()): DeliveryDate[] {
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 12);
    return {
      key: [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
      today: index === 0,
      tomorrow: index === 1,
      sunday: date.getDay() === 0,
      weekdayShort: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayNumber: String(date.getDate()),
      shortLabel: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      label: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
      fullLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    };
  });
}

export function resolveDeliveryDate(savedDate: string | null, dates: DeliveryDate[]): string {
  return dates.some(date => date.key === savedDate) ? savedDate! : dates.find(date => date.tomorrow)!.key;
}
