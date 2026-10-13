import { describe, expect, it } from 'vitest';

// Imported defensively so each test fails on its own while the module is absent.
const puppetModule = await import('./puppet.js').catch(() => ({}));
const { PUPPET_BEAT_DEGREES, PUPPET_TILT_DEGREES, createPuppet, stepPuppet } = puppetModule;

// Kyle, 2026-10-13: the brain "does not gesture in a manner that would suggest
// the brain is where the voice is coming from. The brain needs to feel
// embodied, as if a puppet." His pick: a quick dip of about 2 degrees on every
// syllable, and a tilt of about 3 degrees to one side on each phrase,
// settling at each stop. It replaces the slow sway, which moved only 0.18
// degrees at the pace of her syllables.

const FRAME = 1 / 60;
const deg = (radians) => (radians * 180) / Math.PI;

// Plays a script of { at (s), beat, phraseStart } events, speaking within
// `speakingUntil` windows, at 60 frames a second.
function play({ seconds, beats = [], phrases = [], speaking = () => true, strength = () => 1, puppet = createPuppet() }) {
  const frames = [];
  const beatFrames = new Set(beats.map((t) => Math.round(t / FRAME)));
  const phraseFrames = new Set(phrases.map((t) => Math.round(t / FRAME)));
  for (let i = 0; i < Math.round(seconds / FRAME); i += 1) {
    const t = i * FRAME;
    const pose = stepPuppet(puppet, {
      dtSeconds: FRAME,
      beat: beatFrames.has(i),
      phraseStart: phraseFrames.has(i),
      speaking: speaking(t),
      strength: strength(t),
    });
    frames.push({ t, pitch: deg(pose.pitch), roll: deg(pose.roll) });
  }
  return { frames, puppet };
}

const between = (frames, from, to) => frames.filter(({ t }) => t >= from - 1e-9 && t < to - 1e-9);

// A long, lively script: beats four to six times a second, phrases with stops between.
function speech(seconds) {
  const beats = [];
  const phrases = [];
  const quiet = [];
  let t = 0;
  let phrase = 0;
  while (t < seconds - 1) {
    phrases.push(t);
    const length = 1.2 + (phrase % 3) * 0.6;
    for (let s = t; s < t + length; s += phrase % 2 ? 0.17 : 0.25) beats.push(s);
    quiet.push([t + length, t + length + 0.35]);
    t += length + 0.35;
    phrase += 1;
  }
  const speaking = (time) => !quiet.some(([a, b]) => time >= a && time < b);
  return { beats, phrases, speaking };
}

describe('Puppet speech: its size', () => {
  it('dips about 2 degrees on a syllable and tilts about 3 degrees on a phrase', () => {
    expect(PUPPET_BEAT_DEGREES).toBe(2);
    expect(PUPPET_TILT_DEGREES).toBe(3);
  });
});

describe('A beat on every syllable', () => {
  it('dips the head about 2 degrees, quickly, and is back within 0.4 s', () => {
    const { frames } = play({ seconds: 1, beats: [0] });
    const peak = frames.reduce((best, f) => (f.pitch > best.pitch ? f : best));
    expect(peak.pitch).toBeGreaterThan(1.8);
    expect(peak.pitch).toBeLessThanOrEqual(2.05);
    expect(peak.t).toBeGreaterThan(0.06);
    expect(peak.t).toBeLessThan(0.14);
    for (const f of between(frames, 0.4, 1)) expect(Math.abs(f.pitch)).toBeLessThan(0.1);
  });

  it('shows every syllable: at four a second the head rises and falls at least a degree each time', () => {
    const beats = Array.from({ length: 12 }, (_, i) => i * 0.25);
    const { frames } = play({ seconds: 3, beats });
    for (let start = 1; start < 2.75; start += 0.25) {
      const window = between(frames, start, start + 0.25).map(({ pitch }) => pitch);
      expect(Math.max(...window) - Math.min(...window), `beat at ${start} s`).toBeGreaterThan(1);
    }
  });

  it('dips toward us, never away', () => {
    const { beats, phrases, speaking } = speech(20);
    const { frames } = play({ seconds: 20, beats, phrases, speaking });
    for (const f of frames) expect(f.pitch).toBeGreaterThanOrEqual(0);
  });
});

describe('A tilt on each phrase', () => {
  it('tilts the head about 3 degrees to one side within half a second, and holds it while the phrase lasts', () => {
    const { frames } = play({ seconds: 1.5, phrases: [0] });
    const at = (t) => frames[Math.round(t / FRAME)].roll;
    expect(Math.abs(at(0.5))).toBeGreaterThan(2.5);
    for (const f of between(frames, 0.6, 1.5)) {
      expect(Math.abs(f.roll)).toBeGreaterThan(2.7);
      expect(Math.abs(f.roll)).toBeLessThanOrEqual(3.05);
    }
  });

  it('tilts the next phrase to the other side', () => {
    const speaking = (t) => t < 1.2 || t >= 1.6;
    const { frames } = play({ seconds: 2.6, phrases: [0, 1.6], speaking });
    const first = frames[Math.round(1.1 / FRAME)].roll;
    const second = frames[Math.round(2.5 / FRAME)].roll;
    expect(Math.sign(first)).not.toBe(Math.sign(second));
    expect(Math.abs(second)).toBeGreaterThan(2.5);
  });

  it('settles back at a stop', () => {
    const speaking = (t) => t < 1;
    const { frames } = play({ seconds: 2, beats: [0.2, 0.45, 0.7, 0.95], phrases: [0], speaking });
    const last = frames.at(-1);
    expect(Math.abs(last.roll)).toBeLessThan(0.3);
    expect(Math.abs(last.pitch)).toBeLessThan(0.1);
  });
});

describe('Puppet speech: its manners', () => {
  it('is perfectly still in silence', () => {
    const { frames } = play({ seconds: 3, speaking: () => false });
    expect(frames.every(({ pitch, roll }) => pitch === 0 && roll === 0)).toBe(true);
  });

  it('never jumps: no more than 0.6 degrees between frames on either axis', () => {
    const { beats, phrases, speaking } = speech(30);
    const { frames } = play({ seconds: 30, beats, phrases, speaking });
    for (let i = 1; i < frames.length; i += 1) {
      expect(Math.abs(frames[i].pitch - frames[i - 1].pitch)).toBeLessThanOrEqual(0.6);
      expect(Math.abs(frames[i].roll - frames[i - 1].roll)).toBeLessThanOrEqual(0.6);
    }
  });

  it('never dips more than 2 degrees or tilts more than 3, however fast she talks', () => {
    const fast = Array.from({ length: 80 }, (_, i) => i * 0.125);
    const { frames } = play({ seconds: 10, beats: fast, phrases: [0, 4, 8] });
    for (const f of frames) {
      expect(f.pitch).toBeLessThanOrEqual(2.05);
      expect(Math.abs(f.roll)).toBeLessThanOrEqual(3.05);
    }
  });

  // Gestures keep the rules they had: half while a region or lobe stays lit.
  it('is half the size at half strength', () => {
    const { beats, phrases, speaking } = speech(12);
    const { frames } = play({ seconds: 12, beats, phrases, speaking, strength: () => 0.5 });
    for (const f of frames) {
      expect(f.pitch).toBeLessThanOrEqual(1.03);
      expect(Math.abs(f.roll)).toBeLessThanOrEqual(1.53);
    }
  });

  it('fades out when its strength goes to zero, then is exactly still, even mid-speech', () => {
    const { beats, phrases, speaking } = speech(6);
    const { frames } = play({ seconds: 6, beats, phrases, speaking, strength: (t) => (t < 3 ? 1 : 0) });
    for (let i = 1; i < frames.length; i += 1) {
      expect(Math.abs(frames[i].roll - frames[i - 1].roll)).toBeLessThanOrEqual(0.6);
    }
    expect(between(frames, 5, 6).every(({ pitch, roll }) => pitch === 0 && roll === 0)).toBe(true);
  });

  it('stays exactly still when suppressed from the start', () => {
    const { beats, phrases, speaking } = speech(6);
    const { frames } = play({ seconds: 6, beats, phrases, speaking, strength: () => 0 });
    expect(frames.every(({ pitch, roll }) => pitch === 0 && roll === 0)).toBe(true);
  });
});
