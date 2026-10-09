import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { photos, tileText } from "../content";
import LaceHeart from "./LaceHeart";
import LetterTile from "./LetterTile";
import Polaroid from "./Polaroid";

/**
 * Scene four: the greeting that stays on the wall while she looks through the
 * photographs.
 *
 * The doily and the tiles are the heading — the greeting and the recipient's
 * name — and they are static. Everything below them moves. That split is
 * deliberate: a moving heading means the reader is looking at the heading
 * instead of at the photos, and the photos are the point of the scene.
 *
 * Read in order: the heart with the greeting inside it, then the name spelled in
 * tiles laid over its lower-left, then the photographs one at a time.
 */
export default function Gallery({ navigable }: { navigable: boolean }) {
  const rail = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: rail, offset: ["start center", "end center"] });

  return (
    <section className="gallery" aria-label="Photographs">
      <header className="gallery__head">
        {/* Tilted clockwise, ~12°. A doily pinned straight to a page reads as a
            graphic; the same doily pinned by one corner reads as an object that
            was put there. */}
        <div className="gallery__doily">
          <LaceHeart>
            <span className="doily__line">Happy</span>
            <span className="doily__line">Birthday!</span>
          </LaceHeart>
        </div>

        {/* The name in tiles. Overlaps the doily's lower-left rather than sitting
            under it — the overlap is what makes them one arrangement instead of
            two stacked blocks. */}
        <p className="gallery__tiles">
          <span className="sr-only">{tileText}</span>
          {[...tileText].map((letter, i) => (
            <LetterTile key={`${letter}-${i}`} letter={letter} index={i} />
          ))}
        </p>
      </header>

      {/* One list, so a screen reader hears six photographs in order. The `side`
          class each photo carries is what zig-zags them; the markup stays a flat
          column, because alternating markup order would read as a reordered list
          to anyone not looking at it. */}
      <div className="gallery__album">
      <nav ref={rail} className="gallery__progress" aria-label="Memory navigation" inert={!navigable}>
        <span className="gallery__progress-track" aria-hidden="true">
          <motion.span className="gallery__progress-fill" data-testid="gallery-progress" style={{ scaleY: scrollYProgress }} />
        </span>
        {photos.map((photo, i) => (
          <GalleryStop key={photo.src} index={i} progress={scrollYProgress} reduceMotion={reduceMotion} />
        ))}
        <GalleryStop index={photos.length} progress={scrollYProgress} reduceMotion={reduceMotion} />
      </nav>
      <ol className="gallery__photos">
        {photos.map((photo, i) => (
          <li key={photo.src} id={`memory-${i + 1}`} className="gallery__photo-item">
            <Polaroid index={i} />
          </li>
        ))}
      </ol>
      </div>
    </section>
  );
}

function GalleryStop({ index, progress, reduceMotion }: {
  index: number;
  progress: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const letter = index === photos.length;
  const label = letter ? "letter" : `memory ${index + 1}`;
  const target = letter ? "letter" : `memory-${index + 1}`;
  const current = useTransform(progress, (value) => letter ? value >= 0.995
    : value < 0.995 && Math.min(photos.length - 1, Math.floor(value * photos.length)) === index);
  const scale = useTransform(current, (value) => value ? 1.55 : 1);

  useEffect(() => {
    const mark = (active: boolean) => {
      if (active) link.current?.setAttribute("aria-current", "step");
      else link.current?.removeAttribute("aria-current");
    };
    mark(current.get());
    return current.on("change", mark);
  }, [current]);

  return (
    <a ref={link} href={`#${target}`}
      className={`gallery__progress-stop${letter ? " gallery__progress-stop--letter" : ""}`}
      style={{ top: letter ? "100%" : `${((index + 0.5) / photos.length) * 100}%` }}
      aria-label={letter ? "Read the letter" : `Go to ${label}: ${photos[index].caption}`}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const destination = document.getElementById(target);
        if (!destination) return;
        event.preventDefault();
        destination.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: letter ? "start" : "center" });
      }}>
      <motion.span className="gallery__progress-dot" style={{ scale }} aria-hidden="true" />
      <span className="gallery__progress-label" aria-hidden="true">{label}</span>
    </a>
  );
}
