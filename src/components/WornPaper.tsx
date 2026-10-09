import type { ReactNode } from "react";

// The paper the letter is written on, as stacked layers on one box.
//
// Bottom to top:
//
//   1. `.worn__base`   the paper itself, and its deckled edge. Those are one
//                      element on purpose: a displacement filter has nothing to
//                      displace unless something is painted on it, and giving
//                      the edge its own layer only moves the straight edge
//                      somewhere else in the stack.
//   2. `.worn__aging`  a multiply vignette — handled paper is darker at the
//                      edges where thumbs and sleeves have been.
//   3. the creases     the two horizontal lines a trifold folds on, plus the
//                      faint vertical one from being carried in a pocket.
//   4. `.worn__foxing` the speckles.
//   5. `.worn__ink`    the writing, in `multiply` with a hair of shadow, so the
//                      ink sits *in* the fibre instead of on top of it.
//   6. the tilt        −1°, so the letter lies on the page rather than being laid
//                      out on it. It is on this box and not on the letter's own
//                      wrapper because the fold flaps are children of it:
//                      rotated separately they would shear against the sheet by
//                      about six pixels at the corners.
//
// The photograph is real — Paper005 from ambientCG, CC0, colour-mapped by
// `npm run textures` — for the same reason as the envelope's linen: procedural
// fibre reads as noise, photographed fibre reads as paper.
//
// `overlay` sits above the ink and inside the sheet's own transform, so it is
// the slot scene five hands its fold flaps to: the flaps need the sheet's −1°
// tilt and its perspective, and a sibling of it would have neither. They do not
// travel *behind* the sheet on the way open — see the fold comment in
// `TrifoldLetter.tsx` for what actually happens to them.
export default function WornPaper({
  children,
  overlay,
}: {
  children?: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <div className="worn__sheet">
      {/* Kept in the DOM rather than in a data URI so the filter is a readable
          object, and zero-sized and absolutely positioned so it costs no layout
          (`position: absolute` with no box also means it can never influence the
          sheet's size, which a `display: none` swap would not have guaranteed). */}
      <svg className="worn__defs" aria-hidden="true" focusable="false">
        {/* The region is asymmetric on purpose, and it has to be. `.worn__base`
            chains `drop-shadow(0 18px 28px …)` after this displacement filter,
            and a filter's region crops its *own* output — at `height="110%"`
            the region reached only 37.6px below an 752px-tall sheet, which
            decapitated the shadow's tail (its mass falls off for roughly three
            blur radii, ~102px down). 5% above is enough for the 10px of upward
            shadow the same filter produces; 25% below covers the rest with room
            to spare. */}
        <filter id="letter-deckle" x="-5%" y="-5%" width="110%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.021 0.058" numOctaves="3" seed="9" result="n" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="9"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <div className="worn__base" />
      <div className="worn__aging" />
      <div className="worn__crease worn__crease--a" />
      <div className="worn__crease worn__crease--b" />
      <div className="worn__crease worn__crease--v" />
      <div className="worn__foxing" />
      <div className="worn__ink">{children}</div>
      {overlay}
    </div>
  );
}