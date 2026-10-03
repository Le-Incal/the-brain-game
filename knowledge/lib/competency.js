// Competency questions: each is a query with an expected result.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && b.every((x) => a.some((y) => canon(y) === canon(x)));

function matches(actual, expected) {
  if (Array.isArray(expected)) return sameSet(actual, expected);
  if (expected && typeof expected === 'object') return actual && typeof actual === 'object' && Object.entries(expected).every(([k, v]) => matches(actual[k], v));
  return actual === expected;
}

export function check(actual, expect) {
  if ('equals' in expect) return Array.isArray(expect.equals) ? sameSet(actual, expect.equals) : canon(actual) === canon(expect.equals);
  if ('includes' in expect) return Array.isArray(actual) && expect.includes.every((x) => actual.some((y) => canon(y) === canon(x)));
  if ('excludes' in expect) return Array.isArray(actual) && expect.excludes.every((x) => !actual.some((y) => canon(y) === canon(x)));
  if ('isNull' in expect) return actual === null;
  if ('notNull' in expect) return actual !== null && actual !== undefined;
  if ('matches' in expect) return matches(actual, expect.matches);
  throw new Error(`unknown expectation ${Object.keys(expect)}`);
}

export function runCompetency(query, questions) {
  return questions.map((q) => {
    try {
      const fn = query[q.call];
      if (typeof fn !== 'function') throw new Error(`unknown query ${q.call}`);
      const actual = fn(...(q.args ?? []));
      return { id: q.id, question: q.question, actual, pass: check(actual, q.expect) };
    } catch (error) {
      return { id: q.id, question: q.question, actual: null, pass: false, error: error.message };
    }
  });
}
