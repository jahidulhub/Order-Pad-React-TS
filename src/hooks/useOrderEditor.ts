import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface EditorRefs {
  order: RefObject<HTMLElement | null>;
  items: RefObject<HTMLTextAreaElement | null>;
  composer: RefObject<HTMLDivElement | null>;
  subject: RefObject<HTMLDivElement | null>;
  actions: RefObject<HTMLDivElement | null>;
  error: RefObject<HTMLParagraphElement | null>;
}
export interface CaretRect { left: number; top: number; bottom: number }
export interface EditorApi { refresh(reveal?: boolean): void; getCaretRect(): CaretRect }

// The textarea grows in document flow. Only the action bar follows the keyboard.
export function useOrderEditor(refs: EditorRefs): RefObject<EditorApi | null> {
  const api = useRef<EditorApi | null>(null);
  const { order: orderRef, items: itemsRef, composer: composerRef, subject: subjectRef, actions: actionsRef, error: errorRef } = refs;
  useLayoutEffect(() => {
    const order = orderRef.current!;
    const items = itemsRef.current!;
    const composer = composerRef.current!;
    const subject = subjectRef.current!;
    const actions = actionsRef.current!;
    const error = errorRef.current!;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const measure = document.createElement('div');
    measure.className = 'editor-measure';
    measure.setAttribute('aria-hidden', 'true');
    document.body.append(measure);
    let frame = 0;
    let revealNext = false;
    let disposed = false;

    function measureText() {
      const style = getComputedStyle(items);
      for (const property of ['font', 'line-height', 'letter-spacing', 'word-spacing', 'tab-size', 'text-indent']) {
        measure.style.setProperty(property, style.getPropertyValue(property));
      }
      measure.style.width = items.clientWidth + 'px';
      const caret = document.createElement('span');
      caret.textContent = '\u200b';
      const position = items.selectionEnd;
      const text = items.value || items.placeholder;
      measure.replaceChildren(document.createTextNode(text.slice(0, position)), caret, document.createTextNode(text.slice(position) + '\u200b'));
      const bounds = measure.getBoundingClientRect();
      const caretBounds = caret.getBoundingClientRect();
      return {
        height: bounds.height + 2,
        caretTop: caretBounds.top - bounds.top,
        caretLeft: caretBounds.left - bounds.left,
        lineHeight: parseFloat(style.lineHeight) || 26
      };
    }

    function layout() {
      frame = 0;
      if (disposed) return;
      const reveal = revealNext;
      revealNext = false;
      const rect = composer.getBoundingClientRect();
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const text = measureText();
      const subjectStyle = getComputedStyle(subject);
      const errorStyle = getComputedStyle(error);
      const actionsHeight = actions.offsetHeight;
      const footerSpace = actionsHeight + 8;
      const minimumHeight = Math.max(0, height - (rect.top + window.scrollY) - 12);
      const subjectHeight = subject.offsetHeight + parseFloat(subjectStyle.marginBottom);
      const errorHeight = error.offsetHeight ? error.offsetHeight + parseFloat(errorStyle.marginTop) + parseFloat(errorStyle.marginBottom) : 0;
      const inputMinimum = Math.max(text.lineHeight, minimumHeight - subjectHeight - errorHeight - footerSpace - 12);
      const actionsTop = Math.max(top, top + height - actionsHeight - 12);
      root.style.setProperty('--editor-actions-left', rect.left + 'px');
      root.style.setProperty('--editor-actions-width', Math.max(0, rect.width) + 'px');
      root.style.setProperty('--editor-actions-top', actionsTop + 'px');
      root.style.setProperty('--editor-scroll-inset', (actionsHeight + 24 + Math.max(0, window.innerHeight - top - height)) + 'px');
      composer.style.setProperty('--composer-footer-space', footerSpace + 'px');
      composer.style.minHeight = minimumHeight + 'px';
      items.style.height = Math.ceil(Math.max(inputMinimum, text.height)) + 'px';
      items.scrollTop = 0;
      if (reveal && document.activeElement === items && items.selectionStart === items.selectionEnd) {
        const caretTop = items.getBoundingClientRect().top + text.caretTop;
        const caretBottom = caretTop + text.lineHeight;
        if (caretBottom > actionsTop - 10) window.scrollBy({ top: caretBottom - (actionsTop - 10), behavior: 'instant' });
        else if (caretTop < top + 10) window.scrollBy({ top: caretTop - (top + 10), behavior: 'instant' });
      }
      order.dispatchEvent(new Event('editorlayout'));
    }
    function refresh(reveal = false) {
      if (disposed) return;
      revealNext ||= reveal;
      if (!frame) frame = requestAnimationFrame(layout);
    }
    api.current = {
      refresh,
      getCaretRect() {
        const text = measureText();
        const bounds = items.getBoundingClientRect();
        return { left: bounds.left + text.caretLeft, top: bounds.top + text.caretTop, bottom: bounds.top + text.caretTop + text.lineHeight };
      }
    };
    const cleanups: (() => void)[] = [];
    function listen(target: EventTarget, type: string, listener: EventListener) {
      target.addEventListener(type, listener);
      cleanups.push(() => target.removeEventListener(type, listener));
    }
    for (const type of ['input', 'focus', 'click']) listen(items, type, () => refresh(true));
    listen(items, 'keyup', event => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes((event as KeyboardEvent).key)) refresh(true);
    });
    listen(window, 'resize', () => refresh(document.activeElement === items));
    listen(window, 'scroll', () => refresh());
    if (viewport) {
      listen(viewport, 'resize', () => refresh(document.activeElement === items));
      listen(viewport, 'scroll', () => refresh());
    }
    const observer = new ResizeObserver(() => refresh());
    for (const element of [subject, actions, error]) observer.observe(element);
    void document.fonts.ready.then(() => refresh());
    refresh();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      cleanups.forEach(cleanup => cleanup());
      measure.remove();
      api.current = null;
    };
  }, [orderRef, itemsRef, composerRef, subjectRef, actionsRef, errorRef]);
  return api;
}
