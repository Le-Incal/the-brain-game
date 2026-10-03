// Steward review: export proposed records to a CSV sheet, import decisions back.
import { isPositive } from './model.js';

export function toCsv(rows) {
  if (!rows.length) return '';
  const header = Object.keys(rows[0]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return `${[header.map(cell).join(','), ...rows.map((r) => header.map((h) => cell(r[h])).join(','))].join('\r\n')}\r\n`;
}

export function parseCsv(text) {
  const records = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') records.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const [header, ...body] = records;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const summarize = (r, labelOf) => {
  if (r.predicate) {
    const props = r.props && Object.keys(r.props).length ? ` (${Object.entries(r.props).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('+') : v}`).join(', ')})` : '';
    return `${labelOf(r.subject)} ${r.predicate} ${labelOf(r.object)}${props}`;
  }
  return `${r.class}: ${r.label ?? r.text ?? r.id}`;
};

export function exportReview(ds) {
  const labels = new Map(ds.nodes.filter((n) => n?.id).map((n) => [n.id, n.label ?? n.text ?? n.id]));
  const labelOf = (id) => labels.get(id) ?? id;
  const groups = new Map();
  for (const a of ds.assertions) {
    if (a?.provenance?.status !== 'proposed') continue;
    const k = `${a.predicate}|${a.subject}|${a.object}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const conflictOf = new Map();
  for (const [k, list] of groups) {
    const variants = new Set(list.map((a) => JSON.stringify({ ...a.props, stance: undefined }) + String(isPositive(a))));
    if (list.length > 1 && variants.size > 1) for (const a of list) conflictOf.set(a.id, k);
  }
  const rows = [];
  for (const r of [...ds.nodes, ...ds.assertions]) {
    if (r?.provenance?.status !== 'proposed') continue;
    rows.push({
      id: r.id,
      record: r.predicate ? 'assertion' : 'node',
      type: r.predicate ?? r.class,
      summary: summarize(r, labelOf),
      sources: (r.provenance.sources ?? []).join('; '),
      locator: r.provenance.locator ?? '',
      file: ds.fileOf?.[r.id] ?? '',
      conflict: conflictOf.get(r.id) ?? '',
      reviewNote: r.provenance.reviewNote ?? '',
      decision: '',
      note: '',
    });
  }
  return toCsv(rows);
}

const DECISIONS = ['', 'approve', 'reject'];

export function importReview(ds, csv, { steward, on }) {
  const next = structuredClone(ds);
  const byId = new Map([...next.nodes, ...next.assertions].filter((r) => r?.id).map((r) => [r.id, r]));
  for (const row of parseCsv(csv)) {
    const decision = String(row.decision ?? '').trim().toLowerCase();
    if (!DECISIONS.includes(decision)) throw new Error(`Unknown decision "${row.decision}" for ${row.id}; use approve, reject or leave blank`);
    if (!decision) continue;
    const rec = byId.get(row.id);
    if (!rec) throw new Error(`Review row ${row.id} matches no record`);
    if (decision === 'approve') Object.assign(rec.provenance, { status: 'approved', approvedBy: steward, approvedOn: on });
    if (decision === 'reject') Object.assign(rec.provenance, { status: 'rejected' });
    if (row.note) rec.provenance.reviewNote = row.note;
  }
  return next;
}
