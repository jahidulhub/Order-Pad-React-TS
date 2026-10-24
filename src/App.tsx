import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Header } from './components/Header.tsx';
import { ProfileForm } from './components/ProfileForm.tsx';
import { OrderComposer } from './components/OrderComposer.tsx';
import { SuggestionsPage } from './components/SuggestionsPage.tsx';
import { getDeliveryDates, resolveDeliveryDate } from './lib/dates.ts';
import { createItemStore, formatItemName } from './lib/items.ts';
import { DUMMY_ITEMS, getSuggestionCatalog } from './lib/suggestions.ts';
import { MAX_IMPORT_BYTES, parseSuggestionImport, serializeSuggestions } from './lib/suggestion-transfer.ts';
import { DATE_KEY, DRAFT_KEY, PROFILE_KEY, getBrowserStorage, readProfile, readValue } from './lib/storage.ts';
import { prepareOrderShare } from './lib/share.ts';
import type { Page, Profile, SuggestionSnapshot } from './types.ts';

export default function App() {
  const [storage] = useState(getBrowserStorage);
  const [profile, setProfile] = useState(() => readProfile(storage));
  const [draft, setDraft] = useState(() => readValue(storage, DRAFT_KEY) ?? '');
  const [store] = useState(() => createItemStore(storage));
  const [suggestionState, setSuggestionState] = useState(() => store.getSnapshot());
  const [undoSuggestions, setUndoSuggestions] = useState<SuggestionSnapshot | null>(null);
  const [suggestionNotice, setSuggestionNotice] = useState({ message: '', error: false });
  const [page, setPage] = useState<Page>('home');
  const [draftError, setDraftError] = useState('');
  const [dateState, setDateState] = useState(() => {
    const dates = getDeliveryDates();
    const saved = readValue(storage, DATE_KEY);
    const selectedDate = resolveDeliveryDate(saved, dates);
    return { dates, selectedDate, status: saved && saved !== selectedDate ? 'The previous delivery date is outside today through the next 7 days. Reset to tomorrow.' : '' };
  });
  const returnScroll = useRef(0);
  const navigation = useRef<{ focus: string; scroll: number } | null>(null);

  useEffect(() => {
    try { storage.setItem(DATE_KEY, dateState.selectedDate); }
    catch { setDateState(state => ({ ...state, status: 'Could not save your delivery date on this browser.' })); }
  }, [storage, dateState.selectedDate]);

  const refreshDates = useCallback(() => {
    setDateState(state => {
      const dates = getDeliveryDates();
      const selectedDate = resolveDeliveryDate(state.selectedDate, dates);
      return { dates, selectedDate, status: selectedDate === state.selectedDate ? state.status : 'The previous delivery date is outside today through the next 7 days. Reset to tomorrow.' };
    });
  }, []);
  useEffect(() => {
    const visible = () => { if (!document.hidden) refreshDates(); };
    window.addEventListener('focus', refreshDates);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refreshDates);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refreshDates]);

  useLayoutEffect(() => {
    if (!navigation.current) return;
    const { focus, scroll } = navigation.current;
    navigation.current = null;
    window.scrollTo({ top: scroll, behavior: 'instant' });
    document.getElementById(focus)?.focus({ preventScroll: true });
  }, [page, profile]);

  const changeDraft = useCallback((value: string) => {
    setDraft(value);
    try { storage.setItem(DRAFT_KEY, value); setDraftError(''); }
    catch { setDraftError('Could not save your draft. Keep this page open to avoid losing it.'); }
  }, [storage]);

  function navigate(next: Page) {
    returnScroll.current = window.scrollY;
    navigation.current = { focus: next === 'Settings' ? 'name' : 'header-back', scroll: 0 };
    setPage(next);
  }
  function goHome() {
    navigation.current = { focus: page === 'Settings' ? 'settings' : 'view-items', scroll: returnScroll.current };
    refreshDates();
    setPage('home');
  }
  function saveProfile(next: Profile): string | void {
    try { storage.setItem(PROFILE_KEY, JSON.stringify(next)); }
    catch { return 'Your browser could not save your details. Enable browser storage and try again.'; }
    navigation.current = { focus: 'items', scroll: returnScroll.current };
    setProfile(next);
    setPage('home');
    refreshDates();
  }
  function chooseDate(key: string) {
    const dates = getDeliveryDates();
    if (!dates.some(date => date.key === key)) {
      setDateState({ dates, selectedDate: resolveDeliveryDate(dateState.selectedDate, dates), status: 'That date is no longer available. Choose today or a later date.' });
    } else setDateState({ dates, selectedDate: key, status: '' });
  }
  function removeSuggestion(name: string) {
    const before = store.getSnapshot();
    const saved = store.deleteSuggestion(name);
    setSuggestionState(store.getSnapshot());
    setUndoSuggestions(before);
    setSuggestionNotice({ message: saved ? `${formatItemName(name)} removed.` : 'Could not save this change. The item may return after refresh.', error: !saved });
  }
  function clearSuggestions() {
    const before = store.getSnapshot();
    const saved = store.clearSuggestions(DUMMY_ITEMS.map(item => item.name));
    setSuggestionState(store.getSnapshot());
    setUndoSuggestions(before);
    setSuggestionNotice({ message: saved ? 'All suggestions cleared.' : 'Could not save this change. Suggestions may return after refresh.', error: !saved });
  }
  function restoreSuggestions() {
    if (!undoSuggestions) return;
    const saved = store.restoreSuggestions(undoSuggestions);
    setSuggestionState(store.getSnapshot());
    setUndoSuggestions(null);
    setSuggestionNotice({ message: saved ? 'Suggestions restored.' : 'Restored for now, but could not save the change on this browser.', error: !saved });
  }
  function exportSuggestions() {
    const state = store.getSnapshot();
    const text = serializeSuggestions(getSuggestionCatalog(state.items, state.hiddenSamples));
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `order-pad-suggestions-${getDeliveryDates()[0].key}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSuggestions(file: File) {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a JSON file smaller than 1 MB.');
      const items = parseSuggestionImport(await file.text());
      if (!items.length) {
        setSuggestionNotice({ message: 'This file has no suggestions to import.', error: false });
        return;
      }
      const before = store.getSnapshot();
      const saved = store.importSuggestions(items);
      setSuggestionState(store.getSnapshot());
      setUndoSuggestions(before);
      setSuggestionNotice({ message: saved ? `${items.length} ${items.length === 1 ? 'item' : 'items'} imported.` : 'Imported for now, but could not save the change on this browser.', error: !saved });
    } catch (error) {
      setSuggestionNotice({ message: error instanceof Error ? error.message : 'Could not read this file. Choose an Order Pad suggestion export.', error: true });
    }
  }
  function send(event: MouseEvent<HTMLButtonElement>, input: HTMLTextAreaElement) {
    if (!profile) { event.preventDefault(); return; }
    const result = prepareOrderShare(profile, dateState.selectedDate, input.value, store);
    if (!result.ok) {
      event.preventDefault();
      if (result.reason === 'empty' || result.reason === 'items') {
        input.setCustomValidity(result.reason === 'empty' ? 'Add at least one order item before sharing.' : 'Add an item name, for example Lemon 3kg.');
        input.reportValidity();
        input.focus();
      } else if (result.reason === 'date') {
        setDateState({ dates: result.dates, selectedDate: result.selectedDate, status: 'The previous delivery date is no longer available. Review the new date, then send again.' });
        document.getElementById('delivery-date')?.focus();
      } else {
        setDraftError('Could not save items for future suggestions. Allow browser storage, then tap Share again. Your draft is still here.');
        input.focus({ preventScroll: true });
      }
      return;
    }
    setSuggestionState(store.getSnapshot());
    setDraftError('');
    setUndoSuggestions(null);
    setSuggestionNotice({ message: '', error: false });
    setDateState(state => ({ ...state, dates: result.dates }));
    // A Share action cannot navigate around saving, as a directly opened link can.
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  return <main>
    <Header page={page} hasProfile={!!profile} onBack={goHome} onNavigate={navigate} />
    {!profile || page === 'Settings' ? <ProfileForm profile={profile} onSave={saveProfile} onCancel={goHome} /> :
      page === 'Suggestions' ? <SuggestionsPage history={suggestionState.items} hiddenSamples={suggestionState.hiddenSamples} onDelete={removeSuggestion} onClear={clearSuggestions} onUndo={restoreSuggestions} onExport={exportSuggestions} onImport={importSuggestions} canUndo={!!undoSuggestions} notice={suggestionNotice} /> :
      <OrderComposer profile={profile} value={draft} history={suggestionState.items} hiddenSamples={suggestionState.hiddenSamples} dates={dateState.dates} selectedDate={dateState.selectedDate} dateStatus={dateState.status} draftError={draftError} onChange={changeDraft} onDateRefresh={refreshDates} onDateChoose={chooseDate} onSend={send} />}
  </main>;
}
