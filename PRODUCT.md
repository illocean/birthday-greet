# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + Vite 7 + TypeScript. Motion for animation, Tailwind v4 for utilities, `three` +
`@react-three/fiber` + `@react-three/drei` for the record, `@tsparticles` for petals,
`canvas-confetti` for confetti, `howler` for audio. Magic UI's text components are vendored
into `src/components/magicui/` rather than shadcn-installed. Editable content lives in
`src/content.ts`.

The 3D record requires a bundler, so a single-file HTML deliverable is ruled out. Audio is
`howler` with `html5: false`, which means a decoded buffer rather than a streaming element.

Hard constraint: every dependency must be free and MIT, ISC, Apache-2.0 or BSD, or fonts
under SIL OFL. No backend, no accounts, no network calls at runtime, no analytics.

## Users

One recipient: a friend, alone, on their phone, on their birthday. They open a link someone
sent them. They are not a professional, not on a work surface, and not evaluating a tool. The
sender is the person who assembled the page; their job is to make it theirs by editing one
file and overwriting a handful of assets.

## Product Purpose

A single-page, scroll-driven birthday site in five scenes.

1. **Envelope.** A linen-textured mauve envelope with a hinged pink flap and a pulse to tap
   or swipe up. One gesture unlocks audio and runs flap → paper lift → settle; the open
   envelope can close along the same timeline in reverse.
2. **Greeting card.** "Hi [name]!" and "Happy Birthday!" on watercolor paper, revealed by
   Magic UI text animation with sparkles on "Birthday!". Confetti, petals, a pop. It lifts and
   fades after about three seconds.
3. **Vinyl poster.** A real 3D record slides out of its sleeve, the tonearm swings, the song
   fades in. Scroll is locked until this finishes; the full poster remains at the page top.
   A compact floating record, track title and play/pause accompany the reader farther down,
   and scrolling back restores the full player.
4. **Gallery.** A lace-doily heart, letter tiles spelling the name, and six polaroids that
   parallax and tilt as they pass.
5. **Letter.** A trifold on worn paper unfolds in a sticky stage, and the ink arrives word by
   word as the reader scrolls.

Success for the recipient is finishing the letter and feeling noticed. Success for the sender
is editing `src/content.ts` and overwriting the asset files, without touching code.

## Positioning

The card is the gift itself, not a link to a gift. Nothing to sign up for, no checkout, no
external destination, no account. Every meaningful thing — the words, the photos, the music —
happens on the page.

One deliberate interaction opens the whole thing. There is no next button or carousel arrow;
the controls are record play/pause, envelope close, a persistent sound mute toggle,
and gallery progress stops that jump to each memory or the letter.

## Operating Context

Mobile-first, 360–430px, holding at desktop from 1280 up. `100dvh` rather than `100vh`,
because a mobile browser's chrome makes `100vh` taller than the visible screen. Sound is
opt-in and fires only from the envelope tap; audio never autoplays before that gesture.
Gallery clips play silently while visible, with no player controls or pointer interaction,
and remain still under reduced motion. Every asset is a named file
the sender overwrites in place, so formats are fixed and paths are stable and relative. The
link may be opened on a metered connection.

## Capabilities and Constraints

- Five scenes, in order, with decorative flower reactions around the reading area.
- Exactly one required action: a tap, click, or swipe-up on the envelope. It also unlocks audio.
- Record play/pause, envelope close, a persisted mute toggle and gallery progress stops are the additional controls.
- Scroll is locked from load until the vinyl sequence completes, then unlocked.
- Occasion is a friend's birthday. No parental or family wording.
- Palette is pinned: `--cream #FFFAF7`, `--blush-200 #F9D3DE`, `--rose-400 #EC93AE`,
  `--rose-600 #B8607D`, `--ink #5A3A46`, `--letter-ink #3B2F2A`, `--gold #E8C39E`.
- `--rose-600` is for large script and accent only. `--gold` is confetti only, and there is no
  gold anywhere in scene three.
- The page has a fixed pastel-pink radial gradient with peonies and baby's breath only,
  placed around the edges. Pointer Events drive gentle parallax, nearby flower lean and
  tap petals for both mouse and touch; reduced motion leaves the decoration still.
- Photo captions use the local handwritten The Girl Next Door face and preserve authored case.
- `src/content.ts` is the single edit point for all copy.
- Six polaroids default; each is about 70vh tall.
- The reference screenshots are reference only. Their assets are not reused and none of their
  material is traced. Nothing shipped here derives from them.
- README.md carries a swap-in list covering every placeholder.

## Brand Commitments

Pastel, handmade, soft. The world is scrapbook and paper-craft: a fabric envelope, cut lace,
letter tiles, taped polaroids, a handwritten letter on paper that has been folded and
foxed. Warm, domestic, personal.

Richness is the priority over flatness. A plain rectangle standing in for an object is a
defect, not a simplification — real CC0 surface textures, layered depth, contact shadows,
lighting and particles.

## Evidence on Hand

The brief and four reference screenshots, which define composition, palette, and the
scene structure. They are not assets to ship.

No real photographs, no real audio track, and no real letter text exist. Every photo, the
music, the eight sound effects and the letter body are authored placeholders, labelled as
such in code and in the README. No sender name, date, or relationship history is fabricated —
`senderName` is an obvious placeholder.

## Product Principles

- The artifact leads; the interface recedes. No chrome outside the paper-craft world.
- One gesture to open. Everything after that is reading and scrolling.
- Motion is physical: paper, weight, spring, and a spinning record. Nothing linear or floaty.
- Every placeholder is a named file with a documented swap path.
- Five scenes means five. Restraint is the feature.

## Accessibility & Inclusion

The whole sequence is keyboard-operable, including the envelope (a real `<button>` with
Enter and Space), close, mute and play/pause controls. `prefers-reduced-motion: reduce` collapses
animations to about 200–300ms and drops continuous motion — the letter's 3D fold becomes a snap,
the record stops spinning, and confetti is disabled — while keeping scroll-linked letter
travel so its ending remains reachable. Fonts are local and loaded before the first
paint, including Quicksand 400, 600 and 700.

Contrast is measured against each token rather than assumed from the palette; the measured
table lives in DESIGN.md, including the one pair that fails.
