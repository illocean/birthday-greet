import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play, ChevronDown } from "lucide-react";
import { ms } from "../cardTimeline";
import { playSfx, primeAudio, setCrackle, setSongPlaying, startSong } from "../audio";
import { trackTitle } from "../content";
import { vinylTimeline } from "../vinylTimeline";

/**
 * Scene three: the record poster, the five beats that play it, and the compact
 * player that accompanies the reader farther down the page.
 *
 * The three.js canvas is imported dynamically rather than through `lazy()` on
 * purpose. A `React.lazy` boundary still needs a `Suspense`, and covering a chunk
 * that never arrives needs an error boundary class too — a boundary inside the
 * module cannot see its own import reject. Doing the import by hand is shorter
 * than that and covers both failures: no WebGL, and no chunk, land on the same
 * CSS disc, which drives the same audio either way.
 *
 * The component stays mounted through scenes four and five. Docking is not a
 * sixth scene — the record keeps playing while she reads the photographs — so
 * the poster has to survive leaving.
 */

/**
 * WebGL is the one thing worth detecting before anything mounts: without it
 * three.js throws on the first frame and the whole scene is a black rectangle.
 * A lazy `useState` initialiser, so the probe costs one throwaway canvas, once.
 */
function detectWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/** What the reader asked for, not what Howler managed — see `audio.ts`. */
function CssDisc({ playing }: { playing: boolean }) {
  return (
    <div className="vinyl-disc" data-spinning={playing} aria-hidden="true">
      <span className="vinyl-disc__label" />
    </div>
  );
}

export type VinylStageProps = {
  /** The reader's first scroll: scene four is next. */
  onRecordPlayed: () => void;
  /** The timeline released the document; the scroll lock can come off. */
  onUnlock: () => void;
};

export default function VinylStage({ onRecordPlayed, onUnlock }: VinylStageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const t = vinylTimeline(reduceMotion);

  const [phase, setPhase] = useState<"out" | "centred" | "spinning">("out");
  const [unlocked, setUnlocked] = useState(false);
  const [docked, setDocked] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [painted, setPainted] = useState(false);
  const [Disc, setDisc] = useState<null | (typeof import("./DiscScene"))["default"]>(null);
  const [webgl] = useState(detectWebGL);

  // True only once the canvas is both mounted and able to draw something. The
  // chunk has to arrive, and then two webfaces have to resolve before the
  // sleeve exists at all.
  const webglReady = !!Disc && webgl && !contextLost;

  const controls = useRef<HTMLDivElement>(null);
  /** Held in a ref so the needle drop, two seconds later, reads the live intent:
   *  `playing` in that effect's closure would be whatever it happened to be then. */
  const wantsPlay = useRef(true);

  const dropNeedle = useCallback(() => {
    setPhase("spinning");
    playSfx("needle");
    if (wantsPlay.current) {
      setCrackle(true);
      startSong();
    }
  }, []);

  useEffect(() => {
    // The beats are only worth having once there is something to watch them on.
    // Started at mount they ran against an empty canvas: by the time the sleeve
    // was drawn the record had already slid out, dropped the needle and come up
    // to speed, so it appeared to have skipped the motion entirely. The
    // `webglReady` disjunct is load-bearing — where the canvas will never
    // arrive, the CSS disc is the only thing on screen and must not wait for it.
    if (webglReady && !painted) return;
    const timers = [
      setTimeout(() => setPhase("centred"), ms(t.centred)),
      setTimeout(dropNeedle, ms(t.needleDrop)),
      setTimeout(() => {
        setUnlocked(true);
        onUnlock();
      }, ms(t.unlockAt)),
    ];
    return () => timers.forEach(clearTimeout);
  }, [t, dropNeedle, onUnlock, webglReady, painted]);

  // The record is on screen. Until this fires the canvas is an empty buffer, so
  // the rig draws nothing and the CSS disc holds the frame.
  const onPaint = useCallback(() => setPainted(true), []);

  // Keep the poster in the page; only its companion player floats while the
  // controls leave the viewport. Scrolling back restores them when fully visible.
  useEffect(() => {
    if (!unlocked || !controls.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setDocked(entry.boundingClientRect.top < 0 && entry.intersectionRatio < 1);
    }, { threshold: [0, 1] });
    observer.observe(controls.current);
    let done = false;
    const onScroll = () => {
      if (done || window.scrollY <= 2) return;
      done = true;
      onRecordPlayed();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [unlocked, onRecordPlayed]);

  useEffect(() => {
    let live = true;
    if (!webgl) return;
    import("./DiscScene")
      .then((mod) => {
        if (live) setDisc(() => mod.default);
      })
      // No WebGL, or the chunk never arrived — offline, or a CDN hiccup on a
      // metered connection. The CSS disc stands in and the audio is identical, so
      // the only thing lost is the depth.
      .catch(() => {
        if (live) setContextLost(true);
      });
    return () => {
      live = false;
    };
  }, [webgl]);

  const toggle = () => {
    primeAudio();
    wantsPlay.current = !wantsPlay.current;
    setPlaying(wantsPlay.current);
    setSongPlaying(wantsPlay.current);
    setCrackle(wantsPlay.current);
  };

  return (
    <section className="vinyl-stage" aria-label="Birthday record" data-docked={docked || undefined}>
      <div className="vinyl-rig-layer">
        <div className="vinyl-rig">
          {webglReady && (
            <Disc
              phase={phase}
              playing={playing && !docked}
              docked={false}
              reduced={reduceMotion}
              spinSeconds={t.spinUpDone - t.needleDrop}
              onFail={() => setContextLost(true)}
              onPaint={onPaint}
            />
          )}
          {/* Stays put until the canvas has something to show. It is already
              absolutely positioned over the rig, so holding it costs no layout
              and closes the gap where the swap used to flash bare canvas. */}
          {(!webglReady || !painted) && (
            <CssDisc playing={playing && phase === "spinning" && !docked} />
          )}
        </div>
        <p className="vinyl-caption">
          <span className="vinyl-caption__track">{trackTitle}</span>
          <span className="vinyl-caption__for">made with love</span>
        </p>
        <div className="vinyl-controls" ref={controls}>
        </div>
      </div>

      {unlocked && (
        <p className="scroll-cue" data-testid="scroll-cue">
          <span>Scroll</span>
          <ChevronDown aria-hidden="true" />
        </p>
      )}

      {docked && (
        <aside className="vinyl-mini" aria-label="Music player">
          <div className="vinyl-mini__disc"><CssDisc playing={playing} /></div>
          <p className="vinyl-mini__copy">
            <span className="vinyl-mini__track">{trackTitle}</span>
            <span>{playing ? "Playing" : "Paused"}</span>
          </p>
          <button
            type="button"
            className="vinyl-toggle"
            data-testid="play-pause"
            onClick={toggle}
            aria-label={playing ? "Pause the record" : "Play the record"}
            aria-pressed={playing}
          >
            {playing ? <Pause size={18} strokeWidth={2.5} /> : <Play size={18} strokeWidth={2.5} />}
          </button>
        </aside>
      )}
    </section>
  );
}
