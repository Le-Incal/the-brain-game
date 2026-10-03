// Originality guard: player-facing and free-text fields must be in our own words.
// A field fails when it shares a run of `n` or more consecutive words with the
// source material (case and punctuation ignored).
const tokenize = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];

export function buildIndex(texts, n = 8) {
  const grams = new Set();
  for (const t of texts) {
    const w = tokenize(t);
    for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(' '));
  }
  return { grams, n };
}

export function longestSharedRun(text, { grams, n }) {
  const w = tokenize(text);
  let best = 0;
  let run = 0;
  for (let i = 0; i + n <= w.length; i++) {
    if (grams.has(w.slice(i, i + n).join(' '))) { run = run ? run + 1 : n; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/** Every free-text field of a record, as [path, text] pairs. */
export function textFields(r) {
  const out = [];
  for (const reg of ['child', 'curious', 'expert']) {
    if (r.text?.[reg]) out.push([`text.${reg}`, r.text[reg]]);
    if (r.correction?.[reg]) out.push([`correction.${reg}`, r.correction[reg]]);
  }
  for (const k of ['knownFor', 'notes', 'summary', 'plainDefinition', 'debateNote']) if (typeof r[k] === 'string') out.push([k, r[k]]);
  for (const k of ['sign', 'hint']) if (typeof r.props?.[k] === 'string') out.push([`props.${k}`, r.props[k]]);
  return out;
}
