/**
 * Silent context updates to the guide. Every message is worded once, here;
 * agent/architect-brief.md quotes these exactly (a drift test checks it).
 */

export const CONTEXT_MESSAGES = {
  regionClicked: '[player] clicked region {id} ({name})',
  tookHold: '[player] took hold of me',
  tookHoldInterrupted: '[player] took hold of me; interrupted: {move}',
  handoff: '[player] let go; now viewing {view} ({exactness}); you may move me again',
  idle: '[player] idle {seconds}s',
  studyEntered: '[player] entered Study mode',
  timeWarning: '[app] about 30 seconds of our conversation remain',
};

export const IDLE_AFTER_MS = 25_000;

function fill(template, values) {
  return template.replace(/\{([a-z]+)\}/g, (_, key) => String(values[key]));
}

function describeMove(move) {
  if (move.command === 'rotateTo') return `rotate_to_view ${move.view}`;
  return move.hemisphere ? `face_region ${move.regionId} (${move.hemisphere})` : `face_region ${move.regionId}`;
}

export const formatRegionClicked = ({ id, name }) => fill(CONTEXT_MESSAGES.regionClicked, { id, name });

export const formatGrab = ({ interrupted }) =>
  interrupted
    ? fill(CONTEXT_MESSAGES.tookHoldInterrupted, { move: describeMove(interrupted) })
    : CONTEXT_MESSAGES.tookHold;

export const formatHandoff = ({ view, viewExact }) =>
  fill(CONTEXT_MESSAGES.handoff, { view, exactness: viewExact ? 'exact' : 'not exact' });

export const formatIdle = (seconds) => fill(CONTEXT_MESSAGES.idle, { seconds });

export const formatStudyEntered = () => CONTEXT_MESSAGES.studyEntered;

export const formatTimeWarning = () => CONTEXT_MESSAGES.timeWarning;

/**
 * Turns scene events into updates. Idle is reported once after 25 s without
 * input, then again only after new activity.
 */
export function createContextReporter({ send, now = Date.now, idleAfterMs = IDLE_AFTER_MS }) {
  let lastActivity = now();
  let idleReported = false;

  const activity = () => {
    lastActivity = now();
    idleReported = false;
  };

  return {
    activity,
    studyEntered() {
      activity();
      send(formatStudyEntered());
    },
    regionClicked(region) {
      activity();
      send(formatRegionClicked(region));
    },
    userInteraction(event) {
      activity();
      if (event.type === 'grab') send(formatGrab(event));
      else if (event.type === 'handoff') send(formatHandoff(event));
    },
    tick() {
      if (idleReported || now() - lastActivity < idleAfterMs) return;
      idleReported = true;
      send(formatIdle(Math.round(idleAfterMs / 1000)));
    },
  };
}
