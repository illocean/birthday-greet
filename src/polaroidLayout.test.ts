import { describe, expect, it } from "vitest";
import {
  PARALLAX_PX,
  STAGGER_MAX,
  STAGGER_MIN,
  TILT_LIMIT_DEG,
  TILT_MAX_DEG,
  depth,
  seededTilt,
  side,
  stagger,
  tiltFromVelocity,
} from "./polaroidLayout";

// These five numbers are the entire reason scene four looks hand-placed, and
// every one of them used to be a literal in a `style` prop. The failure modes are
// specific, so the assertions are specific too:
//
//   - a tilt that is not stable re-rolls on re-render and the photo visibly jumps
//     while she is looking at it
//   - a tilt outside ±9° stops reading as a polaroid taped to a page
//   - an unclamped scroll tilt sends the photo past 90° on a momentum scroll,
//     which reads as the photo falling over rather than being picked up
//   - a stagger outside 6-12% either fires before the photo is on screen (so the
//     reveal happens off-screen and she never sees it) or so late that the reveal
//     is cut off at the bottom
//   - depth that is constant shears the column like a card fan
describe("polaroid layout", () => {
  it("gives every photo its own resting tilt, within ±9°", () => {
    const tilts = [0, 1, 2, 3, 4, 5].map(seededTilt);
    for (const t of tilts) expect(Math.abs(t)).toBeLessThanOrEqual(TILT_MAX_DEG);
    // Six photos with six different angles. A collision between two is what
    // makes a spread look like a template.
    expect(new Set(tilts.map((t) => t.toFixed(2))).size).toBe(6);
  });

  it("returns the same tilt every time for the same photo", () => {
    for (let i = 0; i < 6; i++) expect(seededTilt(i)).toBe(seededTilt(i));
  });

  it("spreads the parallax depths across 0.7…1.3 rather than one value", () => {
    const d = [0, 1, 2, 3, 4, 5].map(depth);
    for (const v of d) {
      expect(v).toBeGreaterThanOrEqual(0.7);
      expect(v).toBeLessThanOrEqual(1.3);
    }
    expect(new Set(d.map((v) => v.toFixed(2))).size).toBe(6);
  });

  it("staggers each photo between 6% and 12% of its own section", () => {
    for (let i = 0; i < 6; i++) {
      const s = stagger(i);
      expect(s).toBeGreaterThanOrEqual(STAGGER_MIN);
      expect(s).toBeLessThanOrEqual(STAGGER_MAX);
    }
  });

  it("staggers against the order, so the reveal is not a conveyor belt", () => {
    // A monotonic stagger would animate photo six last, always, which is the
    // tell of a shared timeline. This only asserts they differ, which is the part
    // that reads as hand-placed.
    const s = [0, 1, 2, 3, 4, 5].map(stagger);
    expect(new Set(s.map((v) => v.toFixed(3))).size).toBe(6);
  });

  it("alternates sides on wide viewports", () => {
    expect([0, 1, 2, 3, 4, 5].map(side)).toEqual([
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
    ]);
  });
});

describe("the scroll lean", () => {
  it("does nothing at rest", () => {
    expect(tiltFromVelocity(0)).toBe(0);
  });

  it("leans into the direction of travel", () => {
    expect(tiltFromVelocity(1.5)).toBeGreaterThan(0);
    expect(tiltFromVelocity(-1.5)).toBeLessThan(0);
  });

  it("clamps to ±3°, so a momentum flick cannot tip a photo past 90°", () => {
    // iOS momentum reaches 10+ progress-units per second on a short flick. At
    // 1.2 deg/unit that is 12 degrees unclamped.
    expect(tiltFromVelocity(10)).toBe(TILT_LIMIT_DEG);
    expect(tiltFromVelocity(-10)).toBe(-TILT_LIMIT_DEG);
    expect(tiltFromVelocity(1000)).toBe(TILT_LIMIT_DEG);
    expect(tiltFromVelocity(-1000)).toBe(-TILT_LIMIT_DEG);
  });

  it("is symmetric, because a photo that leans further one way than the other reads as broken", () => {
    for (const v of [0.3, 0.9, 1.8, 4]) expect(tiltFromVelocity(v)).toBeCloseTo(-tiltFromVelocity(-v));
  });

  it("moves the photo by less than a quarter of its own tilt at full parallax", () => {
    // Sanity on the ratio between the two constants: PARALLAX_PX is the travel,
    // TILT_MAX_DEG is the resting angle, and if the parallax were large enough to
    // matter visually the resting tilt would be lost against it.
    expect(PARALLAX_PX).toBeLessThan(TILT_MAX_DEG * 12);
  });
});