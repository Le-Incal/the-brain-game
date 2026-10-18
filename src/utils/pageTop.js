/**
 * The page back at the top after the keyboard closes (Kyle's screenshot,
 * 2026-10-17: the title cut off). On an iPhone the page scrolls up to show the
 * field above the keyboard and can stay there once it has gone; the app never
 * scrolls, so the top is always right.
 */

const TEXT_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
// Long enough for the keyboard to slide away.
export const PAGE_TOP_SETTLE_MS = 350;

export function keepPageAtTop({
  win = typeof window === 'undefined' ? undefined : window,
  doc = typeof document === 'undefined' ? undefined : document,
  schedule = (fn, ms) => win.setTimeout(fn, ms),
} = {}) {
  if (!win || !doc) return () => {};
  const restore = () => {
    if ((win.scrollY || 0) !== 0) win.scrollTo(0, 0);
  };
  const onFocusOut = (event) => {
    const field = event?.target;
    if (!field || !(TEXT_FIELDS.has(field.tagName) || field.isContentEditable)) return;
    restore();
    schedule(restore, PAGE_TOP_SETTLE_MS);
  };
  doc.addEventListener('focusout', onFocusOut);
  return () => doc.removeEventListener('focusout', onFocusOut);
}
