import { useMemo, type ComponentProps } from "react";
import Particles from "@tsparticles/react";
// v4 registers the bundle renderer as an import side effect. There is no `init`
// prop on the component any more -- that was v3, and passing it here is silently
// an unknown prop rather than a type error, which is exactly the kind of thing
// that leaves a blank canvas with no error anywhere.
import "@tsparticles/slim";
import { useReducedMotion } from "motion/react";

/**
 * Drifting petals, foreground. Starts here in scene two; whichever scene mounts it
 * next keeps drifting — petals through the whole back half of the card is the
 * cheapest thing that ties the scenes together.
 *
 * The particle budget is the interesting number, and it is 25 on every screen. A
 * phone is already running a WebGL canvas in scene three and six lazily-loaded WebP
 * photos in scene four, and tsparticles is a `<canvas>` with per-particle
 * transforms. Past ~25 they visibly clump on the top row instead of falling, and on
 * a mid-range Android the whole page drops frames — which the reader feels as the
 * card itself stuttering. `density` is a dial for a caller that knows its own
 * scene, never a route around that ceiling.
 */
// `@tsparticles/react` re-exports neither `ISourceOptions` nor `IOptions`, and
// the type actually lives in `@tsparticles/engine` — a transitive dep it does not
// re-export and does not declare in its own public surface. Reading the type off
// the prop we pass it is one line and cannot drift when tsparticles moves the
// type somewhere new.
type Options = NonNullable<ComponentProps<typeof Particles>["options"]>;

export default function Petals({ density = 1 }: { density?: number }) {
  const reduceMotion = useReducedMotion() ?? false;

  const options = useMemo<Options>(
    () => ({
      fullScreen: { enable: false },
      fpsLimit: 60,
      detectRetina: true,
      particles: {
        number: {
          // The brief's mobile ceiling, which happens to be the desktop ceiling
          // too: same canvas, same budget. See the note above.
          value: Math.round(25 * density),
        },
        color: { value: ["#F9D3DE", "#F4B3C6", "#EC93AE", "#FFFAF7"] },
        shape: { type: "circle" },
        opacity: {
          value: { min: 0.25, max: 0.7 },
        },
        size: {
          value: { min: 3, max: 8 },
          animation: { enable: true, speed: 0.6, startValue: "max", destroyOnFinish: false },
        },
        move: {
          enable: true,
          // Down and slightly across, which is what makes them read as petals
          // rather than as falling dots.
          direction: "bottom-right",
          speed: { min: 0.5, max: 1.6 },
          straight: false,
          drift: { min: -0.4, max: 0.4 },
          outModes: { default: "out" },
        },
        // The sway is what separates a petal from a snowflake.
        wobble: { distance: 22, enable: true, speed: { min: -4, max: 4 } },
      },
      interactivity: {
        events: { onHover: { enable: false }, onClick: { enable: false } },
      },
      // Reduced motion is not tsparticles' `motion.reduce` setting: the component
      // does not mount at all in that case (see the branch at the bottom), so any
      // option reading `reduceMotion` here would be unreachable code that reads as
      // though it were doing something. Blurring the tab is the one thing this
      // library can do for us and it is worth having.
      pauseOnBlur: true,
    }),
    [density],
  );

  // Reduced motion still gets petals, but as a painted layer rather than a
  // simulation — `.petals--static` is two radial-gradient tiles, no rAF loop, no
  // per-particle transforms. A bare card with no depth in it reads as broken
  // rather than calm, and the calm is the point of the branch.
  if (reduceMotion) {
    return <span className="petals petals--static" aria-hidden="true" />;
  }

  return <Particles id="petals" className="petals" options={options} />;
}