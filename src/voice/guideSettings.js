/** Changing the guide in Settings: takes effect at the next conversation. */
import { GUIDES, normalizeGuide } from './guides.js';

export const SWITCH_NOW_WARNING = 'Switching now ends this conversation. Your new guide starts fresh.';

export function planGuideChange({ current, next, connected }) {
  const id = normalizeGuide(next);
  if (!id || id === normalizeGuide(current)) return { kind: 'none' };
  if (!connected) return { kind: 'save' };
  const { name } = GUIDES.find((guide) => guide.id === id);
  return { kind: 'next-conversation', note: `${name} will guide your next conversation.`, offerSwitchNow: true };
}
