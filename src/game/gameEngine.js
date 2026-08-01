/**
 * Game Engine
 *
 * Manages the word-catching game loop:
 * 1. Drops words from the top of the screen
 * 2. Detects collision with brain regions via raycasting
 * 3. Handles correct / wrong / miss feedback
 * 4. Scoring by difficulty tier (10 / 25 / 50 / 100)
 */

import { WORD_BANK, REGIONS } from '../data/regions';

export class GameEngine {
  constructor(brainScene, options = {}) {
    this.scene = brainScene;
    this.score = 0;
    this.currentWord = null;
    this.wordPosition = { x: 0, y: 0 }; // normalized 0–1 within stage (top-left origin)
    /** Viewport height fraction per second (e.g. 0.08 ≈ 12.5s top to bottom). */
    this.fallSpeed = options.fallSpeed ?? 0.08;
    /** Horizontal band where the word is “caught” (normalized Y from top). */
    this.catchLineY = options.catchLineY ?? 0.48;
    /** Continue falling after a miss until off-screen. */
    this._missFalling = false;
    /** Pause between words while shatter animation plays. */
    this._awaitingShatter = false;
    this.shatterDurationMs = options.shatterDurationMs ?? 1800;
    /** Y below which a word with no brain hit counts as a miss. */
    this.missLineY = options.missLineY ?? 0.9;
    this._resolved = false;
    /** Avoid raycasting the full anatomical mesh on every display frame. */
    this._collisionSampleElapsed = 0;
    this.collisionSampleInterval = options.collisionSampleInterval ?? 1 / 24;
    this.isPlaying = false;
    this._nextDropTimeout = null;
    this._nextDropAt = null;
    this._remainingDropDelay = null;
    this._scheduledDropCallback = null;
    /** Max difficulty tier included in the pool (1–4). Default: all tiers. */
    this.tier = options.tier ?? 4;
    this.usedWords = new Set();
    this.onScoreChange = options.onScoreChange ?? null;
    this.onWordDrop = options.onWordDrop ?? null;
    this.onCorrect = options.onCorrect ?? null;
    this.onIncorrect = options.onIncorrect ?? null;
    this.onMiss = options.onMiss ?? null;
  }

  setTier(tier) {
    this.tier = Math.max(1, Math.min(4, tier));
    this.usedWords.clear();
  }

  /**
   * Get the next word from the bank, filtered by max tier.
   */
  getNextWord() {
    const available = WORD_BANK.filter(
      (w) => w.tier <= this.tier && !this.usedWords.has(w.word)
    );
    if (available.length === 0) {
      this.usedWords.clear();
      return this.getNextWord();
    }
    const idx = Math.floor(Math.random() * available.length);
    return available[idx];
  }

  start() {
    this._clearScheduledDrop();
    this.isPlaying = true;
    this.score = 0;
    this.usedWords.clear();
    this._missFalling = false;
    this.dropNextWord();
  }

  dropNextWord() {
    this._missFalling = false;
    this._awaitingShatter = false;
    this._resolved = false;
    this._collisionSampleElapsed = 0;
    this.currentWord = this.getNextWord();
    if (!this.currentWord) return;

    this.wordPosition = {
      x: 0.5,
      y: 0,
    };

    if (this.onWordDrop) this.onWordDrop(this.currentWord, { ...this.wordPosition });
  }

  /**
   * Advance falling words; resolves at the catch line (or continues on miss).
   * @param {number} deltaSec seconds since last frame
   */
  update(deltaSec) {
    if (!this.isPlaying || !this.currentWord) return;

    if (this._awaitingShatter) return;

    const nextY = this.wordPosition.y + this.fallSpeed * deltaSec;

    if (this._missFalling) {
      this.wordPosition.y = nextY;
      if (this.wordPosition.y > 1.15) {
        this.dropNextWord();
      }
      return;
    }

    this.wordPosition.y = nextY;

    // Sample collisions at 24 Hz: visually continuous, dramatically cheaper
    // on the high-poly Meshy anatomical model than testing every display frame.
    this._collisionSampleElapsed += deltaSec;
    if (this._collisionSampleElapsed < this.collisionSampleInterval) {
      return;
    }
    this._collisionSampleElapsed = 0;

    // Resolve when the word raycasts onto the brain mesh at its current position.
    const regionId = this.scene.getRegionIdAtNormalized(this.wordPosition.x, this.wordPosition.y);

    if (regionId != null) {
      this._resolveAt(regionId);
      return;
    }

    // Miss: passed through the brain band without contacting mesh
    if (this.wordPosition.y >= this.missLineY) {
      this._resolveAt(null);
    }
  }

  _resolveAt(regionId) {
    if (this._resolved) return;
    this._resolved = true;

    const result = this.checkAnswer(regionId);

    if (result?.outcome === 'miss') {
      this._missFalling = true;
      return;
    }

    if (result?.outcome === 'wrong') {
      this._awaitingShatter = true;
      this._scheduleNextWord(this.shatterDurationMs, () => {
        this._awaitingShatter = false;
        this.dropNextWord();
      });
      return;
    }

    // Correct: brief absorb pause before next word
    this._scheduleNextWord(520, () => this.dropNextWord());
  }

  /**
   * @param {number|null} regionId - Region under the word, or null if miss
   * @returns {{ outcome: 'correct'|'wrong'|'miss', targetRegion: object, factoid: string }}
   */
  checkAnswer(regionId) {
    if (!this.currentWord) return null;

    const targetId = this.currentWord.targetRegion;
    const alternates = this.currentWord.acceptAlternates || [];
    const base = {
      targetRegion: REGIONS[targetId],
      factoid: this.currentWord.factoid,
    };

    // Miss: word did not hit any brain mesh
    if (regionId == null) {
      if (this.onMiss) {
        this.onMiss({
          word: this.currentWord,
          correctRegion: REGIONS[targetId],
        });
      }
      return { ...base, outcome: 'miss', correct: false };
    }

    const correct = regionId === targetId || alternates.includes(regionId);

    if (correct) {
      this.score += this.getPointValue();
      this.usedWords.add(this.currentWord.word);
      if (this.onScoreChange) this.onScoreChange(this.score);
      if (this.onCorrect) {
        this.onCorrect({
          word: this.currentWord,
          region: REGIONS[regionId],
          factoid: this.currentWord.factoid,
        });
      }
      return { ...base, outcome: 'correct', correct: true };
    }

    if (this.onIncorrect) {
      this.onIncorrect({
        word: this.currentWord,
        landedRegion: REGIONS[regionId],
        correctRegion: REGIONS[targetId],
      });
    }
    return { ...base, outcome: 'wrong', correct: false };
  }

  getPointValue() {
    const tierMultipliers = { 1: 10, 2: 25, 3: 50, 4: 100 };
    return tierMultipliers[this.currentWord?.tier] ?? 10;
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._nextDropTimeout != null) {
      this._remainingDropDelay = Math.max(0, this._nextDropAt - Date.now());
      clearTimeout(this._nextDropTimeout);
      this._nextDropTimeout = null;
      this._nextDropAt = null;
    }
  }

  resume() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    if (this._remainingDropDelay != null) {
      const delay = this._remainingDropDelay;
      const callback = this._scheduledDropCallback;
      this._remainingDropDelay = null;
      this._scheduleNextWord(delay, callback);
    }
  }

  dispose() {
    this.isPlaying = false;
    this._clearScheduledDrop();
  }

  _scheduleNextWord(delay, callback) {
    this._clearScheduledDrop();
    this._remainingDropDelay = null;
    this._scheduledDropCallback = callback;
    this._nextDropAt = Date.now() + delay;
    this._nextDropTimeout = setTimeout(() => {
      this._nextDropTimeout = null;
      this._nextDropAt = null;
      this._scheduledDropCallback = null;
      if (!this.isPlaying) {
        this._remainingDropDelay = 0;
        return;
      }
      callback();
    }, delay);
  }

  _clearScheduledDrop() {
    if (this._nextDropTimeout != null) {
      clearTimeout(this._nextDropTimeout);
    }
    this._nextDropTimeout = null;
    this._nextDropAt = null;
    this._remainingDropDelay = null;
    this._scheduledDropCallback = null;
  }
}
