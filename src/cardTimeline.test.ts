import { describe, expect, it } from "vitest";
import { CARD_TIMELINE, cardTimeline, CONFETTI_TICKS, ms } from "./cardTimeline";

// Scene two is the one scene with no reader input at all: it plays itself and
// hands over to the record. So its schedule is the entire contract, and two
// things outside the component read it -- `scripts/verify.mjs`, which waits 6s for
// the card and 15s for vinyl, and the reduced-motion path, which has to compress
// the scene without dropping any of it. If the order ever slips, the confetti
// fires before "Happy" has landed and nobody notices in a screenshot.
describe("the card's schedule", () => {
  it("lands the greeting, the sparkles and the handover in the brief's order", () => {
    const t = CARD_TIMELINE;
    // The card has to have finished rising before any text is on it, or the
    // greeting animates while it is still sliding out of the envelope.
    expect(t.riseDone).toBeLessThan(t.happyAt);
    expect(t.happyAt).toBeLessThan(t.birthdayAt);
    // And the hold has to be long enough to actually read three words and a name.
    expect(t.birthdayAt).toBeLessThan(t.liftAt);
    expect(t.liftAt).toBeLessThan(t.handoff);
  });

  it("holds the finished card for about three seconds before lifting it", () => {
    expect(CARD_TIMELINE.liftAt - CARD_TIMELINE.birthdayAt).toBeGreaterThanOrEqual(2.8);
  });

  it("hands over within the window verify.mjs waits for vinyl", () => {
    // verify.mjs gives the card 6s to reach full opacity and the vinyl scene 15s.
    // The card must be fully painted well inside the first, and the handoff must
    // land well inside the second, or the harness fails on a correct build.
    expect(CARD_TIMELINE.birthdayAt).toBeLessThan(6);
    expect(CARD_TIMELINE.handoff).toBeLessThan(15);
  });

  it("finishes the confetti burst before the card is handed over", () => {
    // `ticks` is a frame cap, so `ticks / 60` is the burst's real length, and the
    // bare `confetti()` exposes no handle to cancel it with -- `reset()` exists
    // only on instances from `create()`. This bound is the entire reason a burst
    // cannot spill into the vinyl scene, so it is checked rather than assumed.
    // Retune `ticks` upward or `birthdayAt` later and this is what fails.
    const burstEnds = CARD_TIMELINE.birthdayAt + CONFETTI_TICKS / 60;
    expect(burstEnds).toBeLessThanOrEqual(CARD_TIMELINE.handoff);
  });
});

describe("reduced motion", () => {
  it("keeps every beat and only compresses the gaps between them", () => {
    const full = cardTimeline(false);
    const fast = cardTimeline(true);
    expect(Object.keys(fast)).toEqual(Object.keys(full));
    // Same order, strictly shorter. A beat that does not move at all under
    // reduced motion means it was dropped, not shortened.
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      expect(fast[key]).toBeGreaterThan(0);
      expect(fast[key]).toBeLessThan(full[key]);
    }
    expect(fast.riseDone).toBeLessThan(fast.happyAt);
    expect(fast.happyAt).toBeLessThan(fast.birthdayAt);
    expect(fast.birthdayAt).toBeLessThan(fast.liftAt);
  });

  it("finishes the whole scene in about a second, well inside verify's 6s wait", () => {
    const fast = cardTimeline(true);
    // 5.2s of schedule at 200ms per beat is 1.04s by construction — five beats of
    // two hundred milliseconds. The bound that matters is that it stays far inside
    // the window verify.mjs waits for the card to be painted, so a reader who
    // asked for less motion is not left on a blank stage.
    expect(fast.handoff).toBeLessThan(1.5);
    expect(fast.handoff).toBeLessThan(6);
  });
});

describe("ms", () => {
  it("converts seconds to whole milliseconds, for setTimeout only", () => {
    expect(ms(1.4)).toBe(1400);
    expect(ms(0.5)).toBe(500);
    // setTimeout truncates a fractional millisecond count, so rounding rather
    // than flooring keeps the confetti on the same side of "Birthday!" as the
    // word it is celebrating rather than a hair before it.
    expect(ms(CARD_TIMELINE.birthdayAt)).toBe(1400);
  });

  it("keeps the timeline in seconds, against the trap that broke it", () => {
    // The bug this exists to name. Motion takes `duration` and `delay` in seconds,
    // so a `delay` of ms(1.4) is a delay of 1400 *seconds*: a scene that runs
    // perfectly on time, a card at full opacity, and every word still at opacity 0
    // because its animation had not started yet.
    //
    // These two lines between them pin the scale — the timeline is in seconds and
    // `ms` multiplies by a thousand — so hand-editing a beat into milliseconds
    // breaks the second. They cannot prove anything about how the value reaches
    // Motion, and no test of a pure module could: a `delay={ms(t.birthdayAt)}`
    // reads identically from here. What catches that is verify.mjs, which reads the
    // live opacity of every word segment in the card and fails when none of them
    // ever animate.
    expect(CARD_TIMELINE.birthdayAt).toBe(1.4);
    expect(ms(CARD_TIMELINE.birthdayAt)).toBe(1400);
  });
});
