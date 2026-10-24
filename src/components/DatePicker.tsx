import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DeliveryDate } from '../types.ts';

interface Props {
  dates: DeliveryDate[];
  selectedDate: string;
  status: string;
  subject: RefObject<HTMLDivElement | null>;
  onRefresh(): void;
  onChoose(key: string): void;
}
export function DatePicker({ dates, selectedDate, status, subject, onRefresh, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const selected = dates.find(date => date.key === selectedDate)!;
  const label = selected.tomorrow ? 'Tomorrow' : selected.today ? 'Today' : selected.label;
  const position = useCallback(() => {
    if (!picker.current || !button.current || !subject.current) return;
    const anchor = button.current.getBoundingClientRect();
    const bounds = subject.current.getBoundingClientRect();
    const width = picker.current.offsetWidth;
    const left = Math.max(0, Math.min(anchor.left - bounds.left, subject.current.clientWidth - width));
    picker.current.style.left = left + 'px';
    picker.current.style.top = (anchor.bottom - bounds.top + 7) + 'px';
    picker.current.style.setProperty('--arrow-left', Math.max(14, Math.min(anchor.left - bounds.left - left + anchor.width / 2 - 5, width - 24)) + 'px');
  }, [subject]);

  useLayoutEffect(() => {
    if (open) {
      position();
      picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    }
  }, [open, selectedDate, dates, position]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!picker.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', position);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', position);
    };
  }, [open, position]);
  function close() { setOpen(false); button.current?.focus({ preventScroll: true }); }

  return <>
    <button ref={button} id="delivery-date" type="button" className={selected.sunday ? 'sunday' : undefined} aria-haspopup="dialog" aria-expanded={open} aria-controls="date-picker" aria-label={`Delivery date: ${selected.tomorrow || selected.today ? label + ', ' : ''}${selected.fullLabel}. Change date`} onClick={() => { if (!open) onRefresh(); setOpen(!open); }}>{label}</button>
    {open && <div ref={picker} id="date-picker" role="dialog" aria-labelledby="date-picker-title" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== button.current) setOpen(false);
    }}>
      <p id="date-picker-title">Choose a delivery date</p>
      <p id="date-range" className="muted date-help">{dates[0].shortLabel} – {dates.at(-1)!.shortLabel} · Today + 7 days</p>
      <div id="date-options">{dates.map(date => <button key={date.key} type="button" className={`date-option${date.sunday ? ' sunday' : ''}`} aria-pressed={date.key === selectedDate} aria-label={`${date.tomorrow ? 'Tomorrow, ' : date.today ? 'Today, ' : ''}${date.fullLabel}`} onClick={() => { onChoose(date.key); close(); }}>
        <span className="date-weekday">{date.weekdayShort}</span><span className="date-number">{date.dayNumber}</span>
        {date.key === selectedDate && <span className="date-check" aria-hidden="true">✓</span>}
      </button>)}</div>
    </div>}
    <p id="date-status" className="muted" role="status">{status}</p>
  </>;
}
