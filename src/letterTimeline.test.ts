import { describe, expect, it } from "vitest";
import {
  LETTER_PHASES,
  letterShift,
  shouldCelebrate,
  unfoldAt,
  wordOpacity,
} from "./letterTimeline";

const COUNT = 150;
const AT_END = LETTER_PHASES.revealEnd;
const WINDOW = 1 / 200; // fine enough to see a single word move

describe("the letter's reading travel", () => {
  it("reaches the closing lines and reverses without losing travel after a resize", () => {
    for (const [content, view] of [[2600, 580], [4100, 360], [300, 580]]) {
      const overflow = Math.max(0, content - view);
      expect(letterShift(0, content, view)).toBeCloseTo(0);
      expect(letterShift(LETTER_PHASES.revealEnd, content, view)).toBeCloseTo(-overflow);
      expect(letterShift(1, content, view)).toBeCloseTo(-overflow);
      expect(letterShift(LETTER_PHASES.revealStart, content, view)).toBeCloseTo(0);
      expect(letterShift(1, content, view, true)).toBeCloseTo(-overflow);
      expect(letterShift(0.5, content, view, true)).toBeCloseTo(-overflow * 0.5);
      expect(letterShift(0, content, view, true)).toBeCloseTo(0);
    }
  });
});

describe("the trifold's unfold", () => {
  it("starts shut and is fully open by the end of its window", () => {
    expect(unfoldAt(0)).toBe(0);
    expect(unfoldAt(LETTER_PHASES.unfoldEnd)).toBeCloseTo(1, 10);
    // And it stays open for the rest of the section — the last word is still
    // being lit long after the last fold has settled.
    expect(unfoldAt(1)).toBe(1);
  });

  it("stays inside 0..1 and never runs backwards", () => {
    let previous = -1;
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const open = unfoldAt(p);
      expect(open).toBeGreaterThanOrEqual(0);
      expect(open).toBeLessThanOrEqual(1);
      expect(open).toBeGreaterThanOrEqual(previous);
      previous = open;
    }
  });

  it("does not move while the reader has not started", () => {
    expect(unfoldAt(-1)).toBe(0);
  });
});

describe("the word-by-word reveal", () => {
  it("leaves every word faint until the reveal window opens", () => {
    for (let i = 0; i < COUNT; i++) {
      expect(wordOpacity(0, i, COUNT)).toBe(LETTER_PHASES.dim);
      expect(wordOpacity(LETTER_PHASES.revealStart, i, COUNT)).toBe(LETTER_PHASES.dim);
    }
  });

  it("has the first word lit as soon as the window opens", () => {
    expect(wordOpacity(LETTER_PHASES.revealStart + WINDOW, 0, COUNT)).toBeGreaterThan(
      LETTER_PHASES.dim,
    );
  });

  it("brings the words up in order — the lit words always form a prefix", () => {
    // Half-way through the sweep, on every slide position across it.
    //
    // Pairwise `values[i] >= values[i-1]` is the wrong assertion here and fails
    // by about 0.85, not by a float epsilon: the windows do not overlap, so the
    // instant one word closes at 1 the next opens at `dim`, and at exactly that
    // instant the later word genuinely is dimmer. What "in order" has to mean is
    // that the sweep never reaches forward — a lit word may not appear after an
    // unlit one. Measured: zero violations over 2501 samples of the whole sweep.
    for (let slide = 0; slide <= 1.0001; slide += 0.0004) {
      const p =
        LETTER_PHASES.revealStart + (LETTER_PHASES.revealEnd - LETTER_PHASES.revealStart) * slide;
      const values = Array.from({ length: COUNT }, (_, i) => wordOpacity(p, i, COUNT));
      let goneDim = false;
      for (let i = 0; i < COUNT; i++) {
        if (values[i] <= LETTER_PHASES.dim + 1e-9) goneDim = true;
        else if (goneDim) {
          throw new Error(`word ${i} lit at ${values[i]} with an earlier word still at dim, p=${p}`);
        }
      }
    }

    // A prefix that is all-lit would also satisfy the loop above, so the middle
    // of the sweep has to actually be mid-sweep: some words up, some not.
    const p = LETTER_PHASES.revealStart + (LETTER_PHASES.revealEnd - LETTER_PHASES.revealStart) * 0.5;
    const values = Array.from({ length: COUNT }, (_, i) => wordOpacity(p, i, COUNT));
    expect(values[0]).toBe(1);
    expect(values[COUNT - 1]).toBe(LETTER_PHASES.dim);
  });

  it("never runs backwards as the reader scrolls", () => {
    const index = Math.floor(COUNT / 2);
    let previous = -1;
    for (let p = 0; p <= 1.0001; p += 0.002) {
      const value = wordOpacity(p, index, COUNT);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(LETTER_PHASES.dim);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  it("has the last word at full ink exactly where the reveal ends", () => {
    expect(wordOpacity(AT_END, COUNT - 1, COUNT)).toBe(1);
    expect(wordOpacity(AT_END - 0.001, COUNT - 1, COUNT)).toBeLessThan(1);
  });

  it("leaves every word at full ink for the rest of the section", () => {
    // The bottom of the page is past `revealEnd` but not at 1, so this is the
    // state the verify screenshot and the last-word assertion are taken in.
    for (let p = AT_END; p <= 1; p += 0.01) {
      for (let i = 0; i < COUNT; i++) expect(wordOpacity(p, i, COUNT)).toBe(1);
    }
  });

  it("does not divide by zero when there is nothing to reveal", () => {
    expect(wordOpacity(1, 0, 0)).toBe(1);
  });
});

describe("the celebration", () => {
  it("is not thrown early — the fold is still opening", () => {
    expect(shouldCelebrate(0)).toBe(false);
    expect(shouldCelebrate(LETTER_PHASES.revealEnd)).toBe(false);
    expect(shouldCelebrate(0.95)).toBe(false);
  });

  it("fires once the letter is fully written", () => {
    expect(shouldCelebrate(LETTER_PHASES.celebrateAt)).toBe(true);
    expect(shouldCelebrate(1)).toBe(true);
  });
});
