/**
 * Where the voice panel sits: on the right on desktop, vertically centred,
 * mirroring How to Play on the left, and small enough never to grow into the
 * brain. On phones index.html moves it to the bottom.
 */

export const VISIBLE_TRANSCRIPT_LINES = 4;

export const VOICE_PANEL_STYLE = {
  position: 'absolute',
  top: '50%',
  right: 'clamp(16px, 3vw, 48px)',
  transform: 'translateY(-50%)',
  width: 300,
  maxWidth: 'calc(100vw - 32px)',
  zIndex: 11,
  padding: '10px 12px',
  background: 'rgba(247, 240, 220, 0.94)',
  border: '1px solid #1a1814',
  fontFamily: "'EB Garamond', Georgia, serif",
  color: '#1a1814',
  textAlign: 'center',
};

export const TRANSCRIPT_STYLE = {
  maxHeight: 120,
  overflowY: 'auto',
  textAlign: 'left',
  fontSize: 13,
  lineHeight: 1.4,
  marginTop: 8,
  borderTop: '1px solid rgba(26, 24, 20, 0.2)',
  paddingTop: 6,
};

export function visibleTranscript(lines) {
  return lines.slice(-VISIBLE_TRANSCRIPT_LINES);
}
