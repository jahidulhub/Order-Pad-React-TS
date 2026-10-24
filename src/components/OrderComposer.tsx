import { useRef } from 'react';
import type { MouseEvent } from 'react';
import { useOrderEditor } from '../hooks/useOrderEditor.ts';
import { useItemSuggestions } from '../hooks/useItemSuggestions.ts';
import { formatItemAmount, itemKey } from '../lib/items.ts';
import type { DeliveryDate, Profile, StoredItem } from '../types.ts';
import { DatePicker } from './DatePicker.tsx';
import { Icon } from './Icon.tsx';

interface Props {
  profile: Profile;
  value: string;
  history: StoredItem[];
  hiddenSamples: string[];
  dates: DeliveryDate[];
  selectedDate: string;
  dateStatus: string;
  draftError: string;
  onChange(value: string): void;
  onDateRefresh(): void;
  onDateChoose(key: string): void;
  onSend(event: MouseEvent<HTMLButtonElement>, input: HTMLTextAreaElement): void;
}
export function OrderComposer(props: Props) {
  const { profile, value, history, hiddenSamples, dates, selectedDate, dateStatus, draftError, onChange, onDateRefresh, onDateChoose, onSend } = props;
  const order = useRef<HTMLElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLTextAreaElement>(null);
  const subject = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const error = useRef<HTMLParagraphElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const editor = useOrderEditor({ order, composer, items, subject, actions, error });
  const suggestions = useItemSuggestions({ value, history, hiddenSamples, onChange, items, panel, order, actions, editor });
  const popup = suggestions.popup;

  function clearItems() {
    const input = items.current!;
    input.setCustomValidity('');
    input.setSelectionRange(0, 0);
    input.focus({ preventScroll: true });
    suggestions.close();
    onChange('');
    editor.current?.refresh(true);
  }

  return <section id="order" ref={order} aria-label="Order draft">
    <div className="composer" ref={composer}>
      <div className="subject" ref={subject}>
        <span id="company-subject">{profile.company}</span> has an order for{' '}
        <DatePicker dates={dates} selectedDate={selectedDate} status={dateStatus} subject={subject} onRefresh={onDateRefresh} onChoose={onDateChoose} />
      </div>
      <textarea ref={items} id="items" aria-label="Order items" rows={1} placeholder="Add items…" value={value}
        aria-controls="item-suggestions" aria-autocomplete="list" aria-expanded={!!popup} aria-activedescendant={popup ? `item-option-${popup.active}` : undefined}
        onChange={event => { event.currentTarget.setCustomValidity(''); onChange(event.currentTarget.value); suggestions.update(true); }}
        onClick={() => suggestions.update(true)} onFocus={() => suggestions.update()} onBlur={suggestions.close}
        onCompositionStart={suggestions.onCompositionStart} onCompositionEnd={suggestions.onCompositionEnd}
        onKeyDown={suggestions.onKeyDown} onKeyUp={event => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) suggestions.update(); }} />
      <p id="draft-error" ref={error} className="error" role="status">{draftError}</p>
      <div className="composer-actions" ref={actions}>
        {value.length > 0 && <button id="clear-items" className="icon-button clear-button" type="button" aria-label="Clear order items" aria-controls="items" title="Clear items"
          onPointerDown={event => { if (document.activeElement === items.current && event.isPrimary) event.preventDefault(); }}
          onClick={clearItems}><Icon name="eraser" /></button>}
        <button id="send-whatsapp" type="button" className="primary share-button" aria-label="Share order on WhatsApp"
          onPointerDown={event => { if (document.activeElement === items.current && event.isPrimary) event.preventDefault(); }}
          onClick={event => { suggestions.close(); onSend(event, items.current!); }}><Icon name="whatsapp" /> Share</button>
      </div>
    </div>
    {popup && <div id="item-suggestions" className="item-suggestions" ref={panel} role="listbox" aria-label="Item suggestions" style={suggestions.position}>
      {popup.matches.map((item, index) => {
        const at = itemKey(item.name).indexOf(itemKey(popup.context.query));
        return <div key={itemKey(item.name)} id={`item-option-${index}`} className="item-option" role="option" aria-selected={index === popup.active} onPointerDown={event => event.preventDefault()} onClick={() => suggestions.accept(index)}>
          <span className="item-option-icon" aria-hidden="true">▧</span>
          <span className="item-option-name">{at < 0 ? item.name : <>{item.name.slice(0, at)}<mark>{item.name.slice(at, at + popup.context.query.length)}</mark>{item.name.slice(at + popup.context.query.length)}</>}</span>
          <span className="item-option-detail">{formatItemAmount(item) || 'Saved item'}</span>
        </div>;
      })}
    </div>}
    <div className="sr-only" role="status">{popup ? `${popup.matches.length} item suggestions. Use arrow keys to choose and Enter to insert.` : ''}</div>
  </section>;
}
