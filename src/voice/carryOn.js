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

/** 'now', or 'after-turn' while the guide speaks or has just used a tool. */
export function studyHandoverTiming({ guideSpeaking = false, msSinceTool = Infinity } = {}) {
  return guideSpeaking || msSinceTool < TOOL_JUST_RAN_MS ? 'after-turn' : 'now';
}
