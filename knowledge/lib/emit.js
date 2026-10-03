// Generated outputs: ElevenLabs pronunciation lexicon, credits, coverage report.
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function emitPls(graph) {
  const lexemes = Object.values(graph.nodes)
    .filter((n) => n.pronunciation?.respelling && n.label)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((n) => {
      const alias = n.pronunciation.respelling.toLowerCase();
      const ipa = n.pronunciation.ipa ? `\n    <phoneme>${xml(n.pronunciation.ipa)}</phoneme>` : '';
      return `  <lexeme>\n    <grapheme>${xml(n.label)}</grapheme>\n    <alias>${xml(alias)}</alias>${ipa}\n  </lexeme>`;
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<lexicon version="1.0" xmlns="http://www.w3.org/2005/01/pronunciation-lexicon" alphabet="ipa" xml:lang="en-GB">',
    ...lexemes,
    '</lexicon>',
    '',
  ].join('\n');
}

export function emitCredits(graph) {
  const cited = new Set();
  for (const e of graph.edges) for (const s of e.sources ?? []) cited.add(s);
  for (const n of Object.values(graph.nodes)) for (const s of n.sources ?? []) cited.add(s);
  const rows = [...cited].map((id) => graph.nodes[id]).filter((n) => n?.class === 'Source').sort((a, b) => a.citation.localeCompare(b.citation));
  const lines = ['# Credits', '', `Generated from the Brain Game knowledge graph (schema ${graph.schemaVersion}, data ${graph.dataVersion}).`, '', 'Facts are paraphrased in our own words and cited to these works.', ''];
  for (const s of rows) lines.push(`- ${s.citation} (${s.license})${s.url ? ` ${s.url}` : ''}`);
  return `${lines.join('\n')}\n`;
}

export const GATES = { functions: 2, primary: 1, networks: 1, structures: 1 };

export function emitCoverage(graph) {
  const gaps = [];
  const lines = ['# Coverage', '', `Schema ${graph.schemaVersion}, data ${graph.dataVersion}, built ${graph.builtAt}.`, '', '| Region | Functions | Primary | Networks | Structures | Myths | Status |', '|---|---|---|---|---|---|---|'];
  for (const [num, r] of Object.entries(graph.byRegion)) {
    const counts = {
      functions: new Set(r.functions.map((f) => f.id)).size,
      primary: r.functions.filter((f) => f.role === 'primary').length,
      networks: r.networks.length,
      structures: r.structures.length,
    };
    const failing = Object.entries(GATES).filter(([gate, min]) => counts[gate] < min && !r.coverageExemptions.includes(gate)).map(([g]) => g);
    if (failing.length) gaps.push({ region: `region:${num}`, failing });
    lines.push(`| ${num} ${r.name} | ${counts.functions} | ${counts.primary} | ${counts.networks} | ${counts.structures} | ${r.myths.length} | ${failing.length ? `below gate: ${failing.join(', ')}` : 'ok'} |`);
  }
  const byClass = {};
  for (const n of Object.values(graph.nodes)) byClass[n.class] = (byClass[n.class] ?? 0) + 1;
  lines.push('', '## Nodes by class', '', ...Object.entries(byClass).sort().map(([c, k]) => `- ${c}: ${k}`));
  const words = Object.values(graph.words);
  const recon = {};
  for (const w of words) recon[w.reconciliation] = (recon[w.reconciliation] ?? 0) + 1;
  lines.push('', '## Word bank reconciliation (R7)', '', ...Object.entries(recon).map(([k, v]) => `- ${k}: ${v}`));
  return { markdown: `${lines.join('\n')}\n`, gaps };
}
