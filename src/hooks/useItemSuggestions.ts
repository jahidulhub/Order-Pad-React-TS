import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, RefObject } from 'react';
import type { EditorApi } from './useOrderEditor.ts';
import { completeItem, findItemSuggestions, getItemContext } from '../lib/suggestions.ts';
import type { ItemContext, StoredItem, Suggestion } from '../types.ts';

interface Popup { matches: Suggestion[]; context: ItemContext; signature: string; active: number }
interface Options {
  value: string;
  history: StoredItem[];
  hiddenSamples: string[];
  onChange(value: string): void;
  items: RefObject<HTMLTextAreaElement | null>;
  panel: RefObject<HTMLDivElement | null>;
  order: RefObject<HTMLElement | null>;
  actions: RefObject<HTMLDivElement | null>;
  editor: RefObject<EditorApi | null>;
}

export function useItemSuggestions({ value, history, hiddenSamples, onChange, items, panel, order, actions, editor }: Options) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const dismissed = useRef('');
  const composing = useRef(false);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const pendingCaret = useRef<number | null>(null);
  const close = useCallback(() => setPopup(null), []);

  const update = useCallback((resetDismissal = false): Popup | null => {
    const input = items.current;
    if (resetDismissal) dismissed.current = '';
    if (!input || composing.current || document.activeElement !== input) { close(); return null; }
    const context = getItemContext(input.value, input.selectionStart, input.selectionEnd);
    if (!context) { close(); return null; }
    const signature = [context.nameStart, context.nameEnd, context.query].join('|');
    if (dismissed.current === signature) { close(); return null; }
    const matches = findItemSuggestions(context.query, history, hiddenSamples);
    if (!matches.length) { close(); return null; }
    const previous = popupRef.current;
    const next = { matches, context, signature, active: previous?.signature === signature ? previous.active : 0 };
    setPopup(next);
    popupRef.current = next;
    return next;
  }, [items, history, hiddenSamples, close]);

  const accept = useCallback((index: number) => {
    const input = items.current;
    const chosen = popupRef.current?.matches[index];
    if (!input || !chosen) return;
    const context = getItemContext(input.value, input.selectionStart, input.selectionEnd);
    if (!context) { close(); return; }
    const completed = completeItem(input.value, context, chosen);
    pendingCaret.current = completed.caret;
    close();
    onChange(completed.value);
  }, [items, close, onChange]);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && items.current) {
      const caret = pendingCaret.current;
      pendingCaret.current = null;
      items.current.focus({ preventScroll: true });
      items.current.setSelectionRange(caret, caret);
    }
    editor.current?.refresh(true);
  }, [value, items, editor]);

  const place = useCallback(() => {
    const current = popupRef.current;
    if (!current || !panel.current || !items.current || !actions.current || !editor.current) return;
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
    const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 24;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const bottomEdge = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - 8, actions.current.getBoundingClientRect().top - 8);
    const caret = editor.current.getCaretRect();
    const width = Math.min(340, items.current.getBoundingClientRect().width, rightEdge - leftEdge);
    const below = Math.max(0, bottomEdge - caret.bottom - 4);
    const above = Math.max(0, caret.top - topEdge - 4);
    const useAbove = below < Math.min(current.matches.length * 44 + 8, 228) && above > below;
    const available = useAbove ? above : below;
    if (available < 44 || caret.bottom < topEdge || caret.top > bottomEdge) { close(); return; }
    const maxHeight = Math.min(228, available);
    // Apply measurement constraints before reading height for above-caret placement.
    panel.current.style.width = width + 'px';
    panel.current.style.maxHeight = maxHeight + 'px';
    setPosition({
      width, maxHeight,
      left: Math.max(leftEdge, Math.min(caret.left, rightEdge - width)),
      top: useAbove ? Math.max(topEdge, caret.top - panel.current.offsetHeight - 4) : caret.bottom + 4
    });
  }, [panel, items, actions, editor, close]);

  useLayoutEffect(() => {
    if (!popup) return;
    place();
    const option = panel.current?.children[popup.active] as HTMLElement | undefined;
    const list = panel.current;
    if (option && list) {
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [popup, place, panel]);

  useEffect(() => {
    const onSelection = () => { if (document.activeElement === items.current) update(); };
    const outside = (event: Event) => {
      if (event.target !== items.current && !panel.current?.contains(event.target as Node)) {
        dismissed.current = popupRef.current?.signature ?? '';
        close();
      }
    };
    const element = order.current;
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('pointerdown', outside);
    element?.addEventListener('editorlayout', place);
    window.addEventListener('scroll', place, { passive: true });
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place, { passive: true });
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('pointerdown', outside);
      element?.removeEventListener('editorlayout', place);
      window.removeEventListener('scroll', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [items, panel, order, update, place, close]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing.current || event.nativeEvent.isComposing) return;
    const navigates = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    const accepts = !event.shiftKey && (event.key === 'Enter' || event.key === 'Tab');
    const previous = popupRef.current;
    const current = navigates || accepts ? update() : previous;
    if (!current) return;
    if (navigates) {
      event.preventDefault();
      const active = (current.active + (previous ? event.key === 'ArrowDown' ? 1 : -1 : 0) + current.matches.length) % current.matches.length;
      const next = { ...current, active };
      popupRef.current = next;
      setPopup(next);
    } else if (accepts) { event.preventDefault(); accept(current.active); }
    else if (event.key === 'Escape') { event.preventDefault(); dismissed.current = current.signature; close(); }
  }
  return {
    popup, position, update, accept, close, onKeyDown,
    onCompositionStart() { composing.current = true; close(); },
    onCompositionEnd() { composing.current = false; update(); }
  };
}
