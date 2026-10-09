import { describe, expect, it } from "vitest";
import {
  VINYL_BEATS,
  VINYL_FAST,
  VINYL_FAST_BEATS,
  VINYL_TIMELINE,
  vinylTimeline,
} from "./vinylTimeline";

// Scene three holds the reader hostage twice over: it has to play the turntable
// beats in order, and it is the only scene that *releases* the scroll. Both
// outside readers depend on the numbers here — `scripts/verify.mjs` asserts the
// scroll is still locked immediately after the handover and then asserts it is
// not, and the reduced-motion path has to compress the scene without dropping
// any of it. Get the order wrong and the needle lands on a record that has not
// slid out yet; get the release wrong and the scene is either unreadable or
// skipped.
describe("the turntable's schedule", () => {
  it("slides the record out, swings the arm, then drops the needle — in that order", () => {
    const t = VINYL_TIMELINE;
    // The record has to be clear of the sleeve before the arm swings over it,
    // or the arm appears to swing through a closed sleeve.
    expect(t.sleeveOut).toBeLessThanOrEqual(t.centred);
    // And the pair has to be settled before the needle lands, because that is
    // the beat that starts the music.
    expect(t.centred).toBeLessThan(t.needleDrop);
  });

  it("ramps the spin up after the needle lands, not before", () => {
    // 0 -> 1.2 rad/s over 1.5s, and the ramp cannot start until there is a
    // needle down to hear it over.
    expect(VINYL_BEATS.spinUp).toBe(1.5);
    expect(VINYL_TIMELINE.spinUpDone).toBe(VINYL_TIMELINE.needleDrop + VINYL_BEATS.spinUp);
  });

  it("releases the scroll three full seconds after the needle drops", () => {
    // The brief's wording is "after 3s spinning", and spinning starts at the
    // needle drop -- not at the top of the scene. Deriving the release from the
    // wrong beat is the difference between five seconds of turntable and none.
    expect(VINYL_TIMELINE.unlockAt - VINYL_TIMELINE.needleDrop).toBe(3);
  });

  it("keeps the scroll locked for long enough to still be locked when verify looks", () => {
    // verify.mjs runs a scroll attempt the moment the handoff lands, and asserts
    // it stayed at 0. A release at t=0 would make that check pass for the wrong
    // reason while the record is still sliding out of its sleeve.
    expect(VINYL_TIMELINE.unlockAt).toBeGreaterThanOrEqual(4.5);
  });

  it("releases well inside the window verify.mjs waits for the cue", () => {
    expect(VINYL_TIMELINE.unlockAt).toBeLessThan(15);
  });
});

describe("reduced motion", () => {
  it("keeps every beat and only compresses the gaps between them", () => {
    const full = vinylTimeline(false);
    const fast = vinylTimeline(true);
    expect(Object.keys(fast)).toEqual(Object.keys(full));
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      expect(fast[key]).toBeLessThan(full[key]);
    }
    expect(fast.centred).toBeLessThan(fast.needleDrop);
    expect(fast.needleDrop).toBeLessThan(fast.spinUpDone);
  });

  it("collapses the slide to zero and nothing else, because there is no slide to time", () => {
    // Every other beat still has a duration under reduced motion -- the arm
    // still swings, the needle still lands, the scroll still opens on a delay.
    // The slide is the one move that has no reduced-motion form, so it is the
    // one beat that is allowed to reach zero.
    expect(VINYL_FAST_BEATS.sleeveOut).toBe(0);
    expect(VINYL_FAST.centred).toBeGreaterThan(0);
    expect(VINYL_FAST.needleDrop).toBeGreaterThan(0);
    expect(VINYL_FAST.unlockAt).toBeGreaterThan(0);
  });

  it("opens the scroll in well under a second", () => {
    expect(VINYL_FAST.unlockAt).toBeLessThan(1);
  });
});
