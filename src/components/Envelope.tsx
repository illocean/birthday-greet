import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { playSfx, preloadAudio, primeAudio, stopSfx } from "../audio";
import { ENVELOPE_TIMELINE } from "../cardTimeline";

export type EnvelopePhase = "closed" | "opening" | "open" | "closing";
const STOPS = [...ENVELOPE_TIMELINE.stops];
const EASE = [0.22, 1, 0.36, 1] as const;

export default function Envelope({ onOpen, onClose, children }: {
  onOpen: () => void;
  onClose: () => void;
  children: (phase: EnvelopePhase) => ReactNode;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<EnvelopePhase>("closed");
  const phaseRef = useRef<EnvelopePhase>("closed");
  const wrap = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ body: 250, paper: 340 });
  const progress = useMotionValue(0);
  const running = useRef<ReturnType<typeof animate> | null>(null);
  const dragFrom = useRef<number | null>(null);
  const run = useRef(0);
  const closedScale = Math.min(0.9, size.body * 0.9 / size.paper);
  const lift = -(size.body * 0.95 + 12);
  const settled = size.paper / 2 - size.body * 0.45;
  const rotateX = useTransform(progress, STOPS, [0, -180, -180, -180]);
  const flapZ = useTransform(progress, (p) => p < 0.16 ? 4 : 0);
  const letterZ = useTransform(progress, (p) => p < 0.68 ? 2 : 5);
  const letterY = useTransform(progress, STOPS, [0, 0, lift, settled]);
  const letterScale = useTransform(progress, STOPS, [closedScale, closedScale, closedScale, 1]);
  const bodyY = useTransform(progress, STOPS, [0, 0, 0, size.body * 0.6]);
  const bodyOpacity = useTransform(progress, STOPS, [1, 1, 1, 0]);

  useEffect(() => {
    const stopAnimation = () => { run.current++; running.current?.stop(); };
    const measure = () => {
      if (wrap.current && paper.current) setSize({ body: wrap.current.clientHeight, paper: paper.current.offsetHeight });
    };
    const observer = new ResizeObserver(measure);
    if (wrap.current) observer.observe(wrap.current);
    if (paper.current) observer.observe(paper.current);
    measure();
    return () => { observer.disconnect(); stopAnimation(); };
  }, []);

  const change = useCallback(async (opening: boolean) => {
    if (phaseRef.current !== (opening ? "closed" : "open")) return;
    const next = opening ? "opening" : "closing";
    phaseRef.current = next;
    setPhase(next);
    const currentRun = ++run.current;
    const audioReady = primeAudio();
    stopSfx();
    await Promise.all([audioReady, preloadAudio(["flap", "slide", "pop"])]);
    if (currentRun !== run.current) return;
    // One progress value drives geometry, layer swaps and sound cues in both directions.
    let previous = progress.get();
    playSfx(opening ? "flap" : "slide");
    running.current = animate(progress, opening ? STOPS : [...STOPS].reverse(), {
      duration: reduceMotion ? ENVELOPE_TIMELINE.reducedDuration : ENVELOPE_TIMELINE.duration,
      times: opening ? STOPS : STOPS.map((_, i) => 1 - STOPS[STOPS.length - 1 - i]),
      ease: EASE,
      onUpdate: (p) => {
        if (opening && previous < 0.32 && p >= 0.32) playSfx("slide");
        if (!opening && previous > 0.68 && p <= 0.68) playSfx("slide");
        if (!opening && previous > 0.32 && p <= 0.32) playSfx("flap");
        previous = p;
      },
      onComplete: () => {
        if (currentRun !== run.current) return;
        if (opening) playSfx("pop");
        phaseRef.current = opening ? "open" : "closed";
        setPhase(phaseRef.current);
        if (opening) onOpen(); else onClose();
      },
    });
  }, [onOpen, onClose, progress, reduceMotion]);

  return (
    <div className="envelope-stage" data-envelope-state={phase}>
      <div className="envelope-stack">
        <motion.span className="envelope-shadow" style={{ opacity: bodyOpacity }} aria-hidden="true" />
        <div ref={wrap} className="envelope-wrap">
          <motion.div className="envelope__back linen" style={{ y: bodyY, opacity: bodyOpacity }} aria-hidden="true" />
          <motion.div ref={paper} className="envelope__letter" style={{ y: letterY, scale: letterScale, zIndex: letterZ }}>
            {children(phase)}
          </motion.div>
          <motion.button type="button" className="envelope linen vignette" data-testid="envelope"
            style={{ y: bodyY, opacity: bodyOpacity }} disabled={phase !== "closed"}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              dragFrom.current = event.clientY;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from !== null && from - event.clientY > 60) void change(true);
            }}
            onPointerCancel={() => { dragFrom.current = null; }}
            onClick={() => void change(true)} aria-label="Open the envelope" aria-describedby="envelope-hint">
            <span className="envelope__fold envelope__fold--left" aria-hidden="true" />
            <span className="envelope__fold envelope__fold--right" aria-hidden="true" />
            <span className="envelope__fold envelope__fold--bottom" aria-hidden="true" />
          </motion.button>
          <motion.div className="envelope__flap" style={{ rotateX, y: bodyY, opacity: bodyOpacity, zIndex: flapZ }} aria-hidden="true">
            <span className="envelope__flap-face linen" />
            <span className="envelope__flap-lining" />
          </motion.div>
        </div>
      </div>
      <p id="envelope-hint" className={`envelope-hint${phase === "closed" ? " hint" : " opacity-0"}`} aria-hidden={phase !== "closed"}>Tap or swipe up to open</p>
    </div>
  );
}
