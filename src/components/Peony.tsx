import { useId } from "react";

// The peony: the build's principal flower (baby's breath in the scene-two sprigs
// is the only other botanical, and it is filler), drawn as paths rather than
// placed shapes so the petal edges stay crisp at any size and needs no image asset.
//
// Purely decorative: it sits in the corner of the letter's stage, so it is
// hidden from assistive technology rather than described. The letter's own text
// is the content of this scene and the reader reaches it by reading, not by
// announcing an ornament.
//
// Three rings of petals around a tight centre — the layered read is what
// separates a peony from a daisy at 48px, which is the size it is actually seen
// at on a phone. The viewBox is 130x210 on purpose: the ink's bottom padding
// (the reserve band) and `verify`'s word-vs-peony collision check are both
// measured against that 1.615 aspect, and changing it changes both.
//
// No gold anywhere in the bloom: `--gold` is reserved for confetti across the
// whole build, and a shared warm accent turns into a shared meaning.
const PETAL_INK = "#B8607D";

/** One petal ring: `n` ellipses at `dist` from the centre, offset so rings interleave. */
function ring(n: number, dist: number, rx: number, ry: number, offset: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((i * 360) / n + offset) * (Math.PI / 180);
    return {
      key: `${n}-${i}`,
      cx: 65 + Math.sin(a) * dist,
      cy: 72 - Math.cos(a) * dist,
      rotate: (i * 360) / n + offset,
      rx,
      ry,
    };
  });
}

export default function Peony({
  className = "peony",
  tone = "cream",
}: {
  className?: string;
  tone?: "pink" | "blush" | "cream";
}) {
  const id = useId();
  const colors = {
    cream: ["#FFFDFC", "#FDF0F2", "#F7CBD9"],
    blush: ["#FFE6EC", "#F4BFCE", "#DE9CB3"],
    pink: ["#FCD0DF", "#EDAAC2", "#D587A3"],
  }[tone];

  return (
    <svg className={className} viewBox="0 0 130 210" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-petal`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="0.55" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#AFC7A6" />
          <stop offset="1" stopColor="#88A97F" />
        </linearGradient>
      </defs>

      {/* Leaf, behind the stem, so the stem reads as coming out from under it. */}
      <path
        className="peony__leaf"
        d="M68 184C48 180 29 167 21 147C43 147 62 158 70 178Z"
        fill={`url(#${id}-leaf)`}
      />

      <path
        className="peony__stem"
        d="M65 210C63 186 63 160 70 142"
        fill="none"
        stroke="#93AE88"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Three rings of petals, outer to inner. Each ring is offset half a step
          from the one outside it so no two rings line up into spokes — a peony
          is layered, not radially symmetric. */}
      <g className="peony__petals" fill={`url(#${id}-petal)`}>
        {ring(8, 40, 22, 30, 0).map((p) => (
          <ellipse
            key={p.key}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            transform={`rotate(${p.rotate} ${p.cx} ${p.cy})`}
            stroke={PETAL_INK}
            strokeOpacity="0.12"
            strokeWidth="1"
          />
        ))}
        {ring(6, 24, 15, 20, 30).map((p) => (
          <ellipse
            key={p.key}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            transform={`rotate(${p.rotate} ${p.cx} ${p.cy})`}
            stroke={PETAL_INK}
            strokeOpacity="0.14"
            strokeWidth="1"
          />
        ))}
        {ring(5, 11, 9, 12, 15).map((p) => (
          <ellipse
            key={p.key}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            transform={`rotate(${p.rotate} ${p.cx} ${p.cy})`}
            stroke={PETAL_INK}
            strokeOpacity="0.18"
            strokeWidth="1"
          />
        ))}
      </g>

      {/* The tight centre the inner petals fold over. Deeper blush, not a gold
          stamen — see the note at the top. */}
      <circle className="peony__heart" cx="65" cy="72" r="6.5" fill="#EC93AE" fillOpacity="0.55" />
    </svg>
  );
}
