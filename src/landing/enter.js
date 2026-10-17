/**
 * Enter (Kyle, 2026-10-15): "When you click Enter, that acts as your action to
 * turn on your mic and your speakers." The press asks the browser for the
 * microphone (granted once for the site), lets it go again, marks the arrival
 * and goes into the app, which opens the conversation at once where Sylvi can
 * be heard (src/voice/arrivalEnter.js). A refusal, or no microphone, still goes
 * in: she can be written to.
 */

export const ENTERED_KEY = 'brainGame.entered';
export const APP_PATH = '/app';

export function createEnter({ mediaDevices, storage, go, now = () => Date.now() }) {
  let entering = null;
  async function askForMicrophone() {
    if (!mediaDevices?.getUserMedia) return;
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch {
      // Refused or unavailable: she can still be written to.
    }
  }
  return function enter() {
    if (entering) return entering;
    entering = (async () => {
      await askForMicrophone();
      try {
        storage?.setItem(ENTERED_KEY, String(now()));
      } catch {
        // No storage: the app waits for a press, as before.
      }
      go(APP_PATH);
    })();
    return entering;
  };
}
