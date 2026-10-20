/**
 * Kyle, 2026-10-13: "Start a new session when moving to a study". Study
 * begins with a full session; to the visitor it is the same conversation.
 * A resting conversation wakes fresh anyway, and an idle one has no one to restart.
 */
export function freshSessionOnModeChange({ from, to, phase }) {
  return to === 'study' && from !== 'study' && phase === 'connected';
}

// A tool that ran this recently is probably the guide's own switch_mode, with
// its spoken follow-up still to come.
const TOOL_JUST_RAN_MS = 2_000;
// However long the guide's turn, the fresh session starts within this.
export const STUDY_HANDOVER_WAIT_MS = 20_000;

/**
 * Kyle, 2026-10-20: "I just selected study but nothing happened." A
 * conversation rests after 30 s of quiet, and in a game it is mostly quiet, so
 * pressing Study must bring Sylvi in from any state: hand a live conversation
 * over to a fresh one (as before), wake a resting one, or start one where
 * there is none, unless the visitor turned the voice off. `offer` says whether
 * she opens Study by offering a tour or a region (Kyle's choice): not when she
 * switched to Study herself, since she is already speaking about it.
 */
export function studyEntry({ from, to, phase, voiceOff = false, msSinceTool = Infinity }) {
  if (to !== 'study' || from === 'study') return { action: 'none', offer: false };
  const offer = msSinceTool >= TOOL_JUST_RAN_MS;
  switch (phase) {
    case 'connected':
      return { action: 'handover', offer };
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

/** 'now', or 'after-turn' while the guide speaks or has just used a tool. */
export function studyHandoverTiming({ guideSpeaking = false, msSinceTool = Infinity } = {}) {
  return guideSpeaking || msSinceTool < TOOL_JUST_RAN_MS ? 'after-turn' : 'now';
}
