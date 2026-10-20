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
  mode: '[app] mode: {mode}',
  // Kyle, 2026-10-11: a miss is taught at once, so it goes as a prompt.
  missed: '[app] missed: "{word}" belongs to {region}, {where}. Why: {why}',
  welcomePlayed: '[app] the welcome has played',
  resumed: '[app] conversation so far: {lines}',
  section: '[app] the section is {state}',
  timeWarning: '[app] about 30 seconds of our conversation remain',
  tourWaiting: '[app] the tour is waiting at stop {stop} of {of}',
  // Kyle, 2026-10-11: the coach's offers. These go as prompts the guide answers now.
  streak: '[app] streak: {count} caught in a row at {level} ({settings}); offer: {offers}',
  struggling: '[app] struggling: {pattern} at {level} ({settings}); offer: {offers}',
  firstPlay: '[app] the player pressed Play for the first time; offer: a quick example first',
  // Kyle, 2026-10-20: when Study brings her in, she offers a tour or a region.
  studyOffer: '[app] the player opened Study; offer: a tour, or a region to look at',
  // Kyle, 2026-10-13: a conversation carried on in a fresh session picks up where it was.
  carriedOnTour: '[app] the conversation carried on mid-tour, {where}: pick up where you left off, with no greeting',
  carriedOnSpeaking: '[app] the conversation carried on mid-sentence: finish your thought briefly, with no greeting',
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

export const formatMode = (mode) => fill(CONTEXT_MESSAGES.mode, { mode });

export const formatMiss = ({ word, region, where, why }) => fill(CONTEXT_MESSAGES.missed, { word, region, where, why });

export const formatWelcomePlayed = () => CONTEXT_MESSAGES.welcomePlayed;

export const formatStudyOffer = () => CONTEXT_MESSAGES.studyOffer;
export const formatSection = (open) => fill(CONTEXT_MESSAGES.section, { state: open ? 'open' : 'closed' });

// A conversation woken from rest carries the last few lines, kept short.
const RESUME_LINES = 10;
const RESUME_LINE_CHARS = 200;

export function formatResume(entries, guideName) {
  const lines = entries.slice(-RESUME_LINES).map((entry) => {
    const text = String(entry.text ?? '').replace(/\s+/g, ' ').trim();
    const short = text.length > RESUME_LINE_CHARS ? `${text.slice(0, RESUME_LINE_CHARS - 1)}…` : text;
    return `${entry.fromGuide ? guideName : 'Visitor'}: ${short}`;
  });
  return fill(CONTEXT_MESSAGES.resumed, { lines: lines.join(' | ') });
}

export const formatTimeWarning = () => CONTEXT_MESSAGES.timeWarning;

export const formatTourWaiting = ({ stop, of }) => fill(CONTEXT_MESSAGES.tourWaiting, { stop, of });

/**
 * After the conversation carried on in a fresh session: a prompt to pick up a
 * tour or a cut-off sentence, or null when the guide was quiet with no tour.
 */
export function formatCarryOn({ tour = null, wasSpeaking = false } = {}) {
  if (tour) {
    const where = tour.stop >= 1 ? `at stop ${tour.stop} of ${tour.of}` : 'at its start';
    return fill(CONTEXT_MESSAGES.carriedOnTour, { where });
  }
  return wasSpeaking ? CONTEXT_MESSAGES.carriedOnSpeaking : null;
}

function speedText(speed) {
  const value = Number(speed);
  return Number.isInteger(Math.round(value * 1000) / 100) ? value.toFixed(1) : String(Number(value.toFixed(2)));
}

function describeSettings({ speed, colour, exact }) {
  return `${exact ? 'exact region' : 'lobe counts'}, colour ${colour ? 'on' : 'off'}, ${speedText(speed)}×`;
}

/** The game coach's streak or struggle, worded for the guide. */
export function formatCoachSignal(signal) {
  const settings = describeSettings(signal.settings);
  if (signal.kind === 'streak') {
    const offers = signal.offers.length ? signal.offers.join(' or ') : 'nothing harder';
    return fill(CONTEXT_MESSAGES.streak, { count: signal.count, level: signal.level, settings, offers });
  }
  const pattern = signal.inARow ? `${signal.inARow} missed in a row` : `${signal.missed} of the last ${signal.of} missed`;
  const offers = signal.offers.length ? signal.offers.join(' or ') : 'nothing easier';
  return fill(CONTEXT_MESSAGES.struggling, { pattern, level: signal.level, settings, offers });
}

export const formatFirstPlay = () => CONTEXT_MESSAGES.firstPlay;

/** A miss, and the struggle it may complete, in one prompt: the guide never gets two at once. */
export const formatMissPrompt = (miss, signal = null) =>
  signal ? `${formatMiss(miss)}\n${formatCoachSignal(signal)}` : formatMiss(miss);

/** The app's prompts travel as user messages; the transcript never shows them. */
export const isAppPrompt = (text) => /^\s*\[app\]/.test(String(text ?? ''));

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
    modeChanged(mode) {
      send(formatMode(mode));
    },
    welcomePlayed() {
      send(formatWelcomePlayed());
    },
    sectionChanged(open) {
      send(formatSection(open));
    },
    resumed(entries, guideName) {
      send(formatResume(entries, guideName));
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
