import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import brainRegions from '../data/brainRegions.json';

const briefPath = fileURLToPath(new URL('../../agent/architect-brief.md', import.meta.url));

// Parses lines like "Frontal Lobe: 1 Prefrontal Cortex, ..., 6 Broca's Area (left only)".
function parseMyRegionsBlock(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith('# My regions'));
  if (start < 0) throw new Error('No "# My regions" block in agent/architect-brief.md');
  const divisions = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^([A-Z][A-Za-z ]+):\s+(.+)$/);
    if (!match) break;
    divisions.push({
      name: match[1],
      regions: match[2].split(/,\s*/).map((entry) => {
        const region = entry.match(/^(\d+)\s+(.+?)(\s+\(left only\))?$/);
        return { id: Number(region[1]), name: region[2], leftOnly: Boolean(region[3]) };
      }),
    });
  }
  return divisions;
}

describe('C16: the agent brief matches the atlas', () => {
  const block = parseMyRegionsBlock(readFileSync(briefPath, 'utf8'));
  const regionById = new Map(brainRegions.regions.map((region) => [region.id, region]));

  it('lists the same divisions, ids and names as brainRegions.json', () => {
    expect(block.map(({ name, regions }) => ({ name, regions: regions.map(({ id, name: n }) => [id, n]) }))).toEqual(
      brainRegions.divisions.map((division) => ({
        name: division.name,
        regions: division.regions.map((id) => [id, regionById.get(id).name]),
      }))
    );
  });

  it('marks exactly the lateralised regions as left only', () => {
    const leftOnly = block.flatMap(({ regions }) => regions.filter((r) => r.leftOnly).map((r) => r.id));
    expect(leftOnly.sort((a, b) => a - b)).toEqual([...brainRegions.gameplayNotes.lateralized].sort((a, b) => a - b));
  });
});

// Live run: "Where do headaches happen?" got a long medical disclaimer before
// the answer. How the body works is anatomy; only the player's own or
// someone's symptoms, diagnoses, scans, medications or treatments get the
// one-line decline (Kyle, 2026-10-11).
describe('The medical rule answers anatomy and declines advice in one line', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
  const examples = brief.slice(brief.indexOf('## 6.'));

  it('carries the three new lines in the system prompt, word for word', () => {
    expect(prompt).toContain(
      '- Questions about how the body works are anatomy, not medical advice: where pain or headaches come from, what happens in a stroke, why we feel dizzy. Answer them directly.'
    );
    expect(prompt).toContain(
      `- Only when the player asks about their own or someone's symptoms, a diagnosis, a scan, a medication or a treatment, say once, in one short sentence: "I can't give medical advice; a doctor is the right person to ask." Then teach the related anatomy.`
    );
    expect(prompt).toContain('- Never open with a disclaimer the question did not call for.');
  });

  it('drops the old apology-first line', () => {
    expect(brief).not.toContain("I'm sorry, but I can't give medical advice.");
    expect(prompt).not.toMatch(/Never give medical advice, diagnose, or interpret/);
  });

  it('shows both cases in the acceptance conversations', () => {
    expect(examples).toContain('"Where do headaches happen?"');
    expect(examples).toMatch(/no pain receptors/);
    expect(examples).toMatch(/meninges/);
    expect(examples).toMatch(/trigeminal nerve/);
    expect(examples).toContain('"I have a headache, what should I take?"');
    expect(examples).toContain(`"I can't give medical advice; a doctor is the right person to ask."`);
  });
});

// Kyle, 2026-10-11: the guide is present from arrival, in every mode.
describe('The brief tells the guide about the three modes', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));

  it('has a Modes section naming explore, study and game', () => {
    expect(prompt).toContain('# Modes');
    for (const line of ['  [app] mode: explore', '  [app] mode: study', '  [app] mode: game']) {
      expect(prompt, line).toContain(line);
    }
  });

  it('lets the player lead in explore and the guide lead in study', () => {
    expect(prompt).toMatch(/^- Explore: the player leads\./m);
    expect(prompt).toMatch(/^- Study: you lead\./m);
  });

  // Kyle, 2026-10-11: a miss stays quiet; it is taught in one sentence when the player asks.
  it('never gives away an answer during a game', () => {
    expect(prompt).toMatch(/^- Game: .*Never turn me, light a region, or say where a falling word belongs/m);
    expect(prompt).toContain('[app] missed: "SPEECH" belongs to Broca\'s Area');
  });

  it('says what to do when the player switches motion off', () => {
    expect(prompt).toMatch(/motion is off/i);
  });

  it('points to Settings for the other guide, and no longer to a voice panel', () => {
    expect(prompt).toMatch(/open Settings, under me, and choose the other name/);
    expect(prompt).not.toMatch(/voice panel/);
    expect(prompt).not.toContain('[player] entered Study mode');
  });
});

// Kyle, 2026-10-11: the app plays a recorded welcome before any conversation.
describe('The brief tells the guide the welcome has already played', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));

  it('quotes the welcome and the line that says it played', () => {
    expect(prompt).toContain('# Arrival');
    expect(prompt).toContain(
      '"Hello! I am {{guide_name}}, a human brain. You can study with me to learn how I work, test your knowledge in the Brain Game, or explore on your own: turn me around and select any of my regions."'
    );
    expect(prompt).toContain('  [app] the welcome has played');
  });

  it('never repeats it', () => {
    expect(prompt).toMatch(/^- Never repeat the welcome or introduce yourself again\./m);
  });

  it('says the first message in ElevenLabs is empty', () => {
    expect(brief).toMatch(/\*\*First message:\*\* \(empty\)/);
  });
});

// Kyle, 2026-10-11: one conversation on screen, many sessions underneath.
describe('The brief tells the guide how it rests and wakes', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));

  it('explains the resting, and how a woken conversation carries on', () => {
    expect(prompt).toContain('# Resting');
    expect(prompt).toMatch(/\[app\] conversation so far: /);
    expect(prompt).toMatch(/^- Carry on from there: no greeting, no recap\./m);
  });

  it('no longer says goodbye when time runs short', () => {
    expect(prompt).not.toMatch(/warm goodbye/);
  });

  it('allows text-only conversations in the agent settings', () => {
    expect(brief).toMatch(/\*\*Security overrides:\*\* Voice ID and text only\./);
  });
});

// Kyle, 2026-10-11: the guide decides when to show the section, in descriptions and tours.
describe('The brief teaches the section', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
  const tools = brief.slice(brief.indexOf('## 4.'), brief.indexOf('## 5.'));

  it('defines show_section with its open parameter', () => {
    expect(tools).toMatch(/^### show_section$/m);
    expect(tools).toMatch(/- `open` \(boolean, required\)/);
  });

  it('tells the guide when to open it and what happens while it is open', () => {
    expect(prompt).toContain('# The section');
    expect(prompt).toMatch(/call show_section with open true/);
    expect(prompt).toMatch(/only in Study/);
    expect(prompt).toContain('  [app] the section is open');
  });
});

describe('A miss is taught at once', () => {
  // Kyle, 2026-10-11 (later): the guide names the region the word belonged to,
  // where it is and why it matters, while the region glows.
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));

  it('no longer tells the guide to stay quiet after a miss', () => {
    expect(prompt).not.toContain('Do not answer it.');
  });

  it('asks for two short sentences from the facts the app gives: where, then why', () => {
    expect(prompt).toContain(
      '  [app] missed: "SPEECH" belongs to Broca\'s Area, in my Frontal Lobe, on my left side, toward the front. Why: Broca\'s area participates in articulatory planning within a distributed language network.'
    );
    expect(prompt).toContain(
      '  Answer at once, in two short sentences and about five seconds: name the region and where it lies on you, then why the word belongs there, from the Why. Add nothing else; the next word is already falling.'
    );
  });
});

// Kyle, 2026-10-11: mid-game the guide kept saying "the game is waiting for
// you". The agent was set to take a turn after 7 s of silence, and the open
// microphone was transcribing a television. The agent now never fills a
// silence, and skips its turn when what it hears is not said to it.
describe('The guide speaks only when spoken to or prompted', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const config = brief.slice(brief.indexOf('## 2.'), brief.indexOf('## 3.'));
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));

  it('records that the agent never takes a turn after silence', () => {
    expect(config).toMatch(/\*\*Take turn after silence:\*\* -1\./);
  });

  it('records the Skip turn system tool', () => {
    expect(config).toMatch(/\*\*System tools:\*\* End conversation, Detect language and Skip turn\./);
  });

  it('tells the guide to skip its turn when speech is not addressed to it', () => {
    expect(prompt).toContain(
      '- Not everything you hear is said to you. When speech is plainly not addressed to you, such as a television or other people talking about something unrelated to the brain, the game or you, call skip_turn and say nothing.'
    );
  });
});

// Kyle, 2026-10-13, from tonight's conversations on staging.
describe('Tonight\'s three prompt changes', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
  const tools = brief.slice(brief.indexOf('## 4.'), brief.indexOf('## 5.'));
  const examples = brief.slice(brief.indexOf('## 6.'));

  // Audrey asked "About the moon" and heard "My expertise extends only as far as my own folds."
  it('answers a question beyond the brain through the brain, instead of turning it away', () => {
    expect(prompt).toContain(
      '- Never turn a curious question away flatly. When someone asks about something beyond the brain (the moon, music, dinosaurs), answer through the brain: how you see it, remember it, feel about it or learn it, in a sentence or two, then offer to show the region involved. If the subject is unclear (is Atlas a map or a person?), ask what they mean.'
    );
    expect(brief).not.toContain('My expertise extends only as far as my own folds.');
    expect(examples).toContain('User: "About the moon."');
  });

  // "That bright yellow is my Primary Motor Cortex": a guess, and wrong (it is region 4).
  it('looks a region up by its colour or place, never guesses', () => {
    expect(prompt).toContain(
      '- When the player describes a region by its colour or place ("the yellow spot on top"), never guess: call lookup_region with their words as the name, and name only the region it returns. If it says the words could mean several, ask which.'
    );
    expect(tools).toMatch(/### lookup_region[\s\S]*colour[\s\S]*place/);
    expect(tools).toMatch(/visibleRegions[^\n]*colour/);
    expect(examples).toContain('User: "What is the bright yellow spot on the top of the brain?"');
    expect(examples).toMatch(/lookup_region \{name: "the bright yellow spot on the top of the brain"\}[^\n]*region 4/);
  });

  // The tour stopped at the 8-minute cap; the conversation now carries on in a fresh session.
  it('explains carrying on in a fresh session, and how to pick up', () => {
    expect(prompt).toContain('  [app] the conversation carried on mid-tour, at stop 3 of 7: pick up where you left off, with no greeting');
    expect(prompt).toContain('  [app] the conversation carried on mid-sentence: finish your thought briefly, with no greeting');
    // Kyle, 2026-10-23: Study keeps the running conversation; only the cap carries it on.
    expect(prompt).toMatch(/^- The app also carries a long conversation on in a fresh session before its time runs out\. If it cut you off mid-tour or mid-sentence, it asks you to pick up:$/m);
    expect(brief).not.toContain('starts a fresh one when the player enters Study');
    expect(prompt).toMatch(/^- On a tour, finish the stop you were on \(get_scene_state gives it as tour\), then call next_tour_stop\./m);
  });
});

// Kyle, 2026-10-23: "When I said hello to Sylvi, she corrected me and said my
// name is Sylvi." The agent reads a transcript, never the voice: the speech
// recogniser spelled the name, and she corrected the spelling.
describe('The guide never corrects how the player says a word', () => {
  const brief = readFileSync(briefPath, 'utf8');
  const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
  const whoYouAre = prompt.slice(prompt.indexOf('# Who you are'), prompt.indexOf('# Arrival'));

  it('answers to any spelling of its name, and corrects no one', () => {
    expect(whoYouAre).toContain(
      "- The player's words reach you as a transcript, so your name may arrive as Silvy, Sylvie, Silvia, Rolo or another spelling. Answer to any of them. Never correct how the player says or spells your name or any other word; you cannot hear how they said it. If a word is unclear, use the right term in your reply, or ask what they meant."
    );
  });
});

// The app hands over before the agent's own cap, so the two must agree.
describe('The session cap the app counts from is the agent\'s', () => {
  it('matches the brief, which says the app carries on before it', async () => {
    const { AGENT_MAX_SECONDS } = await import('./voiceSession.js');
    const brief = readFileSync(briefPath, 'utf8');
    expect(brief).toContain(`- **Max conversation duration:** ${AGENT_MAX_SECONDS} seconds (8 minutes).`);
    expect(brief).toMatch(/Max conversation duration:\*\*[^\n]*carries the conversation on in a fresh session/);
  });
});

// Kyle, 2026-10-23, after Railway was breached: the agent id was among its
// variables, and the agent let anyone connect with it. Settings compared with
// Atlas the same evening.
describe("The agent's settings as of 23 October", () => {
  const brief = readFileSync(briefPath, 'utf8');
  const config = brief.slice(brief.indexOf('## 2.'), brief.indexOf('## 3.'));

  it('requires authentication: our server connects with a signed token or URL', () => {
    expect(config).toContain('- **Authentication:** on. Our server connects with a signed conversation token or signed URL, so the agent id alone opens nothing.');
  });

  it('sends its post-call reports to production from the agent itself', () => {
    expect(config).toContain("- **Post-call webhook:** set on the agent's Security tab, which overrides the workspace default: Transcript only, to `https://www.brain-game.io/api/voice/webhook/elevenlabs`. Staging receives none.");
  });

  it('tells the guide the conversation rests after 3 minutes of quiet, not 30 seconds', () => {
    const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
    expect(prompt).toContain('The app rests the conversation after about 3 minutes of quiet and opens a new one when the player speaks or writes again.');
    expect(brief).not.toContain('after about 30 seconds of quiet');
  });

  // Kyle, 2026-10-23: no welcome to a tour; a short tour stays at lobe level
  // for a six-year-old; a full tour says what the lobe does, then each region.
  it('tours with no welcome, lobe first, then each region by name', () => {
    const prompt = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
    const tools = brief.slice(brief.indexOf('## 4.'), brief.indexOf('## 5.'));
    expect(prompt).toContain('- When the player asks for a tour or an overview of you, call start_tour, then next_tour_stop at once. Do not welcome them to the tour; if they chose a short or a full tour, acknowledge it in a few words.');
    expect(prompt).toContain('- If the player asks for a quick or short tour, call start_tour with length short. A short tour is for the youngest players: at each stop say what the lobe does in one or two simple sentences a six-year-old would follow, and name none of its regions.');
    expect(prompt).toContain('- On a full tour each stop lights the whole lobe. First say in one sentence what the lobe does as a whole. Then describe each region the tool returns, in its order, saying its name as you begin: each one lights as you name it. Then call next_tour_stop. Do not describe the next stop before you have called it.');
    expect(brief).not.toContain('one-sentence welcome');
    expect(tools).toContain('Follow `instruction`: no welcome; call next_tour_stop at once, acknowledging a chosen length in a few words.');
    expect(tools).toContain('`summary` is the lobe\'s own description; on a full tour `regions` gives each region\'s `id`, `name` and `clickDescription`: speak from these, in order, naming each.');
  });

  it('answers as eagerly as Atlas, and hears both names', () => {
    expect(config).toContain('- **Turn-taking:** allow the user to interrupt the agent. Eagerness: Eager, as on Atlas.');
    expect(config).toContain('- **ASR keywords:** Sylvi, Rollo.');
  });
});
