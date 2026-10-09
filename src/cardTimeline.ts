// Scene two's schedule, in seconds from the moment the envelope finishes opening.
//
// This is the brief's scene, timing and nothing else:
//
//   0.0s  the card is settled in front; its greeting starts
//   0.5s  the greeting's first line arrives
//   1.0s  "Happy" has landed on the card
//   1.4s  "Birthday!" lands, the sparkles start, the confetti fires
//   4.4s  the hold ends and the card lifts away
//
// It is a module rather than a list of numbers inline in the component because
// two other things depend on these values and neither of them is the card:
//
//   - `scripts/verify.mjs` waits 6s for the card to reach full opacity and 15s for
//     the handoff to vinyl, so shortening this schedule silently retimes a check.
//   - `prefers-reduced-motion` has to compress the whole thing without changing
//     its order, which means reading the numbers rather than hardcoding 0.2s.
//
// Exporting it also means the timings are asserted once, in one test, rather
// than being four magic numbers that only add up correctly by accident.
// Flap, paper lift, then settle; the same stops run backwards to close.
export const ENVELOPE_TIMELINE = { duration: 2.1, reducedDuration: 0.3, stops: [0, 0.32, 0.68, 1] } as const;

export const CARD_TIMELINE = {
  /** The card is clear of the envelope and fully arrived. */
  riseDone: 0.5,
  /** "Happy" lands. */
  happyAt: 1.0,
  /** "Birthday!", the sparkles and the confetti all land together. */
  birthdayAt: 1.4,
  /** The hold ends; the card starts to lift and fade. */
  liftAt: 4.4,
  /** Scene three's mount. Past this the card is out of the way. */
  get handoff() {
    return this.liftAt + 0.8;
  },
} as const;

/**
 * The same schedule, compressed. A reader who asked for less motion should still
 * get the whole scene — greeting, sparkles, confetti, the record — in the same
 * order. What they asked for is not to be made to wait through it.
 *
 * Scale rather than a second set of numbers: a parallel table is two things to
 * keep in step, and this way the reduced-motion scene is provably the same
 * schedule, only quicker.
 */
export function cardTimeline(reducedMotion: boolean) {
  if (!reducedMotion) return CARD_TIMELINE;
  const k = 0.2;
  return {
    riseDone: CARD_TIMELINE.riseDone * k,
    happyAt: CARD_TIMELINE.happyAt * k,
    birthdayAt: CARD_TIMELINE.birthdayAt * k,
    liftAt: CARD_TIMELINE.liftAt * k,
    handoff: CARD_TIMELINE.handoff * k,
  };
}

/**
 * Seconds to milliseconds — for `setTimeout` and nothing else.
 *
 * This helper used to carry the comment "that is what every Motion transition in
 * this build speaks", and that was simply false, and it cost the whole greeting:
 * Motion takes `duration`, `visualDuration` and `delay` in *seconds*, so handing
 * it `ms(1.4)` asked for a delay of 1400 seconds. The card was fully opaque, the
 * scene ran on time, and every line of text on it was still sitting at
 * `opacity: 0` — verified by reading the Web Animations timing off the live DOM.
 *
 * The timeline is in seconds, so a Motion transition takes `t.birthdayAt`
 * directly. Only the timers go through here. If you find yourself wrapping a
 * number in `ms()` on its way into a `transition`, you are about to make the same
 * mistake again.
 */
export const ms = (seconds: number) => Math.round(seconds * 1000);

/**
 * canvas-confetti's frame cap for the burst. Not a duration — the library's rAF
 * loop stops after exactly this many frames. `cardTimeline.test.ts` checks that
 * the burst fits before the handoff at 60fps; GreetingCard also resets it on
 * close or unmount so it cannot outlive that scene on slower devices.
 */
export const CONFETTI_TICKS = 220;
