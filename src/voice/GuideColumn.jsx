/**
 * The guide's column (Kyle, 2026-10-11): the conversation as streaming text,
 * the quill marking where to write, two small switches for Voice and Motion,
 * and, under them, the sound notice.
 *
 * Presentational only: VoicePanel owns the state and the SDK.
 */
import quillSource from '../assets/quill.svg?raw';
import { GUIDE_COLUMN_STYLE } from './voicePanelLayout.js';
import { completedSentences } from './transcriptStream.js';

const INK = '#1a1814';
const PARCHMENT = '#f7f0dc';
// Space between the switches and the notice under them (Kyle's review).
export const NOTICE_GAP_PX = 20;
export const SWITCH_SIZE = { width: 20, height: 11, knob: 7 };
export const QUILL_HEIGHT_PX = 40;

// The quill takes its size from CSS, so drop the drawing's own width and height.
const QUILL_SVG = quillSource.replace(/\s(width|height)="[^"]*"/g, '');

const HALO = `0 0 6px ${PARCHMENT}, 0 0 12px ${PARCHMENT}, 0 0 2px ${PARCHMENT}`;

const STYLES = {
  column: GUIDE_COLUMN_STYLE,
  transcript: {
    flex: '1 1 auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    pointerEvents: 'auto',
    paddingRight: 10,
    // Earlier lines fade under a soft top edge and return to full contrast
    // as they scroll into the middle of the column.
    maskImage: 'linear-gradient(to bottom, transparent 0, #000 56px)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 56px)',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(26, 24, 20, 0.35) transparent',
    outline: 'none',
  },
  // Lines rest just above the field and grow upward, like a page being written.
  lines: { marginTop: 'auto', paddingTop: 56 },
  guideLine: {
    margin: '0 0 12px',
    fontSize: 16,
    lineHeight: 1.5,
    fontStyle: 'normal',
    color: INK,
    textShadow: HALO,
  },
  visitorLine: {
    margin: '0 0 12px',
    fontSize: 16,
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: '#4a4036',
    textShadow: HALO,
  },
  latest: {
    alignSelf: 'flex-end',
    marginTop: 4,
    pointerEvents: 'auto',
    background: 'transparent',
    border: 'none',
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 13,
    color: '#4a4036',
    cursor: 'pointer',
    padding: '4px 2px',
  },
  write: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 14,
    paddingBottom: 1,
    borderBottom: '0.6px solid rgba(26, 24, 20, 0.35)',
    pointerEvents: 'auto',
  },
  quill: {
    display: 'block',
    flex: 'none',
    height: QUILL_HEIGHT_PX,
    width: 30,
    marginBottom: -1,
    marginLeft: -2,
    color: INK,
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    background: 'transparent',
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 15,
    color: INK,
    padding: '0 0 4px',
    outline: 'none',
  },
  switches: { display: 'flex', gap: 22, marginTop: 14, pointerEvents: 'auto' },
  notice: {
    marginTop: NOTICE_GAP_PX,
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 1.35,
    color: 'rgba(26, 24, 20, 0.7)',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: 0,
    pointerEvents: 'auto',
  },
};

/**
 * What to say under the switches, if anything: an invitation while the voice
 * is off, progress while it wakes, or why it could not.
 */
export function noticeFor(phase, message, name, { welcome = null, micRefused = false, carryingOn = false } = {}) {
  if (phase === 'unavailable' && message) return { text: message };
  // Carrying on into a fresh session is not waking: the visitor sees nothing (Kyle, 2026-10-13).
  if (carryingOn && (phase === 'requesting' || phase === 'connecting')) return null;
  // Without the microphone the guide carries on in writing.
  if (micRefused && (phase === 'connected' || phase === 'resting')) return { text: `Microphone off. Write to ${name} below.` };
  if (phase === 'requesting' || phase === 'connecting') return { text: message ?? `Waking ${name}…` };
  if (phase === 'idle') {
    // Once the welcome is heard, sound is already on: only the microphone remains.
    if (welcome === 'audible') return { text: `Allow the microphone to speak with ${name}.`, invite: true };
    return { text: `Turn on sound and allow the microphone to speak with ${name}.`, invite: true };
  }
  return null;
}

/**
 * The Voice switch follows the visitor's choice (Kyle, 2026-10-11): once the
 * welcome is heard it reads On and stays On until they turn it off, so a press
 * to silence the brain never turns the voice on instead.
 */
export function voiceSwitchOn({ wanted, conversation, welcomeState }) {
  return Boolean(wanted || conversation || welcomeState === 'audible');
}

/** A small switch, like Atlas's, in ink and paper. The label is part of the target. */
export function Switch({ label, checked, onChange }) {
  const { width, height, knob } = SWITCH_SIZE;
  const inset = (height - knob) / 2;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      className="guide-switch"
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 24,
        minWidth: 24,
        padding: '0 2px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 14,
        color: INK,
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          width,
          height,
          borderRadius: height / 2,
          boxSizing: 'border-box',
          background: checked ? INK : 'transparent',
          border: checked ? 'none' : '0.8px solid rgba(26, 24, 20, 0.4)',
          transition: 'background 0.2s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: checked ? inset : inset - 0.8,
            left: checked ? width - knob - inset : inset - 0.8,
            width: knob,
            height: knob,
            borderRadius: '50%',
            background: checked ? '#fff' : 'rgba(26, 24, 20, 0.55)',
            transition: 'left 0.2s ease',
          }}
        />
      </span>
    </button>
  );
}

function TranscriptLine({ entry }) {
  const visible = entry.text.slice(0, entry.shown);
  const spoken = entry.done ? entry.text : completedSentences(visible);
  return (
    <p className={entry.fromGuide ? 'guide-line' : 'visitor-line'} style={entry.fromGuide ? STYLES.guideLine : STYLES.visitorLine}>
      <span aria-hidden="true">{visible}</span>
      <span className="visually-hidden">{spoken}</span>
    </p>
  );
}

export function GuideColumnView({
  guideName,
  entries,
  following,
  onLatest,
  transcriptRef,
  onTranscriptScroll,
  draft,
  onDraft,
  onSend,
  voice,
  motion,
  notice,
}) {
  const noticeText = typeof notice === 'string' ? notice : notice?.text;
  const submit = (event) => {
    event.preventDefault();
    onSend?.();
  };
  return (
    <aside className="guide-column" aria-label={`Conversation with ${guideName}`} style={STYLES.column}>
      <div
        className="guide-transcript"
        role="log"
        aria-live="polite"
        tabIndex={0}
        ref={transcriptRef}
        onScroll={onTranscriptScroll}
        style={STYLES.transcript}
      >
        <div style={STYLES.lines}>
          {entries.map((entry) => (
            <TranscriptLine key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
      {!following && (
        <button type="button" className="guide-latest" onClick={onLatest} style={STYLES.latest}>
          Latest
        </button>
      )}
      <form className="guide-write" onSubmit={submit} style={STYLES.write}>
        <span className="guide-quill" aria-hidden="true" style={STYLES.quill} dangerouslySetInnerHTML={{ __html: QUILL_SVG }} />
        <label htmlFor="guide-input" className="visually-hidden">
          Write to {guideName}
        </label>
        <input
          id="guide-input"
          type="text"
          autoComplete="off"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={`Write to ${guideName}…`}
          style={STYLES.input}
        />
      </form>
      <div className="guide-switches" style={STYLES.switches}>
        <Switch label="Voice" checked={voice.on} onChange={voice.onChange} />
        <Switch label="Motion" checked={motion.on} onChange={motion.onChange} />
      </div>
      {noticeText ? (
        notice?.onActivate ? (
          <button type="button" className="guide-notice" style={{ ...STYLES.notice, cursor: 'pointer' }} onClick={notice.onActivate}>
            {noticeText}
          </button>
        ) : (
          <div className="guide-notice" role="status" style={STYLES.notice}>
            {noticeText}
          </div>
        )
      ) : null}
    </aside>
  );
}
