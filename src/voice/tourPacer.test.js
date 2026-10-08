import { describe, expect, it } from 'vitest';

const pacerModule = await import('./tourPacer.js').catch(() => ({}));
const { createTourPacer, TOUR_STOP_MIN_SPEECH_MS, TOUR_STOP_PASS_AFTER_MS } = pacerModule;

function setup() {
  const clock = { now: 0 };
  const pacer = createTourPacer({ now: () => clock.now });
  const wait = (ms) => {
    clock.now += ms;
  };
  const speak = (ms) => {
    pacer.guideSpeaking(true);
    wait(ms);
    pacer.guideSpeaking(false);
  };
  // What the tour commands answer when a stop has been shown.
  const arrive = (stop, lobe) => pacer.arrived({ ok: true, stop, of: 7, lobe });
  return { pacer, wait, speak, arrive };
}

// Live run: the brain ran one tour while the voice narrated another. Each
// next_tour_stop answers on arrival, so nothing stopped the model calling it
// again before it had said a word. The lockstep gate holds the tour until the
// guide has spoken about the stop it is at.
describe('Tour lockstep gate', () => {
  it('needs about 8 s of speech per stop, and passes after 20 s regardless', () => {
    expect(TOUR_STOP_MIN_SPEECH_MS).toBe(8000);
    expect(TOUR_STOP_PASS_AFTER_MS).toBe(20000);
  });

  it('lets the first call after start_tour through without speech (the welcome sentence)', () => {
    const { pacer } = setup();
    pacer.tourStarted();
    expect(pacer.request()).toBeNull();
  });

  it('refuses a call right after a stop arrives, naming the lobe to describe', () => {
    const { pacer, arrive } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    const refusal = pacer.request();
    expect(refusal).toMatchObject({ ok: false, did: '' });
    expect(refusal.reason).toMatch(/Frontal Lobe/);
    expect(refusal.instruction).toBe('Describe the Frontal Lobe first (two or three sentences), then call next_tour_stop.');
  });

  it('lets the tour move on once the guide has spoken 8 s about the stop, across several turns', () => {
    const { pacer, arrive, speak, wait } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    speak(5000);
    wait(500);
    expect(pacer.request()).not.toBeNull();
    speak(2900);
    expect(pacer.request()).not.toBeNull();
    speak(100);
    expect(pacer.request()).toBeNull();
  });

  it('counts speech still in progress', () => {
    const { pacer, arrive, wait } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    pacer.guideSpeaking(true);
    wait(8000);
    expect(pacer.request()).toBeNull();
  });

  it('counts only speech after the stop arrived', () => {
    const { pacer, arrive, speak, wait } = setup();
    pacer.tourStarted();
    speak(10_000);
    pacer.request();
    pacer.guideSpeaking(true);
    wait(6000);
    arrive(1, 'Frontal Lobe');
    wait(3000);
    expect(pacer.request()).not.toBeNull();
    wait(5000);
    expect(pacer.request()).toBeNull();
  });

  it('starts counting afresh at every stop', () => {
    const { pacer, arrive, speak } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    speak(9000);
    expect(pacer.request()).toBeNull();
    arrive(2, 'Parietal Lobe');
    expect(pacer.request().instruction).toBe('Describe the Parietal Lobe first (two or three sentences), then call next_tour_stop.');
  });

  it('a refusal does not reset what the guide has already said', () => {
    const { pacer, arrive, speak } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    speak(4000);
    expect(pacer.request()).not.toBeNull();
    speak(4000);
    expect(pacer.request()).toBeNull();
  });

  it('passes after 20 s at a stop even if no speech was measured, so a tour never stalls forever', () => {
    const { pacer, arrive, wait } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    wait(19_999);
    expect(pacer.request()).not.toBeNull();
    wait(1);
    expect(pacer.request()).toBeNull();
  });

  it('refuses a second call while a stop is still on its way', () => {
    const { pacer, arrive, speak } = setup();
    pacer.tourStarted();
    expect(pacer.request()).toBeNull();
    const second = pacer.request();
    expect(second).toMatchObject({ ok: false, did: '' });
    expect(second.reason).toMatch(/Frontal Lobe/);
    arrive(1, 'Frontal Lobe');
    speak(8000);
    expect(pacer.request()).toBeNull();
    expect(pacer.request().reason).toMatch(/Parietal Lobe/);
  });

  it('gates the call that finishes the tour after the last stop', () => {
    const { pacer, arrive } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(7, 'Limbic Lobe');
    expect(pacer.request().instruction).toBe('Describe the Limbic Lobe first (two or three sentences), then call next_tour_stop.');
  });

  it('a stop that answers without arriving (a failure) frees the gate at the stop it was at', () => {
    const { pacer, arrive, speak } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    speak(8000);
    pacer.request();
    pacer.arrived({ ok: false, did: '', reason: 'The turn took too long, so I stopped it.' });
    expect(pacer.request()).toBeNull();
  });

  it('stays out of the way outside a tour, and after it ends', () => {
    const { pacer, arrive } = setup();
    expect(pacer.request()).toBeNull();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    pacer.tourEnded();
    expect(pacer.request()).toBeNull();
  });

  it('the tour ending itself (done) clears the gate', () => {
    const { pacer, arrive } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(7, 'Limbic Lobe');
    pacer.arrived({ ok: true, done: true });
    expect(pacer.request()).toBeNull();
  });

  it('a restarted tour exempts its first call again', () => {
    const { pacer, arrive } = setup();
    pacer.tourStarted();
    pacer.request();
    arrive(1, 'Frontal Lobe');
    pacer.tourStarted();
    expect(pacer.request()).toBeNull();
  });
});
