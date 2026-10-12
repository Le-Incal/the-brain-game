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

  it('never gives away an answer during a game, and teaches a miss in one sentence', () => {
    expect(prompt).toMatch(/^- Game: .*Never turn me, light a region, or say where a falling word belongs/m);
    expect(prompt).toContain('[app] missed: "SPEECH" belongs to Broca\'s Area');
    expect(prompt).toMatch(/one short sentence about why the word belongs there/);
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
      '"Welcome. I am {{guide_name}}, a human brain. You can study with me to learn how I work, test your knowledge in the Brain Game, or explore on your own: turn me around and select any of my regions."'
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
