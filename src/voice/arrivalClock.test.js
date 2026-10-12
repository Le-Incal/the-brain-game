import { describe, expect, it } from 'vitest';

const clockModule = await import('./welcome.js').catch(() => ({}));
const { createArrivalClock } = clockModule;

// Kyle, 2026-10-11: the welcome waits 4 s after the brain appears, and only
// while the visitor can see the page. A tab opened in the background must not
// spend its welcome out of sight; its 4 s begin when the visitor looks.

function scheduler() {
  let t = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeoutImpl(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimeoutImpl(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        t = timer.at;
        timers.delete(id);
        timer.fn();
      }
      t = end;
    },
  };
}

function setup({ hidden = false, delayMs = 4000 } = {}) {
  const s = scheduler();
  const fired = [];
  const clock = createArrivalClock({
    delayMs,
    hidden,
    onDue: () => fired.push(s.now()),
    now: s.now,
    setTimeoutImpl: s.setTimeoutImpl,
    clearTimeoutImpl: s.clearTimeoutImpl,
  });
  return { s, fired, clock };
}

describe('The arrival clock', () => {
  it('is due after 4 s on a visible page', () => {
    const { s, fired } = setup();
    s.advance(3999);
    expect(fired).toEqual([]);
    s.advance(1);
    expect(fired).toEqual([4000]);
  });

  it('waits for a background tab to be seen, then gives the visitor the full 4 s', () => {
    const { s, fired, clock } = setup({ hidden: true });
    s.advance(60_000);
    expect(fired).toEqual([]);
    clock.visibility(false);
    s.advance(3999);
    expect(fired).toEqual([]);
    s.advance(1);
    expect(fired).toEqual([64_000]);
  });

  it('counts only the time the page is visible', () => {
    const { s, fired, clock } = setup();
    s.advance(3000);
    clock.visibility(true);
    s.advance(20_000);
    expect(fired).toEqual([]);
    clock.visibility(false);
    s.advance(999);
    expect(fired).toEqual([]);
    s.advance(1);
    expect(fired).toEqual([24_000]);
  });

  it('is due once only', () => {
    const { s, fired, clock } = setup();
    s.advance(4000);
    clock.visibility(true);
    clock.visibility(false);
    s.advance(10_000);
    expect(fired).toHaveLength(1);
  });

  it('never fires once disposed', () => {
    const { s, fired, clock } = setup();
    s.advance(2000);
    clock.dispose();
    clock.visibility(false);
    s.advance(10_000);
    expect(fired).toEqual([]);
  });
});
