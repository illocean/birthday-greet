// Scene five's phase map, as a fraction of how far the reader has scrolled
// through the letter's section.
//
// The brief fixes three of these numbers — 0-35% unfold, 35-90% reveal, and a
// celebration at the end — and every one of them fails silently when it drifts,
// because the thing that reads them is a scroll listener with no assertion of its
// own. A reveal that ends at 0.85 still *looks* like a reveal in a screenshot.
//
// It is a module for the same reason `cardTimeline` is: `scripts/verify.mjs`
// walks to the bottom of the page and asks whether the last word is at full ink,
// which is only a meaningful question if "full ink" means 1 and not 0.85.

export const LETTER_PHASES = {
  /** The trifold has finished opening. */
  unfoldEnd: 0.35,
  /**
   * The words start coming up. It is not `unfoldEnd` + an epsilon because the
   * brief has them meet in the middle of the scroll: the fold is still settling
   * as the first words lift, and a gap between the two reads as the letter
   * stuttering.
   */
  revealStart: 0.35,
  /** Every word is at full ink. */
  revealEnd: 0.9,
  /**
   * The confetti and the chime.
   *
   * Short of 1 deliberately. Progress reaches exactly 1 only when the last
   * pixel of the page is on screen, and a reader who stops one flick of momentum
   * short of the bottom would otherwise scroll past the end of the letter with
   * no ending at all.
   */
  celebrateAt: 0.99,
  /**
   * Where a word sits before its window opens.
   *
   * Faint, not invisible: at 0 the sheet reads as blank paper, and a reader who
   * lands halfway down the page — from a deep link, or a refresh that restores
   * the scroll — would find nothing written on it at all.
   */
  dim: 0.15,
} as const;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Cubic ease-in-out. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * How far open the trifold is at `progress`, as 0..1.
 *
 * The flaps are driven straight off this, so the easing lives here where it can
 * be asserted rather than inside a `useTransform` closure nobody can reach.
 */
export function unfoldAt(progress: number): number {
  return easeInOut(clamp01(progress / LETTER_PHASES.unfoldEnd));
}

/**
 * Word `index` of `count` at `progress`, as 0.15 → 1.
 *
 * The window for word i is `[revealStart + i·step, revealStart + (i+1)·step]`
 * where `step` is `revealEnd - revealStart` divided by the word count, so the
 * windows tile the reveal without overlapping and the last word reaches full ink
 * exactly at `revealEnd`. Words before their window sit at `dim` and words after
 * it sit at 1, which is what makes the paragraph read as one continuous sweep
 * instead of a cascade of pops.
 */
export function wordOpacity(progress: number, index: number, count: number): number {
  if (count < 1) return 1;
  const { revealStart, revealEnd, dim } = LETTER_PHASES;
  const step = (revealEnd - revealStart) / count;
  return dim + (1 - dim) * clamp01((progress - revealStart - index * step) / step);
}

/** Move the measured, untransformed text through the paper's content box. */
export function letterShift(
  progress: number,
  contentHeight: number,
  viewHeight: number,
  reduceMotion = false,
): number {
  const overflow = Math.max(0, contentHeight - viewHeight);
  if (!overflow) return 0;
  if (reduceMotion) return -overflow * clamp01(progress);
  const { revealStart, revealEnd } = LETTER_PHASES;
  const revealed = clamp01((progress - revealStart) / (revealEnd - revealStart));
  return -Math.min(Math.max(revealed * contentHeight - viewHeight, 0), overflow);
}

/** Whether the confetti and the chime are due yet. */
export function shouldCelebrate(progress: number): boolean {
  return progress >= LETTER_PHASES.celebrateAt;
}
