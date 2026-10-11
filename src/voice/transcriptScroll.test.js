import { describe, expect, it } from 'vitest';

const scrollModule = await import('./transcriptScroll.js').catch(() => ({}));
const { isAtBottom, AT_BOTTOM_SLACK_PX } = scrollModule;

// Kyle, 2026-10-11: the visitor can scroll up and down through the text. New
// lines keep the column at the bottom only while the reader is already there.
describe('Following the newest line', () => {
  it('counts as at the bottom within a small slack', () => {
    expect(AT_BOTTOM_SLACK_PX).toBe(24);
    expect(isAtBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(isAtBottom({ scrollTop: 580, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(isAtBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
  });

  it('treats a column with nothing to scroll as at the bottom', () => {
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true);
    expect(isAtBottom(null)).toBe(true);
  });
});
