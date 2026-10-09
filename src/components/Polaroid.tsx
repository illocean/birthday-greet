import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useEffect, useRef } from "react";
import { playSfx } from "../audio";
import { photos } from "../content";
import {
  PARALLAX_PX,
  depth,
  seededTilt,
  side,
  stagger,
  tiltFromVelocity,
} from "../polaroidLayout";

/**
 * One photograph, taped to the page.
 *
 * Two elements, because there are two different things driving them and they
 * fight over `y` and `rotate` if they share one:
 *
 *   - The lift (outer) is *continuous*: it travels the full height of its own
 *     section on a scroll value, and leans with the scroll's velocity.
 *   - The card (inner) is *discrete*: it springs in once, when it is properly on
 *     screen, and then stays put. A spring on a continuous scroll value is a lag
 *     filter, not an entrance.
 *
 * Keeping them apart is also what lets the snap sound fire once. `onViewportEnter`
 * on the card is the only moment in the scene that is an event rather than a
 * position, so it is the only place a sound can honestly be triggered from.
 */

/** The brief's 400ms floor between snaps, so a fast scroll is a rattle, not a machine gun. */
const SNAP_GAP_MS = 400;
let lastSnap = 0;

/** `photos[]` accepts clips as well as stills — the slot is chosen by extension. */
const isVideo = (src: string) => /\.(mp4|webm|mov)$/i.test(src);

function snap() {
  const now = performance.now();
  if (now - lastSnap < SNAP_GAP_MS) return;
  lastSnap = now;
  playSfx("snap");
}

export default function Polaroid({ index }: { index: number }) {
  const photo = photos[index];
  const reduceMotion = useReducedMotion() ?? false;

  const slot = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLVideoElement>(null);
  const { scrollYProgress } = useScroll({
    target: slot,
    // Measured over the slot's own travel: 0 when its top edge reaches the
    // bottom of the viewport, 1 when its bottom edge leaves the top. That makes
    // the parallax identical for all six photos instead of scaling with how tall
    // each one happens to be.
    offset: ["start end", "end start"],
  });

  const d = depth(index);
  // A spring on the parallax, not on the reveal: this is the one movement that
  // runs for the whole scroll, and a linear one reads as the page sliding under
  // glass rather than as the photo sitting in it. `useSpring` (not
  // `visualDuration`) because it takes no duration and cannot be retimed by
  // mistake.
  const travel = useTransform(scrollYProgress, [0, 1], [PARALLAX_PX * d, -PARALLAX_PX * d]);
  const y = useSpring(travel, { stiffness: 120, damping: 28, mass: 0.6 });

  // Lean with the scroll. Under reduced motion the photo is not being moved, so
  // a lean would be the only thing still happening.
  const velocity = useVelocity(scrollYProgress);
  const tilt = useTransform(velocity, tiltFromVelocity);

  const resting = seededTilt(index);

  // Clips behave like moving photographs: play while visible, pause offscreen,
  // and stay still under reduced motion. Playback has no interactive controls.
  useEffect(() => {
    const el = clip.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!reduceMotion && el.paused) void el.play().catch(() => {});
      } else if (!el.paused) {
        el.pause();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  return (
    <div
      ref={slot}
      className={`polaroid-slot polaroid-slot--${side(index)}`}
      // The mobile stagger, as a fraction of the column's width, pushed through
      // a custom property rather than as an inline `margin`. An inline
      // `margin-inline-start` would still be in force at the desktop breakpoint,
      // where the L/R alternation takes over, and the two offsets would stack.
      // A custom property lets CSS decide *where* the number applies.
      //
      // Only ever pushes right, and only by a fraction, so no photo can be
      // pushed off the edge of a 360px screen.
      style={{ "--stagger": stagger(index) } as React.CSSProperties}
    >
      <motion.div className="polaroid-lift" style={{ y: reduceMotion ? undefined : y, rotate: reduceMotion ? undefined : tilt }}>
        <motion.figure
          // The element whose own opacity is animated. `verify.mjs` reads this
          // one, so the check samples the reveal itself rather than a wrapper
          // that happens to contain it.
          data-testid="polaroid"
          className="polaroid"
          onViewportEnter={snap}
          viewport={{ once: true, amount: 0.4 }}
          initial={{ opacity: 0, scale: 0.9, y: reduceMotion ? 0 : 44, rotate: resting - 7 }}
          whileInView={{ opacity: 1, scale: 1, y: 0, rotate: resting }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : { type: "spring", visualDuration: 0.5, bounce: 0.34 }
          }
        >
          <WashiTape lean={resting} />
          <div className="polaroid__photo">
            {isVideo(photo.src) ? (
              // A clip in the same slot as a print: same class, so the CSS that
              // crops an image to the square crops the video identically. Muted
              // because a card that starts talking at the reader is a bug, and
              // muted is also what lets a clip start without a gesture.
              <video
                ref={clip}
                className="polaroid__img pointer-events-none"
                src={photo.src}
                aria-label={photo.alt}
                tabIndex={-1}
                disablePictureInPicture
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                className="polaroid__img"
                src={photo.src}
                alt={photo.alt}
                // Below the fold until her own scroll reaches it, and six of them at
                // 1400px is 6 * ~200kB that scene two should not wait for.
                loading="lazy"
                decoding="async"
              />
            )}
            {/* The sheen. A polaroid under a window has a diagonal glare across
                it; without this the stock reads as a printed rectangle. */}
            <span className="polaroid__sheen" aria-hidden="true" />
          </div>
          <figcaption className="polaroid__caption">{photo.caption}</figcaption>
        </motion.figure>
      </motion.div>
    </div>
  );
}

/**
 * A strip of washi tape, authored rather than downloaded: torn ends are two
 * ragged paths and nothing else, and the tape is what makes a photo read as
 * *pinned to this page* rather than laid out on it.
 *
 * The strip is rotated by the photo's own resting tilt so it stays square to the
 * card's edge — tape goes on along the edge, not along the page.
 */
function WashiTape({ lean }: { lean: number }) {
  return (
    <svg
      className="polaroid__tape"
      viewBox="0 0 120 34"
      aria-hidden="true"
      focusable="false"
      style={{ transform: `rotate(${lean * 0.35}deg)` }}
    >
      <defs>
        <linearGradient id="tape-tint" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stopColor="var(--color-blush-100)" stopOpacity="0.72" />
          <stop offset="55%" stopColor="var(--color-rose-300)" stopOpacity="0.62" />
          <stop offset="100%" stopColor="var(--color-blush-200)" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* A band across the top with both ends torn. Each end is a small zigzag
          rather than a straight cut, which is the only thing that reads as
          torn at this size — a straight end is a piece of masking tape. */}
      <path
        fill="url(#tape-tint)"
        d="M0 7 L6 5 L11 8 L17 4 L23 7 L30 5 L30 0 L120 0 L120 34 L30 34 L30 29 L24 32 L17 29 L11 33 L5 30 L0 32 Z"
      />
      {/* Woven texture: the fine crosshatch of real washi, kept very faint so it
          is felt rather than seen. */}
      <path
        fill="none"
        stroke="var(--color-rose-600)"
        strokeOpacity="0.14"
        strokeWidth="0.6"
        d="M0 12 L120 14 M0 18 L120 20 M0 24 L120 26"
      />
      <path
        fill="none"
        stroke="var(--color-rose-600)"
        strokeOpacity="0.1"
        strokeWidth="0.5"
        d="M14 0 L16 34 M38 0 L39 34 M62 0 L61 34 M86 0 L87 34 M108 0 L107 34"
      />
    </svg>
  );
}
