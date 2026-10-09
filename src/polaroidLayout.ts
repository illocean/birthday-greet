/**
 * The numbers that make the gallery look laid down by hand instead of laid out
 * by a machine.
 *
 * Every one of these is a pure function of the photo's index, which is the whole
 * point. `Math.random()` in a style prop re-rolls on every re-render, so a
 * polaroid that tilts while you are reading it looks broken rather than placed;
 * and a scroll tilt has to be clamped, or a fast flick on a phone sends the photo
 * spinning off the page.
 *
 * They live in a module rather than inline because `polaroidLayout.test.ts` is
 * the only thing that can assert them, and a test cannot reach a component's
 * inline `style` object.
 */

/** Largest seeded resting tilt, in degrees either side of square. */
export const TILT_MAX_DEG = 9;

/** How far a polaroid is allowed to lean off its resting tilt while scrolling. */
export const TILT_LIMIT_DEG = 3;

/** Degrees of lean per unit of scroll velocity — see `tiltFromVelocity`. */
export const TILT_PER_VELOCITY = 1.2;

/** Travel of the parallax, in px, at depth 1. */
export const PARALLAX_PX = 44;

/** How early each polaroid's parallax begins, as a fraction of its own section. */
export const STAGGER_MIN = 0.06;
export const STAGGER_MAX = 0.12;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * A stable 0..1 for any index, from `sin` of a large multiplier.
 *
 * The usual trick, and it is here because it needs no state, no seed and no
 * dependency: the fractional part of `sin(n * 127.1) * 43758.5453` decorrelates
 * consecutive integers completely at this range, and `0` lands on exactly 0,
 * which is why the salt below keeps the first photo off the extreme.
 */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Resting rotation in degrees: −9…+9, and never the same twice in a row. */
export function seededTilt(index: number): number {
  return (hash(index + 1) * 2 - 1) * TILT_MAX_DEG;
}

/**
 * Per-photo parallax strength, 0.7…1.3. Without it every photo would drift by the
 * same amount and the stack would shear like a card fan instead of sitting at
 * different depths.
 */
export function depth(index: number): number {
  return 0.7 + hash(index + 101) * 0.6;
}

/**
 * Where this photo's reveal begins, as a fraction of its own scroll section:
 * 6%…12%. The brief's mobile stagger. Offsets are relative to each polaroid's
 * *own* progress, so the number means the same thing for all six rather than
 * "photo six starts later than photo five", which is what a shared timeline
 * would give and would look like a conveyor belt.
 */
export function stagger(index: number): number {
  return STAGGER_MIN + hash(index + 201) * (STAGGER_MAX - STAGGER_MIN);
}

/**
 * Which side of centre a photo sits on, for wide viewports. Alternates, because a
 * column of photos down the middle is a list and a zig-zag is a spread album.
 */
export function side(index: number): "left" | "right" {
  return index % 2 === 0 ? "left" : "right";
}

/**
 * The lean a photo takes while it is moving, in degrees.
 *
 * `v` is scroll velocity in progress-units per second, straight out of
 * `useVelocity`. The clamp is the load-bearing line: a momentum scroll on iOS
 * reaches single digits in that unit, and 1.2 degrees per unit turns that into
 * more than a full 90° of lean, which reads as the photo falling over rather
 * than being handled.
 */
export function tiltFromVelocity(v: number): number {
  return clamp(v * TILT_PER_VELOCITY, -TILT_LIMIT_DEG, TILT_LIMIT_DEG);
}