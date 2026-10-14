/**
 * Kyle, 2026-10-13: "Ok first click turn[s the voice on]". Chrome allows a
 * page to play sound only after the visitor has clicked, tapped or pressed a
 * key on the site, or after many earlier visits with sound (staging had
 * earned that; brain-game.io had not). So the welcome often streams silently
 * on arrival. The first interaction anywhere on the page turns Sylvi's voice
 * on at the word she has reached; one before she starts lets her start aloud.
 */

// The presses that grant a page sound: a mouse press is granted by the time
// it is released, a touch on release. Listened for before the page handles them.
export const FIRST_TAP_EVENTS = ['pointerup', 'keydown', 'touchend'];

// The Voice and Motion switches act on their own; a press there would turn the
// voice on, then the switch's own click would turn it straight off again.
const SWITCH_SELECTOR = '.guide-switch';

/** 'unlock' the welcome's voice now, 'wait' for the next press, or 'stop' listening. */
export function firstTapAction({ welcomeState, onSwitch = false, voiceChosen = false }) {
  if (onSwitch || voiceChosen) return 'stop';
  if (welcomeState === 'silent') return 'unlock';
  if (welcomeState === 'none') return 'wait';
  return 'stop';
}

/**
 * Listens on `target` (the document) for the visitor's first press.
 * `state()` gives { welcomeState, voiceChosen }; `unlock()` turns the voice on
 * and resolves true if it is heard. Returns a function that stops listening.
 */
export function listenForFirstTap({ target, state, unlock }) {
  let stopped = false;
  let busy = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const type of FIRST_TAP_EVENTS) target.removeEventListener(type, onPress, true);
  };
  async function onPress(event) {
    if (stopped || busy) return;
    const onSwitch = Boolean(event?.target?.closest?.(SWITCH_SELECTOR));
    const action = firstTapAction({ ...state(), onSwitch });
    if (action === 'stop') {
      stop();
      return;
    }
    if (action === 'wait') return;
    busy = true;
    try {
      if (await unlock()) stop();
    } finally {
      busy = false;
    }
  }
  for (const type of FIRST_TAP_EVENTS) target.addEventListener(type, onPress, true);
  return stop;
}
