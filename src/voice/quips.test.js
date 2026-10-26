import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kyle, 2026-10-23: a short, encouraging quip when the player gets one right.
// The server records them once; the page plays one on each catch, unless the
// guide is already speaking, and writes it in the conversation.

const quipsModule = await import('./quips.js').catch(() => ({}));
const { createQuipPlayer, shouldQuip } = quipsModule;
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const LIST = Array.from({ length: 12 }, (_, n) => ({ text: `Quip ${n}.`, audioUrl: `/api/voice/quips/sylvi/${n}` }));

function setup({ ok = true } = {}) {
  const requests = [];
  const audios = [];
  const fetchImpl = vi.fn(async (url) => {
    requests.push(url);
    return { ok, json: async () => ({ guideName: 'Sylvi', quips: LIST }) };
  });
  const makeAudio = (url) => {
    const element = { url, preload: '', play: vi.fn(() => Promise.resolve()), onended: null };
    audios.push(element);
    return element;
  };
  let seed = 0.37;
  const random = () => {
    seed = (seed * 9301 + 0.49297) % 1;
    return seed;
  };
  const player = createQuipPlayer({ fetchImpl, makeAudio, random });
  return { player, requests, audios };
}

describe('When a catch gets a quip', () => {
  it('only while nothing else is speaking', () => {
    expect(shouldQuip({ guideSpeaking: false, welcomePlaying: false, quipPlaying: false })).toBe(true);
    expect(shouldQuip({ guideSpeaking: true, welcomePlaying: false, quipPlaying: false })).toBe(false);
    expect(shouldQuip({ guideSpeaking: false, welcomePlaying: true, quipPlaying: false })).toBe(false);
    expect(shouldQuip({ guideSpeaking: false, welcomePlaying: false, quipPlaying: true })).toBe(false);
  });
});

describe('The quip player', () => {
  it("loads the guide's lines once and readies their audio", async () => {
    const { player, requests, audios } = setup();
    await player.load('sylvi');
    await player.load('sylvi');
    expect(requests).toEqual(['/api/voice/quips/sylvi']);
    expect(audios.map(({ url }) => url)).toEqual(LIST.map(({ audioUrl }) => audioUrl));
    expect(audios.every(({ preload }) => preload === 'auto')).toBe(true);
  });

  it('goes through every line before repeating, never the same twice running', async () => {
    const { player } = setup();
    await player.load('sylvi');
    const said = Array.from({ length: 36 }, () => player.say({ voice: false }).text);
    for (let start = 0; start < 36; start += 12) {
      expect(new Set(said.slice(start, start + 12)).size).toBe(12);
    }
    for (let i = 1; i < said.length; i += 1) expect(said[i], `line ${i}`).not.toBe(said[i - 1]);
  });

  it('plays the line when the voice is on, and only writes it when it is off', async () => {
    const { player, audios } = setup();
    await player.load('sylvi');
    const spoken = player.say({ voice: true });
    const played = audios.find(({ play }) => play.mock.calls.length === 1);
    expect(played.url).toBe(LIST.find(({ text }) => text === spoken.text).audioUrl);
    expect(player.playing()).toBe(true);
    played.onended();
    expect(player.playing()).toBe(false);
    player.say({ voice: false });
    expect(audios.filter(({ play }) => play.mock.calls.length > 0)).toHaveLength(1);
  });

  it('loads afresh for the other guide', async () => {
    const { player, requests } = setup();
    await player.load('sylvi');
    await player.load('rollo');
    expect(requests).toEqual(['/api/voice/quips/sylvi', '/api/voice/quips/rollo']);
  });

  it('says nothing until its lines have loaded, or if they cannot', async () => {
    const { player } = setup({ ok: false });
    expect(player.say({ voice: true })).toBeNull();
    await player.load('sylvi');
    expect(player.say({ voice: true })).toBeNull();
  });
});

describe('Wiring', () => {
  it('a catch earns a quip, unless a streak offer goes to the guide instead', () => {
    const app = read('../App.jsx');
    expect(app).toMatch(/if \(!demo\) \{\s*const signal = coachRef\.current\.result\('correct', gameSettings\(\)\);\s*if \(signal\) voiceEventsRef\.current\?\.gameSignal\?\.\(signal\);\s*else voiceEventsRef\.current\?\.caught\?\.\(\);\s*\}/);
  });

  it('the panel plays it, writes it in the conversation, and readies the lines for a game', () => {
    const panel = read('./VoicePanel.jsx');
    expect(panel).toMatch(/caught: \(\) => \{/);
    expect(panel).toMatch(/shouldQuip\(\{/);
    expect(panel).toMatch(/stream\.addGuide\(\{ id: nextLineId\('q'\), text: quip\.text \}, \{ audible: false \}\);/);
    expect(panel).toMatch(/if \(mode === 'game'\) quips\.load\(guide\)/);
  });
});
