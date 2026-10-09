// ─────────────────────────────────────────────────────────────────────────────
//  EDIT ME. This file is the only place card content lives.
//
//  Everything below is authored placeholder — replace it with your own before
//  sending. Nothing else in src/ needs to change. The README lists every item.
// ─────────────────────────────────────────────────────────────────────────────

/** The friend this birthday card is for. Their name is the point. */
export const friendName = "Alex";

/** Who the letter is from. Printed as the signature on the last sheet. */
export const senderName = "Your Name";

/** Printed on the record sleeve in scene three. */
export const trackTitle = "For You, With Love";

/** Scene four: one letter per tile, each tile spells this out. */
export const tileText = friendName;

/**
 * Scene five, the letter. One array entry per authored line, read in order as
 * the paper unfolds. Line one is the date and the last is the sign-off: the
 * trifold reveal treats them as just more lines, so write them that way.
 * `"\u00A0"` is an authored blank line — `.letter__line` has no margins, so
 * paragraphs are separated by these and by nothing else.
 *
 * ── THE BUDGET ──────────────────────────────────────────────────────────────
 * The sheet is ONE screen at both 390×844 and 1280×800 and it does not grow:
 * `.letter__paper` is `min(94vw, 52rem)` by `min(94dvh, 860px)`, and `npm run
 * verify` asserts the sheet sits inside the viewport.
 *
 * The letter is therefore *longer* than the sheet, and `.worn__ink` is a
 * viewport over it rather than a box that must contain it: the ink travels
 * through the letter as the reader scrolls, so everything authored here is
 * reachable and nothing is clipped away for good. The travel is measured from
 * the rendered box (`TrifoldLetter.tsx`) and the section grows to match it, so
 * a long letter costs scroll rather than legibility.
 *
 * The constraint that remains is *rate*, not fit: the reveal window is fixed at
 * 35–90% of the section, so the letter is read at roughly one page-scroll per
 * line of writing. Authored lines still round up to whole wrapped lines —
 * `.letter__line` is a block — so count words and read the rendered result
 * rather than trusting a character count.
 */
export const letterText = [
  // PLACEHOLDER letter — replace every line with your own words. Blank lines
  // are authored as "\u00A0" (nbsp), because `.letter__line` has no margin: the
  // paragraph break is the line itself.
  "[Date]",
  "\u00A0",
  "[Their name]",
  "[A line about who they are, or leave this blank]",
  "\u00A0",
  "Dearest, You:",
  "\u00A0",
  "Happy birthday! I hope this reaches you on a day that already feels like yours, and that you let yourself be celebrated for once instead of shrugging it off.",
  "\u00A0",
  "This is placeholder text, and it is here for two reasons: to show you how the sheet reads at full length, and to prove the ink travels all the way to the closing line no matter how much you write. Replace it with your own words — the paper does not grow, the ink simply moves through it, so a longer letter costs you scroll and nothing else.",
  "\u00A0",
  "Write the things you would say across a table at two in the morning, when the conversation was getting good and neither of you wanted to be the one to sleep first. Write the small observations nobody else would think to keep: the way they listen, the jokes that only work because of the two of you, the ordinary afternoon that turned into a story you both still tell.",
  "\u00A0",
  "Write about the year behind them, too, if you want. The trips that almost did not happen, the plans that survived anyway, the long walks and the longer calls and the messages answered at hours nobody should be awake for. A letter is allowed to be a scrapbook; that is rather the point of sending one instead of a chat message.",
  "\u00A0",
  "And write about the year ahead. Whatever they are hoping for — the quiet goals and the embarrassing loud ones — say that you are on their side for it. Birthdays are the one day a year when someone gets told, in plain words, that they are loved and missed and rootable for. Make the most of the licence.",
  "\u00A0",
  "If you are still reading this placeholder, you have proven the mechanism works: the words arrive one at a time, the fold stays visible through the whole unfold, and the last line lands exactly where it should. Now delete all of this and make it theirs — a template nobody edited is a worse gift than a short letter somebody did.",
  "\u00A0",
  "Once again, happy birthday. I hope this year is as kind to you as you are to everyone around you.",
  "\u00A0",
  "Devotedly yours,",
  "\u00A0",
  "[Your name]",
  "[How you are related, if you like]",
];

/**
 * PLACEHOLDER photos, shown as polaroids in scene four. Overwrite the files at
 * these paths — keep the names, and no code changes are needed. The alt text
 * below is placeholder too: describe your real photos before sending this.
 *
 * A `src` ending in `.mp4`/`.webm`/`.mov` is rendered as a muted looping clip in
 * the same polaroid slot; anything else is a still.
 *
 * The `src` is a relative path, not absolute: Vite rewrites its own asset URLs
 * for `base`, but files in public/ are copied verbatim, so a leading "/" would
 * resolve against the origin root and 404 on any sub-path deploy. Keep it
 * relative or the site only works when it sits at the very top of a domain.
 */

export const photos = [
  {
    src: "photos/photo-1.mp4",
    /** PLACEHOLDER — describe the real photo. */
    alt: "Placeholder photo, one of six",
    /** PLACEHOLDER — printed under the polaroid. */
    caption: "Your caption here",
  },
  {
    src: "photos/photo-2.mp4",
    /** PLACEHOLDER — describe the real photo. */
    alt: "Placeholder photo, two of six",
    /** PLACEHOLDER — printed under the polaroid. */
    caption: "Your caption here",
  },
  {
    src: "photos/photo-3.webp",
    /** PLACEHOLDER — describe the real photo. */
    alt: "Placeholder photo, three of six",
    /** PLACEHOLDER — printed under the polaroid. */
    caption: "Your caption here",
  },
  {
    src: "photos/photo-4.mp4",
    /** PLACEHOLDER — describe the real photo. */
    alt: "Placeholder photo, four of six",
    /** PLACEHOLDER — printed under the polaroid. */
    caption: "Your caption here",
  },
  {
    src: "photos/photo-5.webp",
    /** PLACEHOLDER — describe the real photo. */
    alt: "Placeholder photo, five of six",
    /** PLACEHOLDER — printed under the polaroid. */
    caption: "Your caption here",
  },
  {
    src: "photos/photo-6.mp4",
    /** PLACEHOLDER — describe the real photo. */
    alt: "Placeholder photo, six of six",
    /** PLACEHOLDER — printed under the polaroid. */
    caption: "Your caption here",
  },
];

/**
 * The music. Overwrite public/audio/song.mp3 to swap the track. It loops, so
 * pick something that seams well; `scripts/make-placeholder-audio.mjs`
 * regenerates the original placeholder if you ever need it back.
 *
 * Same relative-path rule as the photos above — this one is read by Howler at
 * runtime, so Vite never rewrites it for you.
 */
export const song = { src: "audio/song.mp3" };
