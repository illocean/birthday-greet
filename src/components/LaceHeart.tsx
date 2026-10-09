// The lace doily. Drawn as paths rather than placed circles, so the scalloped
// edge stays crisp at any size and needs no image asset. Decorative: the
// greeting inside it is real text, and the element beside it is the label.
//
// The two outlines are exported because scene three prints the same doily on the
// record sleeve. It is the same motif in both places on purpose — one shape,
// authored once, rather than a second heart that happens to look like it.

/** The heart's outline, in a 200x180 box with its lobes centred near (100, 95). */
export const LACE_OUTER =
  "M100 168C40 124 12 96 12 66C12 40 32 22 56 22C74 22 90 32 100 48C110 32 126 22 144 22C168 22 188 40 188 66C188 96 160 124 100 168Z";

/** The hole in the middle, which is what the greeting is written on. */
export const LACE_HOLE =
  "M100 130C72 107 57 93 57 77C57 63 67 54 79 54C86 54 93 58 100 66C107 58 114 54 121 54C133 54 143 63 143 77C143 93 128 107 100 130Z";

export default function LaceHeart({ children }: { children?: React.ReactNode }) {
  return (
    <div className="doily">
      <svg
        className="doily__lace"
        viewBox="0 0 200 180"
        aria-hidden="true"
        focusable="false"
      >
        <path className="doily__stock" d={LACE_OUTER} />
        {/* Scalloped border: round caps on a zero-length dash. */}
        <path className="doily__edge" d={LACE_OUTER} strokeDasharray="0 9" strokeLinecap="round" strokeWidth="4" />
        {/* Second lace run inside it — the visible depth of a real doily. */}
        <path
          className="doily__edge"
          d={LACE_OUTER}
          strokeDasharray="3 4.5"
          strokeWidth="1.2"
          transform="translate(100 92) scale(0.86) translate(-100 -92)"
        />
        {/* The hole in the middle, which is what the greeting is written on. */}
        <path className="doily__hole" d={LACE_HOLE} />
      </svg>

      {children ? <p className="doily__inscription">{children}</p> : null}
    </div>
  );
}