/**
 * The transcript follows the newest line only while the reader is already at
 * the bottom; scrolling up to reread is never interrupted (Kyle, 2026-10-11).
 */
export const AT_BOTTOM_SLACK_PX = 24;

export function isAtBottom(element, slack = AT_BOTTOM_SLACK_PX) {
  if (!element) return true;
  const { scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = element;
  return scrollHeight - clientHeight - scrollTop <= slack;
}
