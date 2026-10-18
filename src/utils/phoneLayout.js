/**
 * Whether the app is laid out for a phone (Kyle, 2026-10-17): the same 640 px
 * and under as the page's phone styles in index.html.
 */
import { useEffect, useState } from 'react';
import { PHONE_MAX_WIDTH } from './composition.js';

export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

export function isPhoneLayout(win = typeof window === 'undefined' ? undefined : window) {
  try {
    return Boolean(win?.matchMedia?.(PHONE_QUERY).matches);
  } catch {
    return false;
  }
}

/** True on a phone, and follows the width as it changes (a phone turned on its side). */
export function usePhoneLayout() {
  const [phone, setPhone] = useState(() => isPhoneLayout());
  useEffect(() => {
    let query;
    try {
      query = window.matchMedia(PHONE_QUERY);
    } catch {
      return undefined;
    }
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return phone;
}
