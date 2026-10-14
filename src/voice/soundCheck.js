/**
 * Kyle, 2026-10-13: "only trigger streaming and motion if the voice talks".
 * The brain starts its greeting turn 0.6 s before she speaks, so before it
 * turns, the page asks the browser whether she may be heard, by playing a
 * short silent clip. A refusal means the welcome waits for the visitor's
 * first press; anything unclear lets her try.
 */

const SAMPLE_RATE = 8000;
const SAMPLES = 400; // 50 ms

/** A 50 ms silent WAV clip: 16-bit mono at 8 kHz. */
export function silentWav() {
  const dataBytes = SAMPLES * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // format chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a sample
  view.setUint16(34, 16, true); // bits a sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return bytes;
}

let silentSrc = null;
const defaultSrc = () => {
  silentSrc ??= URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' }));
  return silentSrc;
};

export function createSoundCheck({ createAudio = (src) => new Audio(src), src, timeoutMs = 1500 } = {}) {
  return {
    /** Resolves false only when the browser refuses sound until a press. */
    async allowed() {
      let timer = null;
      try {
        const audio = createAudio(src ?? defaultSrc());
        const played = Promise.resolve(audio.play()).then(() => {
          audio.pause();
          return true;
        });
        const slow = new Promise((resolve) => {
          timer = setTimeout(() => resolve(true), timeoutMs);
        });
        return await Promise.race([played, slow]);
      } catch (error) {
        return error?.name !== 'NotAllowedError';
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    },
  };
}
