// A tool that ran this recently is probably the guide's own switch_mode, with
// its spoken follow-up still to come.
const TOOL_JUST_RAN_MS = 2_000;

/**
 * Kyle, 2026-10-20: "I just selected study but nothing happened." A
 * conversation rests after a quiet spell, and in a game it is mostly quiet, so
 * pressing Study must bring Sylvi in from any state: keep a live conversation
 * going (Kyle, 2026-10-23: no fresh session for Study), wake a resting one, or
 * start one where there is none, unless the visitor turned the voice off.
 * `offer` says whether she opens Study by offering a tour or a region (Kyle's
 * choice): not when she switched to Study herself, since she is already
 * speaking about it.
 */
export function studyEntry({ from, to, phase, voiceOff = false, msSinceTool = Infinity }) {
  if (to !== 'study' || from === 'study') return { action: 'none', offer: false };
  const offer = msSinceTool >= TOOL_JUST_RAN_MS;
  switch (phase) {
    case 'connected':
      return { action: 'stay', offer };
    case 'resting':
      return { action: 'wake', offer };
    case 'idle':
      return voiceOff ? { action: 'none', offer: false } : { action: 'start', offer };
    case 'requesting':
    case 'connecting':
      return { action: 'none', offer };
    default:
      return { action: 'none', offer: false };
  }
}
