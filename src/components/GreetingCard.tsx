import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import confetti from "canvas-confetti";
import { TextAnimate } from "./magicui/text-animate";
import { SparklesText } from "./magicui/sparkles-text";
import { playSfx } from "../audio";
import { friendName, senderName } from "../content";
import { cardTimeline, CONFETTI_TICKS, ENVELOPE_TIMELINE } from "../cardTimeline";

/**
 * Scene two. The card comes out of the envelope and says what it is.
 *
 * Three lines, staggered, on a card that rises out of an envelope which is by
 * then falling out of frame. Everything here shares the animation clock in
 * `cardTimeline.ts` rather than on state, because the scene has no reader input
 * and the only thing to get wrong is the order of the beats.
 *
 * `onDone` fires once, at the end, and hands over to the record.
 */
export default function GreetingCard({ onDone, active }: { onDone: () => void; active: boolean }) {
  const reduceMotion = useReducedMotion() ?? false;
  // Memoised, and not incidentally: `cardTimeline` builds a fresh object every
  // call, and the effect below lists `t` in its dependency array. Without
  // this, every render restarts the clock and the scene never reaches its
  // own handoff — it just keeps restarting.
  const t = useMemo(() => cardTimeline(reduceMotion), [reduceMotion]);

  // How far the card travels as it leaves. 70px is the gesture, but it is a
  // fixed distance and a 667x375 screen only has 52px above the card once the
  // envelope has settled, so the un-clamped lift walked the greeting off the
  // top edge. Measured at `liftAt` below, where the card's own transform is
  // still the identity and its rect is the real resting position.
  const card = useRef<HTMLElement>(null);
  const [liftTo, setLiftTo] = useState(-70);

  const clock = useMotionValue(0);
  const opacity = useTransform(clock, [0, t.liftAt, t.handoff], [1, 1, 0]);
  const y = useTransform(clock, [0, t.liftAt, t.handoff], [0, 0, liftTo]);
  const scale = useTransform(clock, [0, t.liftAt, t.handoff], [1, 1, 0.94]);

  useEffect(() => {
    if (!active) {
      if (clock.get() <= t.liftAt) return;
      // Restore a partially departed card over the first step of the reverse
      // envelope timeline, preserving its current pose instead of snapping back.
      const restore = animate(clock, t.liftAt, {
        duration: (reduceMotion ? ENVELOPE_TIMELINE.reducedDuration : ENVELOPE_TIMELINE.duration)
          * (1 - ENVELOPE_TIMELINE.stops[2]),
        ease: [0.22, 1, 0.36, 1],
      });
      return () => restore.stop();
    }
    clock.set(0);
    let previous = 0;
    const timeline = animate(clock, t.handoff, {
      duration: t.handoff,
      ease: "linear",
      onUpdate: (seconds) => {
        if (previous < t.happyAt && seconds >= t.happyAt) playSfx("pop");

    // "Happy" and "Birthday!" are announced by the two sparkles' own entrance;
    // the confetti is the punctuation, and it lands with "Birthday!" exactly so
    // the burst is never a frame ahead of the word it is celebrating.
        if (previous < t.birthdayAt && seconds >= t.birthdayAt) {
      confetti({
        // Palette tokens, not hexes that happen to match: --gold is the only
        // warm note in the build and this is the one place it is allowed.
        colors: ["#F9D3DE", "#F4B3C6", "#EC93AE", "#FFFAF7", "#E8C39E"],
        // No reduced-motion variant of these numbers, and that is a decision rather
        // than an omission: `disableForReducedMotion` below means a reader who asked
        // for less motion gets no burst at all, not a smaller one.
        particleCount: 70,
        spread: 78,
        startVelocity: 28,
        gravity: 0.9,
        scalar: 0.9,
        ticks: CONFETTI_TICKS,
        origin: { y: 0.62 },
        disableForReducedMotion: true,
      });
        }

    // The hold ends and the card lifts away. Driven off the same clock as the
    // rest of the scene so the three-second hold is the brief's and not a
    // separate guess about how long "a moment" is.
    //
    // The travel is the headroom actually above the card, capped at 70. Both
    // mappings of `y` read 0 at this instant, so re-deriving the transform costs
    // no frame; the 1px keeps the settled card off the boundary.
        if (previous < t.liftAt && seconds >= t.liftAt) {
          const top = card.current?.getBoundingClientRect().top ?? Infinity;
          setLiftTo(-Math.min(70, top - 1));
        }
        previous = seconds;
      },
      onComplete: onDone,
    });
    return () => { timeline.stop(); confetti.reset(); };
  }, [active, clock, onDone, reduceMotion, t]);

  return (
      <motion.article
        ref={card}
        className="greeting-card paper"
        data-testid="greeting-card"
        initial={false}
        style={{ opacity, y, scale }}
      >
        {/* A ruled line above the greeting, the way a real card opens with one. */}
        <span className="greeting-card__rule" aria-hidden="true" />
        <div key={active ? "reading" : "waiting"} style={{ opacity: active ? 1 : 0 }} aria-hidden={!active}>
        <TextAnimate
          as="p"
          by="word"
          animation="blurIn"
          // `startOnView` has to be false here and nowhere else in the card. This
          // component is scroll-driven, and scroll is *locked* in scene two, so
          // `scrollYProgress` is pinned at zero and a scroll-triggered reveal would
          // never play. The scene's own clock is the trigger. Scene five's letter
          // uses `TextReveal`, which does want the scroll binding.
          startOnView={false}
          duration={0.5}
          // Seconds, straight off the timeline. See `ms()` in cardTimeline.ts:
          // Motion's `delay` is in seconds, and multiplying it is a silent
          // 1000x error that leaves the element parked at its `initial` pose.
          delay={t.riseDone}
          className="greeting-card__hi"
        >
          {`Hi ${friendName}!`}
        </TextAnimate>

        <TextAnimate
          // `p`, not `h2`. "Happy" was the only heading in the card, which made
          // the outline read h1 "Happy Birthday!" -> p "Happy" ->
          // "Birthday!" as an unlabelled <strong> inside a plain div. A heading
          // whose entire text is one word of a greeting is worse for anyone
          // navigating by heading than no heading at all, and it split the visible
          // greeting across two levels. `.greeting-card__wish` carries every style
          // and the tag contributes nothing, so this is visually inert.
          //
          // "Birthday!" cannot join it: `SparklesText` never destructures `as`, so
          // the prop lands on its DOM div as an invalid attribute. Making the two
          // lines one heading is the vendor-patch route, and is not worth an
          // upstream edit for a greeting this site has exactly one reader for.
          as="p"
          by="word"
          animation="blurInUp"
          startOnView={false}
          duration={0.6}
          delay={t.happyAt}
          className="greeting-card__wish"
        >
          Happy
        </TextAnimate>

        {/* The sparkles are on "Birthday!" and nowhere else. They are a four-point
            star that fires on a loop, so used on all three lines they read as an
            effect; used on one they read as the emphasis. Colours come from the
            palette so they cannot drift off-theme. */}
        <motion.div
          className="greeting-card__sparkles"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          // A tween, not a spring. Two reasons, and the second is the real one:
          // a spring overshoots, and an opacity that overshoots past 1 clips at
          // 1 for the rest of the hold, so the spring buys nothing here.
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: t.birthdayAt }
          }
        >
          {/* No `as` prop: this component never destructures it, so it would fall
              through to the DOM `<div>` as an unknown attribute — a React warning
              in the console, which the verify harness fails on. It always renders
              a div, so the type is set through `className` instead. */}
          <SparklesText
            className="greeting-card__birthday"
            sparklesCount={8}
            colors={{ first: "#EC93AE", second: "#E8C39E" }}
          >
            Birthday!
          </SparklesText>
        </motion.div>

        <p className="greeting-card__from">{senderName}</p>
        </div>
      </motion.article>
  );
}
