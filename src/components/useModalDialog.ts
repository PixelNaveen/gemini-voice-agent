import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Makes a mounted element behave like a modal dialog.
 *
 * The caller keeps its own `isOpen` state; this only adds the behaviour a dialog owes
 * the user: focus enters the panel, Tab and Shift+Tab cycle within it and cannot reach
 * the page behind, Escape asks the owner to close, focus returns to whatever opened it,
 * and every non-ancestor of the panel is marked `inert` so even a programmatic
 * `.focus()` on the background cannot get out.
 *
 * Attach the returned ref to the panel element and give that panel `tabIndex={-1}` plus
 * `role="dialog"`, `aria-modal` and `aria-labelledby`.
 */
export function useModalDialog<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void
): React.RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  // Read through a ref so an inline `onClose` (a new function every parent render) does
  // not tear the trap down and recapture `document.activeElement` on every frame.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const inerted: HTMLElement[] = [];
    let cursor: HTMLElement | null = dialog;
    while (cursor && cursor.parentElement && cursor.parentElement !== document.body) {
      const parent: HTMLElement = cursor.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === cursor || !(sibling instanceof HTMLElement)) continue;
        if (sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        inerted.push(sibling);
      }
      cursor = parent;
    }

    const getFocusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      );

    const focusables = getFocusable();
    (focusables[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const targets = getFocusable();
      if (targets.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      const isInside = active instanceof HTMLElement && dialog.contains(active);

      if (event.shiftKey) {
        if (!isInside || active === first || active === dialog) {
          event.preventDefault();
          last.focus();
        }
      } else if (!isInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      for (const element of inerted) element.removeAttribute('inert');
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  return dialogRef;
}
