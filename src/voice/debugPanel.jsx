/**
 * Developer-only panel that calls the scene commands directly, so a turn can
 * be watched landing on screen before the voice is wired (M4). It renders only
 * with VITE_VOICE_ENABLED on and ?debug=voice in the URL.
 */

import { useState } from 'react';
import brainRegions from '../data/brainRegions.json';
import { VIEWS } from './orientation.js';

export function shouldShowVoiceDebugPanel({ voiceEnabled, search }) {
  if (voiceEnabled !== true || typeof search !== 'string') return false;
  return new URLSearchParams(search).get('debug') === 'voice';
}

export function buildDebugActions() {
  const leftOnly = new Set(brainRegions.gameplayNotes.lateralized);
  const face = brainRegions.regions.flatMap((region) =>
    (leftOnly.has(region.id) ? ['left'] : ['left', 'right']).map((hemisphere) => ({
      group: 'Face region',
      label: `Face ${region.id} ${region.name} (${hemisphere})`,
      command: 'faceRegion',
      args: [region.id, { hemisphere }],
    }))
  );
  const views = VIEWS.map((view) => ({
    group: 'Rotate to view',
    label: `View ${view}`,
    command: 'rotateTo',
    args: [view],
  }));
  const highlights = brainRegions.regions.map((region) => ({
    group: 'Highlight',
    label: `Highlight ${region.id} ${region.name}`,
    command: 'highlightRegion',
    args: [region.id],
  }));
  const toggles = [
    { group: 'Highlight', label: 'Clear highlight', command: 'clearHighlight', args: [] },
    { group: 'Scene', label: 'Colour on', command: 'setColourRegions', args: [true] },
    { group: 'Scene', label: 'Colour off', command: 'setColourRegions', args: [false] },
    { group: 'Scene', label: 'Labels on', command: 'setAnnotations', args: [true] },
    { group: 'Scene', label: 'Labels off', command: 'setAnnotations', args: [false] },
  ];
  return [...face, ...views, ...highlights, ...toggles];
}

export async function runDebugAction(commands, action) {
  try {
    return await commands[action.command](...action.args);
  } catch (error) {
    return { ok: false, did: '', reason: error?.message ?? String(error) };
  }
}

const ACTIONS = buildDebugActions();
const GROUPS = [...new Set(ACTIONS.map(({ group }) => group))];

const STYLES = {
  panel: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 30,
    width: 260,
    maxHeight: 'calc(100% - 24px)',
    overflowY: 'auto',
    padding: 10,
    background: 'rgba(247, 240, 220, 0.97)',
    border: '1px solid #1a1814',
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 12,
    color: '#1a1814',
  },
  heading: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    margin: '8px 0 4px',
  },
  buttons: { display: 'flex', flexWrap: 'wrap', gap: 3 },
  button: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 11,
    padding: '1px 5px',
    background: 'transparent',
    border: '1px solid #1a1814',
    cursor: 'pointer',
  },
  result: {
    marginTop: 4,
    padding: 6,
    border: '1px dashed rgba(26, 24, 20, 0.4)',
    whiteSpace: 'pre-wrap',
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
  },
};

export function VoiceDebugPanel({ visible, commands, initialResult = null }) {
  const [last, setLast] = useState(initialResult);
  const [busy, setBusy] = useState(false);
  if (!visible) return null;

  const run = async (action) => {
    if (!commands) return;
    setBusy(true);
    setLast({ label: action.label, result: { ok: false, did: '', reason: 'running...' } });
    const result = await runDebugAction(commands, action);
    setLast({ label: action.label, result });
    setBusy(false);
  };

  return (
    <div className="voice-debug" style={STYLES.panel} aria-label="Voice debug panel">
      <div style={STYLES.heading}>Voice debug</div>
      {!commands && <div>Waiting for the brain to load (Study mode needs the voice flag).</div>}
      {last && (
        <div style={STYLES.result}>
          {`${last.label}\nok: ${String(last.result.ok)}\ndid: ${last.result.did}\nreason: ${last.result.reason}`}
        </div>
      )}
      {GROUPS.map((group) => (
        <div key={group}>
          <div style={STYLES.heading}>{group}</div>
          <div style={STYLES.buttons}>
            {ACTIONS.filter((action) => action.group === group).map((action) => (
              <button
                key={action.label}
                type="button"
                title={action.label}
                disabled={!commands || busy}
                onClick={() => run(action)}
                style={STYLES.button}
              >
                {action.label.replace(/^(Face|View|Highlight) /, '')}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
