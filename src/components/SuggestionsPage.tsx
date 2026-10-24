import { getSuggestionCatalog } from '../lib/suggestions.ts';
import { itemKey } from '../lib/items.ts';
import type { StoredItem } from '../types.ts';
import { Icon } from './Icon.tsx';
import { useRef, useState } from 'react';

interface Props {
  history: StoredItem[];
  hiddenSamples: string[];
  onDelete(name: string): void;
  onClear(): void;
  onUndo(): void;
  onExport(): void;
  onImport(file: File): Promise<void>;
  canUndo: boolean;
  notice: { message: string; error: boolean };
}
export function SuggestionsPage({ history, hiddenSamples, onDelete, onClear, onUndo, onExport, onImport, canUndo, notice }: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const catalog = getSuggestionCatalog(history, hiddenSamples).sort((a, b) => Number(!!b.learned) - Number(!!a.learned) || a.name.localeCompare(b.name));
  return <section id="item-catalog" aria-labelledby="page-title">
    <div className="catalog-toolbar">
      <span className="muted">{catalog.length} {catalog.length === 1 ? 'item' : 'items'}</span>
      <div className="catalog-actions">
        <button type="button" className="catalog-transfer" onClick={onExport}>Export</button>
        <button type="button" className="catalog-transfer" disabled={importing} onClick={() => importInput.current?.click()}>{importing ? 'Importing…' : 'Import'}</button>
        <button id="clear-suggestions" type="button" className="catalog-clear-all" disabled={!catalog.length || importing} onClick={() => {
          onClear();
          requestAnimationFrame(() => document.getElementById('undo-suggestions')?.focus({ preventScroll: true }));
        }}>Clear all</button>
      </div>
      <input ref={importInput} type="file" accept=".json,application/json" aria-label="Import suggestion file" hidden onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        setImporting(true);
        try { await onImport(file); } finally { setImporting(false); }
      }} />
    </div>
    {notice.message && <div className={`catalog-notice${notice.error ? ' error' : ''}`}>
      <span role="status">{notice.message}</span>
      {canUndo && <button id="undo-suggestions" type="button" className="catalog-undo" onClick={() => {
        onUndo();
        requestAnimationFrame(() => document.getElementById('clear-suggestions')?.focus({ preventScroll: true }));
      }}>Undo</button>}
    </div>}
    {catalog.length ? <table className="catalog-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col" className="catalog-delete-cell"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{catalog.map(item => <tr key={itemKey(item.name)}>
        <td>{item.name}<small className="catalog-origin">{item.learned ? 'Saved' : 'Sample'}</small></td>
        <td>{item.quantity ?? '—'}</td><td>{item.unit || '—'}</td>
        <td className="catalog-delete-cell"><button className="icon-button catalog-delete" type="button" aria-label={`Delete ${item.name}`} title={`Delete ${item.name}`} onClick={event => {
          const row = event.currentTarget.closest('tr');
          const next = row?.nextElementSibling?.querySelector('button') ?? row?.previousElementSibling?.querySelector('button');
          (next ?? document.querySelector<HTMLButtonElement>('#clear-suggestions'))?.focus({ preventScroll: true });
          onDelete(item.name);
          if (catalog.length === 1) requestAnimationFrame(() => document.getElementById('undo-suggestions')?.focus({ preventScroll: true }));
        }}><Icon name="trash" /></button></td>
      </tr>)}</tbody>
    </table> : <div className="catalog-empty"><p>No suggestions yet</p><p className="muted">Items you share will appear here.</p></div>}
  </section>;
}
