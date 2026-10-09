import { useLayoutEffect, useRef } from "react";
import confetti from "canvas-confetti";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { playSfx } from "../audio";
import { CONFETTI_TICKS } from "../cardTimeline";
import { letterText } from "../content";
import { letterShift, shouldCelebrate, unfoldAt, wordOpacity } from "../letterTimeline";
import Peony from "./Peony";
import WornPaper from "./WornPaper";

/**
 * One word, lit between two scroll positions.
 *
 * Opacity and nothing else. A word that moved, or that faded as a blur, would be
 * harder to read than one that simply was not there yet — and this is the only
 * thing on the page whose job is to be read.
 */
function Word({
  text,
  index,
  count,
  progress,
  reduceMotion,
}: {
  text: string;
  index: number;
  count: number;
  progress: MotionValue<number>;
  /** `true` when the reader asked for less motion; see `TrifoldLetter`. */
  reduceMotion: boolean;
}) {
  const opacity = useTransform(progress, (p) =>
    reduceMotion ? 1 : wordOpacity(p, index, count),
  );

  return (
    <motion.span
      className="letter__word"
      // The verify script asks whether the *last* word reaches full ink, and it
      // needs an element whose own opacity is the thing that changes. The
      // paragraph is the wrong thing to measure — it is one span and it is at 1
      // from the first frame.
      {...(index === count - 1 ? { "data-testid": "letter-last-word" } : {})}
      style={{ opacity }}
    >
      {text}
    </motion.span>
  );
}

export default function TrifoldLetter() {
  const section = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  // Read as a plain value, and that is deliberate. This used to be a ref kept in
  // sync by an effect, on the theory that `useTransform` captures the callback it
  // is handed and a `reduceMotion` read inside one would therefore be frozen at
  // the first render's answer. The theory was wrong twice over:
  //
  //   `useReducedMotion` is `useState(prefersReducedMotion.current)` with no
  //   setter and no subscription — its own source carries a literal `TODO` about
  //   not reacting to changes — so the value cannot change for the lifetime of
  //   this component, and a ref could never have held a second value; and
  //   the subscribe effect inside `useCombineMotionValues` has no dependency
  //   array, so it unsubscribes and re-subscribes on every render, closing over
  //   that render's value anyway.
  //
  // The ref was therefore dead weight, and the comment above it described a
  // hazard that does not exist.
  const { scrollYProgress } = useScroll({
    target: section,
    // "end end" rather than "end start": the section is 250vh and the last
    // 150vh of that is the travel, so progress reaches exactly 1 at the bottom
    // of the *page*, which is where the celebration is timed from.
    offset: ["start start", "end end"],
  });

  // 0–35%: the trifold opens. Under reduced motion it starts open, because a
  // fold is the one thing in this scene that is 3D rotation for its own sake
  // rather than for showing something.
  const open = useTransform(scrollYProgress, (p) =>
    reduceMotion ? 1 : unfoldAt(p),
  );
  // Opposite signs, and that is the geometry rather than a typo. The top panel
  // hinges at its bottom edge, so its body sits above the hinge (local y < 0); the
  // bottom panel hinges at its top edge, so its body sits below (y > 0). CSS
  // `rotateX(a)` sends a local (0, y, 0) to z = y·sin(a), so the top needs a
  // negative angle and the bottom a positive one for the two to travel the same
  // way round the x axis.
  //
  // Both therefore swing *towards* the reader, not behind the sheet — and 90 is
  // the endpoint, not 180. `backface-visibility: hidden` culls a panel once
  // |a| > 90, because the face normal's z component is cos(a): past 90 the flap
  // paints nothing at all.
  //
  // Measured, by reading the rendered matrix at each stop rather than computing
  // what the mapping ought to give. At ±90 the flap's `m22` walks 1 → 0 across
  // p = 0.02 → 0.34 and its painted height collapses 271px → 38px, going edge-on
  // exactly at `unfoldEnd` — so the whole 0–35% budget is visible motion and the
  // seam lines up with the first word. At ±180 the same `m22` crossed zero at
  // p ≈ 0.175 and then went *negative* (−0.977, −0.999, −1) all the way to
  // p = 1: the flap was culled for 82.5% of the letter's entire travel, not
  // merely until the first word lifted. That is the defect this mapping fixes.
  const foldTop = useTransform(open, [0, 1], [0, -90]);
  const foldBottom = useTransform(open, [0, 1], [0, 90]);

  // Measure the flow itself: its parent's scrollHeight changes when this text
  // translates, so using that height would shrink the travel as the reader scrolls.
  const flowRef = useRef<HTMLDivElement>(null);
  const contentHeight = useMotionValue(0);
  const viewHeight = useMotionValue(0);
  const shift = useTransform<number, number>(
    [scrollYProgress, contentHeight, viewHeight],
    ([p, content, view]) => letterShift(p, content, view, reduceMotion),
  );

  useLayoutEffect(() => {
    const el = flowRef.current;
    const sec = section.current;
    const ink = el?.parentElement;
    if (!el || !sec || !ink) return;
    const measure = () => {
      const style = getComputedStyle(ink);
      const view = Math.max(0, ink.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      const content = el.scrollHeight;
      contentHeight.set(content);
      viewHeight.set(view);
      sec.style.setProperty("--letter-overflow", `${Math.max(0, content - view)}px`);
    };
    measure();
    // Both boxes matter: a phone's URL bar can resize the paper without changing
    // the text's height. Font loading and line wrapping resize the flow instead.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(ink);
    return () => ro.disconnect();
  }, [contentHeight, viewHeight]);

  const unfolded = useRef(false);
  const celebrated = useRef(false);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (!unfolded.current && p > 0.01) {
      unfolded.current = true;
      // The fold itself is silent under reduced motion: the paper does not move,
      // and a rustling sound over a sheet that is sitting still describes motion
      // the reader was not shown.
      if (!reduceMotion) playSfx("paper-unfold");
    }

    if (!celebrated.current && shouldCelebrate(p)) {
      celebrated.current = true;
      // Same burst as the greeting, from the same palette, for the same reason:
      // this is the last thing the page does and it should land like the first.
      confetti({
        colors: ["#F9D3DE", "#F4B3C6", "#EC93AE", "#FFFAF7", "#E8C39E"],
        particleCount: 70,
        spread: 78,
        startVelocity: 28,
        gravity: 0.9,
        scalar: 0.9,
        ticks: CONFETTI_TICKS,
        origin: { y: 0.55 },
        // A reader who asked for less motion gets no burst, not a smaller one.
        disableForReducedMotion: true,
      });
      // Audio is a separate axis from motion, and the chime is deliberately the
      // exception. The confetti has a visual counterpart, so dropping it removes
      // a matching sound with it; the chime has none under reduced motion, and it
      // is the last thing the page does. Cutting it would end the letter in
      // silence. Sound carries no vestibular risk, so it is not gated here.
      playSfx("chime");
    }
  });

  // Word indices are global across the whole letter, not per line: the brief asks
  // for the paragraph to come up as one sweep, and that only happens if the
  // windows tile 0.35 → 0.9 end to end.
  const lines: { words: string[]; start: number }[] = [];
  let total = 0;
  for (const line of letterText) {
    const words = line.split(" ");
    lines.push({ words, start: total });
    total += words.length;
  }

  return (
    <section id="letter" className="letter" ref={section} data-testid="letter">
      <div className="letter__stage">
        <div className="letter__paper">
          <WornPaper
            overlay={
              <>
                <motion.div
                  className="letter__flap letter__flap--top"
                  style={{ rotateX: foldTop }}
                />
                <motion.div
                  className="letter__flap letter__flap--bottom"
                  style={{ rotateX: foldBottom }}
                />
              </>
            }
          >
            {/* The viewport's content. `.worn__ink` clips it and `shift` above
                moves it; without this wrapper the paragraphs are the ink box's
                direct children and there is nothing to transform. */}
            <motion.div className="worn__flow" ref={flowRef} style={{ y: shift }}>
              {lines.map((line, li) => (
                // A paragraph, not a generic span. Every entry in `letterText` is a
                // paragraph, and a screen reader should be told that rather than
                // having to infer it from run-together word spans. The words inside
                // stay spans, so this does not put 90 extra block boxes into the
                // layout — `.letter__line` is already the block that carries the
                // line.
                <p className="letter__line" key={li}>
                  {line.words.map((word, wi) => (
                    <Word
                      key={wi}
                      // The trailing space rides with the word rather than sitting
                      // between the elements: it is part of the text, it collapses
                      // at the end of a line for free, and a separator node between
                      // every pair of words is DOM nobody asked for.
                      text={`${word} `}
                      index={line.start + wi}
                      count={total}
                      progress={scrollYProgress}
                      reduceMotion={reduceMotion}
                    />
                  ))}
                </p>
              ))}
            </motion.div>
          </WornPaper>
        </div>
        <Peony />
      </div>
    </section>
  );
}
