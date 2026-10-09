import { useReducedMotion } from "motion/react";
import { useEffect, useRef, type RefObject } from "react";
import Peony from "./Peony";

/**
 * The room the card is read in.
 *
 * The existing painted layers and flowers stay at the edges, leaving the
 * envelope and the reading column clear. Only transforms and opacity animate.
 */
export default function WatercolorScene() {
  const scene = useRef<HTMLDivElement>(null);
  useDrift(scene);

  return (
    <div ref={scene} className="watercolor" aria-hidden="true">
      <div className="watercolor__wash" />
      <div className="watercolor__pool" data-depth="0.25">
        <PetalWash />
      </div>
      <div className="watercolor__florals">
        {(["pink", "cream", "blush", "pink"] as const).map((tone, index) => (
          <div
            key={index}
            className={`watercolor__flower watercolor__flower--${index + 1}`}
            data-depth="0.4"
          >
            <Peony className="watercolor__peony" tone={tone} />
          </div>
        ))}
        {[false, true].map((flip, index) => (
          <div
            key={index}
            className={`watercolor__flower watercolor__flower--sprig-${index + 1}`}
            data-depth="0.3"
          >
            <Sprig className="watercolor__sprig" flip={flip} />
          </div>
        ))}
      </div>

      {/* The grain goes last and does not move at all: it is the paper the whole
          scene is painted on, so parallaxing it would sell the layers as separate
          cards of paper rather than as one wash. */}
      <span className="watercolor__grain" />
      <span className="watercolor__vignette" />
    </div>
  );
}

/**
 * Six petals bled into the wash. Authored as blurred blobs rather than drawn
 * flowers on purpose — at 18% opacity a real petal outline reads as a smudge and
 * a soft one reads as pigment that has already soaked in.
 */
function PetalWash() {
  return (
    <svg className="watercolor__petals" viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id="wc-bleed" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <radialGradient id="wc-petal">
          <stop offset="0%" stopColor="var(--color-rose-300)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-rose-300)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g filter="url(#wc-bleed)">
        {[
          [42, 96, 66],
          [318, 152, 54],
          [128, 268, 44],
          [286, 356, 60],
          [58, 468, 50],
          [212, 588, 58],
          [352, 656, 46],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="url(#wc-petal)" />
        ))}
      </g>
    </svg>
  );
}

/**
 * A sprig of baby's breath (Gypsophila), drawn once and mirrored. Thin forked
 * stems carrying a scatter of tiny white blossoms — the filler flower, airy and
 * small enough to read as a pressed sprig at the size it is actually seen (a
 * corner, behind the card) without being the subject.
 */
function Sprig({ className, flip }: { className: string; flip: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 160 260"
      preserveAspectRatio="xMinYMax meet"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      {/* Stem: one quadratic, drawn twice at different widths so it thickens
          toward the base the way a pressed stem does. */}
      <path
        d="M18 258 C 34 190, 26 118, 58 44"
        fill="none"
        stroke="#98AA8C"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M18 258 C 34 190, 26 118, 58 44"
        fill="none"
        stroke="#98AA8C"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.32"
      />
      {/* Leaves. */}
      {[
        [30, 200, -34],
        [30, 152, 30],
        [38, 108, -26],
        [48, 74, 24],
      ].map(([cx, cy, r]) => (
        <ellipse
          key={`leaf-${cy}`}
          cx={cx}
          cy={cy}
          rx="15"
          ry="6"
          fill="#A5B599"
          opacity="0.34"
          transform={`rotate(${r} ${cx} ${cy})`}
        />
      ))}
      {/* Forks: the fine branchlets the blossoms hang from. */}
      {[
        "M30 196 C 44 184, 58 176, 74 170",
        "M31 150 C 48 142, 64 136, 84 132",
        "M36 106 C 50 100, 58 98, 72 96",
        "M46 72 C 54 66, 62 62, 74 58",
        "M40 128 C 34 118, 32 112, 34 104",
      ].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="#98AA8C"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.3"
        />
      ))}
      {/* Blossoms: baby's breath — a scatter of tiny five-petal whites, each
          with a whisper of blush at the heart instead of a gold centre. */}
      {[
        [58, 44],
        [46, 96],
        [80, 118],
        [62, 168],
        [74, 58],
        [72, 96],
        [84, 132],
        [74, 170],
        [34, 104],
      ].map(([cx, cy]) => (
        <g key={`bloom-${cx}-${cy}`} opacity="0.72">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx={cx}
              cy={cy - 3.4}
              rx="2.4"
              ry="4.4"
              fill="var(--color-blush-50)"
              transform={`rotate(${a} ${cx} ${cy})`}
            />
          ))}
          <circle cx={cx} cy={cy} r="1.3" fill="var(--color-rose-300)" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Mouse, pen and touch use the same Pointer Events. A swipe scrolls normally;
 * only a short tap creates petals. Reduced motion leaves a still painted layer.
 */
function useDrift(scene: RefObject<HTMLDivElement | null>) {
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const host = scene.current;
    if (reduceMotion || !host) return;

    let raf = 0;
    let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let drift = { x: 0, y: 0 };
    let pressed: { x: number; y: number; id: number; at: number } | null = null;
    const layers = Array.from(host.querySelectorAll<HTMLElement>("[data-depth]"));
    const rotations = layers.map(() => 0);
    let centers: { x: number; y: number }[] = [];
    const measure = () => {
      centers = layers.map((layer) => {
        layer.style.transform = "";
        const rect = layer.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.34 };
      });
    };
    measure();

    const read = (e: PointerEvent) => {
      if (e.isPrimary) pointer = { x: e.clientX, y: e.clientY };
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      read(e);
      pressed = { x: e.clientX, y: e.clientY, id: e.pointerId, at: performance.now() };
    };
    const up = (e: PointerEvent) => {
      if (!pressed || pressed.id !== e.pointerId) return;
      const tap = Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 12
        && performance.now() - pressed.at < 600;
      pressed = null;
      if (tap) {
        // ponytail: 12 decorative petals maximum; raise only after measuring mobile frame time.
        while (host.querySelectorAll(".watercolor__drifting-petal").length > 8) {
          host.querySelector(".watercolor__drifting-petal")?.remove();
        }
        for (let i = 0; i < 4; i++) {
          const petal = document.createElement("span");
          petal.className = "watercolor__drifting-petal";
          petal.style.left = `${e.clientX}px`;
          petal.style.top = `${e.clientY}px`;
          petal.style.backgroundColor = ["#F4B3C6", "#F9D3DE", "#FFFAF7", "#EC93AE"][i];
          host.append(petal);
          const across = (i - 1.5) * 36;
          const animation = petal.animate([
            { transform: "translate3d(0,0,0) rotate(0deg) scale(.5)", opacity: 0 },
            { transform: `translate3d(${across * 0.45}px,-24px,0) rotate(${i * 40}deg) scale(1)`, opacity: 0.8, offset: 0.2 },
            { transform: `translate3d(${across}px,140px,0) rotate(${180 + i * 70}deg) scale(.7)`, opacity: 0 },
          ], { duration: 2200 + i * 180, easing: "cubic-bezier(.2,.6,.3,1)" });
          animation.finished.then(() => petal.remove()).catch(() => petal.remove());
        }
      }
      if (e.pointerType === "touch") reset();
    };
    const reset = () => {
      pressed = null;
      pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    };
    const leave = (e: PointerEvent) => {
      if (!e.relatedTarget) reset();
    };

    const t0 = performance.now();
    const tick = (t: number) => {
      drift.x += (((pointer.x / window.innerWidth) * 2 - 1) * 18 - drift.x) * 0.05;
      drift.y += (((pointer.y / window.innerHeight) * 2 - 1) * 14 - drift.y) * 0.05;
      layers.forEach((layer, index) => {
        const depth = Number(layer.dataset.depth);
        const center = centers[index];
        const near = Math.max(0, 1 - Math.hypot(pointer.x - center.x, pointer.y - center.y) / 190);
        const idle = Math.sin((t - t0) / 3200 + index * 1.7) * 2;
        const lean = near * Math.max(-7, Math.min(7, (pointer.x - center.x) / 14));
        const rotate = layer.classList.contains("watercolor__flower") ? idle + lean : 0;
        rotations[index] += (rotate - rotations[index]) * 0.05;
        layer.style.transform = `translate3d(${drift.x * depth}px,${drift.y * depth}px,0) rotate(${rotations[index]}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", read, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", reset, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("blur", reset);
    window.addEventListener("resize", measure, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", read);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", measure);
      layers.forEach((layer) => { layer.style.transform = ""; });
      host.querySelectorAll(".watercolor__drifting-petal").forEach((petal) => {
        petal.getAnimations().forEach((animation) => animation.cancel());
        petal.remove();
      });
    };
  }, [scene, reduceMotion]);
}
