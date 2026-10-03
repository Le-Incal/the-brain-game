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
