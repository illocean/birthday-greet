/**
 * Scene three's schedule, in seconds.
 *
 * Same shape and same reason as `cardTimeline.ts`: the scene takes no reader
 * input until the scroll is released, so the only things to get wrong are the
 * order of the beats and the moment the scroll lets go — and both are worth
 * pinning without rendering a WebGL canvas to find out.
 *
 * Only five things are timed, because only five things happen before the reader
 * gets control: the record slides clear of the sleeve, the pair settles, the
 * tonearm swings, the needle lands, and then — three seconds of spinning later —
 * the scroll is released.
 */

/** The knobs, in the order the reader meets them. */
export type VinylBeats = {
  /** The record is clear of the sleeve. */
  readonly sleeveOut: number;
  /** The pair has settled and the tonearm starts its swing. */
  readonly centred: number;
  /** The needle lands: effect, crackle bed, and the song fading up. */
  readonly needleDrop: number;
  /** How long the 0 → 1.2 rad/s ramp takes. */
  readonly spinUp: number;
  /** How long it has to be spinning before the scroll is released. */
  readonly spinBeforeScroll: number;
};

/** What the component actually reads, with the two derived beats resolved. */
export type VinylTimeline = {
  readonly sleeveOut: number;
  readonly centred: number;
  readonly needleDrop: number;
  /** The ramp is finished; the record is at full speed. */
  readonly spinUpDone: number;
  /** The scroll is released and the cue appears. */
  readonly unlockAt: number;
};

/** Full motion. Five seconds of turntable before she can scroll. */
export const VINYL_BEATS: VinylBeats = {
  sleeveOut: 0.2,
  centred: 1,
  needleDrop: 2,
  spinUp: 1.5,
  spinBeforeScroll: 3,
};

/**
 * Reduced motion, in the same spirit as `cardTimeline(true)`: every beat still
 * happens and still happens in order, but nothing travels far enough to count
 * as motion. The record does not spin either — a turntable that does not turn
 * is still a turntable, the `Petals` precedent — so `spinUp` is a formality here
 * and the scene is a still life that the scroll opens almost at once.
 */
export const VINYL_FAST_BEATS: VinylBeats = {
  sleeveOut: 0,
  centred: 0.1,
  needleDrop: 0.2,
  spinUp: 0.15,
  spinBeforeScroll: 0.5,
};

function derive(b: VinylBeats): VinylTimeline {
  return {
    sleeveOut: b.sleeveOut,
    centred: b.centred,
    needleDrop: b.needleDrop,
    spinUpDone: b.needleDrop + b.spinUp,
    unlockAt: b.needleDrop + b.spinBeforeScroll,
  };
}

export const VINYL_TIMELINE: VinylTimeline = derive(VINYL_BEATS);
export const VINYL_FAST: VinylTimeline = derive(VINYL_FAST_BEATS);

export function vinylTimeline(reducedMotion: boolean): VinylTimeline {
  return reducedMotion ? VINYL_FAST : VINYL_TIMELINE;
}

/**
 * Which pose the turntable is in. Deliberately three states and no fourth:
 * `docked` is the reader's first scroll rather than a beat, so it belongs to the
 * component's state and not to this schedule.
 *
 * The component moves between them on one timer per beat rather than by asking
 * this module what time it is, because two of the three beats have a side effect
 * attached — the needle drop fires three sounds — and a timer already is the
 * thing that runs those.
 */
export type VinylPhase = "out" | "centred" | "spinning";
