/**
 * Where the guide's column sits (Kyle, 2026-10-11): a thin, tall column of
 * text on the right, clear of the title and the bar, with no box around it.
 * The text flows on the page itself. On phones index.html moves it to the foot.
 */

export const GUIDE_COLUMN_STYLE = {
  position: 'absolute',
  top: 'clamp(112px, 16vh, 156px)',
  bottom: 'calc(clamp(18px, 3vh, 28px) + 44px)',
  right: 'clamp(16px, 4vw, 56px)',
  width: 280,
  maxWidth: 'calc(100vw - 32px)',
  zIndex: 11,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'EB Garamond', Georgia, serif",
  color: '#1a1814',
  pointerEvents: 'none',
};

// Where the column starts across the page, in CSS px, from its own style:
// right clamp(16px, 4vw, 56px), 280 px wide. The brain keeps clear of it.
export function guideColumnLeftPx(width) {
  return width - Math.min(56, Math.max(16, 0.04 * width)) - GUIDE_COLUMN_STYLE.width;
}

// The column's text sits this far inside it, leaving room for its scrollbar.
export const GUIDE_TEXT_INSET_PX = 10;
// The text's right edge: what the score lines up with (Kyle, 2026-10-23).
export const GUIDE_TEXT_RIGHT = `calc(${GUIDE_COLUMN_STYLE.right} + ${GUIDE_TEXT_INSET_PX}px)`;
