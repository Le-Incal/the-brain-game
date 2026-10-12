import { describe, expect, it } from 'vitest';

const prompterModule = await import('./guidePrompter.js').catch(() => ({}));
const { createGuidePrompter, PROMPT_STALE_MS } = prompterModule;

// A contextual update is background the guide reads at its next turn; a user
// message makes it answer now (ElevenLabs client-to-server events). The game
// coach needs an answer now, so it prompts. It never talks over the guide, and
// a prompt the moment has passed is dropped.

function setup() {
  let t = 0;
  const sent = [];
  const prompter = createGuidePrompter({ send: (text) => sent.push(text), now: () => t });
  return { sent, prompter, advance: (ms) => (t += ms) };
}

describe('Prompting the guide', () => {
  it('goes at once while the guide is quiet', () => {
    const { sent, prompter } = setup();
    prompter.prompt('[app] streak: 5 caught in a row');
    expect(sent).toEqual(['[app] streak: 5 caught in a row']);
  });

  it('waits for the guide to finish its sentence', () => {
    const { sent, prompter, advance } = setup();
    prompter.guideSpeaking(true);
    prompter.prompt('[app] struggling');
    expect(sent).toEqual([]);
    advance(2000);
    prompter.guideSpeaking(false);
    expect(sent).toEqual(['[app] struggling']);
  });

  it('keeps only the latest prompt while it waits', () => {
    const { sent, prompter } = setup();
    prompter.guideSpeaking(true);
    prompter.prompt('first');
    prompter.prompt('second');
    prompter.guideSpeaking(false);
    expect(sent).toEqual(['second']);
  });

  it('drops a prompt the moment has passed', () => {
    const { sent, prompter, advance } = setup();
    expect(PROMPT_STALE_MS).toBe(8000);
    prompter.guideSpeaking(true);
    prompter.prompt('[app] streak');
    advance(8001);
    prompter.guideSpeaking(false);
    expect(sent).toEqual([]);
  });

  it('sends nothing after it is disposed', () => {
    const { sent, prompter } = setup();
    prompter.guideSpeaking(true);
    prompter.prompt('[app] streak');
    prompter.dispose();
    prompter.guideSpeaking(false);
    expect(sent).toEqual([]);
  });
});
