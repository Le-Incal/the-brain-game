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
// A choice plays its own welcome (choiceWelcome.js); the message box is for writing.
export const CHOICE_SELECTOR = '.arrival-study, .arrival-play, .bar-study, .bar-play';
export const FIELD_SELECTOR = 'input, textarea, [contenteditable="true"]';

/**
 * What the press does: 'greet' (start a welcome that waits for sound, from the
 * top), 'prime' (let her start aloud when her moment comes), 'unlock' (join a
 * silent welcome), 'wait' for the next press, or 'stop' listening.
 *
 * Kyle, 2026-10-13: "only trigger streaming and motion if the voice talks".
 * Where the browser refuses sound, the welcome waits ('held'), unstarted.
 */
export function firstTapAction({ welcomeState, onSwitch = false, onChoice = false, inField = false, voiceChosen = false }) {
  if (voiceChosen) return 'stop';
  if (welcomeState === 'held') return onSwitch || onChoice || inField ? 'wait' : 'greet';
  if (onSwitch) return 'stop';
  if (welcomeState === 'silent') return 'unlock';
  if (welcomeState === 'none') return 'prime';
  return 'stop';
}

/**
 * Listens on `target` (the document) for the visitor's first press.
 * `state()` gives { welcomeState, voiceChosen }. `greet()` starts a waiting
 * welcome and returns true if it began; `prime()` lets the recordings play
 * later (Safari allows sound only from inside a press); `unlock()` turns a
 * silent welcome's voice on and resolves true if it is heard. Returns a
 * function that stops listening.
 */
export function listenForFirstTap({ target, state, unlock = async () => true, greet = () => true, prime = () => {} }) {
  let stopped = false;
  let busy = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const type of FIRST_TAP_EVENTS) target.removeEventListener(type, onPress, true);
  };
  async function onPress(event) {
    if (stopped || busy) return;
    const within = (selector) => Boolean(event?.target?.closest?.(selector));
    const action = firstTapAction({
      ...state(),
      onSwitch: within(SWITCH_SELECTOR),
      onChoice: within(CHOICE_SELECTOR),
      inField: within(FIELD_SELECTOR),
    });
    if (action === 'stop') {
      stop();
      return;
    }
    if (action === 'wait') return;
    if (action === 'prime') {
      prime();
      return;
    }
    if (action === 'greet') {
      // Inside the press: prime first, so the voice may play when it is due.
      prime();
      if (greet()) stop();
      return;
    }
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
