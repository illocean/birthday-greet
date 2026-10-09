---
name: A Little Something
description: Watercolour and paper on pastel pink - a hinged linen envelope, peonies and baby's breath, taped polaroids, a handwritten letter and a 3D record with compact floating controls.
colors:
  cream: "#FFFAF7"
  blush-50: "#FFF6F8"
  blush-100: "#FDE8EE"
  blush-200: "#F9D3DE"
  rose-300: "#F4B3C6"
  rose-400: "#EC93AE"
  rose-600: "#B8607D"
  ink: "#5A3A46"
  letter-ink: "#3B2F2A"
  gold: "#E8C39E"
typography:
  script:
    fontFamily: '"Great Vibes", "Snell Roundhand", cursive'
    usage: "scene headings, greeting, doily inscription"
  letter:
    fontFamily: '"The Girl Next Door", "Segoe Print", cursive'
    fontSize: "clamp(18px, 4.6vw, 26px)"
    lineHeight: 1.7
    usage: "the letter and photo captions in their authored case"
  ui:
    fontFamily: '"Quicksand", ui-rounded, system-ui, sans-serif'
    usage: "hints, controls, record labels, letter tiles at weight 700"
---

# Design System: A Little Something

## Overview

Everything on screen is a physical layer rather than a gradient pretending to be an object: a
seam in the linen, a score line in the paper, a shadow between two sheets, a strip of washi
tape, a cut lace edge.

The richness brief is taken literally. A flat rectangle standing in for an envelope is a
defect, so the envelope carries a real CC0 woven-linen texture, the letter is seven stacked
layers of aged paper, and the record is a real 3D object under real lights.

The direction is deliberately narrow. One gesture opens everything; there is no next button
and no carousel arrow anywhere on the page.

## Colors

Defined once in `src/index.css` under `@theme`. There is no Tailwind config file and adding
one back is a regression.

| Token | Value | Role |
| --- | --- | --- |
| `--cream` | `#FFFAF7` | paper and light component surfaces |
| `--blush-50` | `#FFF6F8` | the watercolor wash under the greeting |
| `--blush-100` | `#FDE8EE` | panel fills, the envelope lining |
| `--blush-200` | `#F9D3DE` | envelope lining and pale pink surfaces |
| `--rose-300` | `#F4B3C6` | lace, polaroid frames, soft edges |
| `--rose-400` | `#EC93AE` | the spot ink - tiles, tape, borders |
| `--rose-600` | `#B8607D` | large script and accent only |
| `--ink` | `#5A3A46` | every piece of UI text |
| `--letter-ink` | `#3B2F2A` | the letter's handwriting |
| `--gold` | `#E8C39E` | confetti only |

The fixed page background uses a pink radial gradient (`#F8CBDC` → `#F0B8CE` →
`#E6A4C0`), with a `#EDB4CC` body fallback. The envelope body is dusty mauve
(`#C39EB2`); cream remains the paper color rather than the page ground.

### Measured contrast

Computed with the WCAG 2.1 relative-luminance formula, not estimated.

| Foreground | on cream | on blush-200 | on rose-300 | on rose-400 | on gold |
| --- | --- | --- | --- | --- | --- |
| `--ink` | **9.52:1** | **7.24:1** | **5.69:1** | 4.39:1 | 5.98:1 |
| `--letter-ink` | **12.47:1** | **9.47:1** | **7.45:1** | **5.75:1** | 7.83:1 |
| `--rose-600` | 4.05:1 | 3.08:1 | 2.42:1 | 1.87:1 | 2.54:1 |

### Named rules

- **`--ink` must not carry normal-size text on `rose-400`.** 4.39:1 is just under the 4.5:1
  that AA requires. Use `rose-400` for borders, tape and fills, or switch to `rose-300` or
  `letter-ink` for anything a reader has to read. This is the one pair in the palette that
  fails, and it fails by a hundredth.
- **`--rose-600` is for large text only.** 4.05:1 passes the 3:1 large-text threshold and
  fails 4.5:1, which is exactly what the brief asks for: script and accent, never body copy.
- **`--gold` is never an indicator.** It measures **1.21:1** on `blush-200` — it is invisible
  as a signal by construction, so state is always carried by shape, glyph, or position.
  There is no gold anywhere in scene three.
- **No gradients on text, ever.** If copy is hard to read, the fix is a larger size, not a
  scrim.

## Typography

Three faces, all self-hosted as `latin` subsets via `@fontsource`.

- **Great Vibes** — script, for scene headings and the greeting only. Never for a sentence.
- **The Girl Next Door** — the letter and photo captions. The letter is `clamp(18px, 4.6vw, 26px)` at 1.7
  leading in `--letter-ink`, blended `multiply` over the paper so the texture reads through
  the ink the way it does on a real page. Captions are weight 400 with no uppercase transform.
- **Quicksand** — hints, controls, record labels and the letter tiles at weight 700. Rounded terminals
  keep it in the same handmade register as the paper.

All local faces load before the first paint, including Quicksand 400, 600 and 700;
synthetic weights are disabled. Canvas text also waits on `document.fonts.load`, because
drawing a fallback face into a texture leaves the record label permanently wrong.

## Layout

- `100dvh` throughout, never `100vh`. On a phone the two differ by the collapsing URL bar,
  and this build is measured in viewport heights.
- `overflow: clip` rather than `hidden` wherever a sticky stage needs clipping. `clip`
  creates no scroll container, so `position: sticky` keeps working; `hidden` breaks it.
- The full record poster stays in normal page flow at the top. While it is above the viewport,
  a roughly 238×66px bottom-right player shows an animated disc, title and 44px play/pause
  control. Scrolling back restores the poster with the same playback state.
- A thin rose progress line connects gallery memories to the letter: centered on desktop,
  along the left gutter on phones. Its 44px stops support pointer, touch and keyboard navigation.
  Muted clips behave like moving photographs, with no player controls or pointer interaction.
- Verification targets 390×844 and 1280×800: no horizontal overflow, full poster and controls
  fit, and the sheet stays inside the viewport while the letter travels through it.

## Depth

Two shadows, warm-tinted with the ink rather than neutral grey — a grey shadow on blush reads
as dirt. Depth is otherwise expressed as **a visible gap between layers**, which is what
actually sells paper: an offset edge and a hairline, not blur alone.

Worn paper is seven stacked layers: a CC0 paper texture, radial edge aging, fold lines, a
deckled edge from `feTurbulence` plus `feDisplacementMap`, foxing speckles, and ink at
`mix-blend-mode: multiply`, with the whole sheet rotated about a degree off-square.

`isolation: isolate` must never go on that sheet. It flattens the `preserve-3d` context the
fold flaps need.

## Components

**The envelope (`.envelope`).** A real `<button>` with Enter and Space support. The pink flap
hinges at the body's top edge with `rotateX` and no gap. One progress value runs flap open →
paper lift → settle and reverses on close. `closed | opening | open | closing` ignores input
during transitions; sound cues share progress crossings. Only the front folds clip, while the
opaque textured paper owns its full height and swaps above the front when it clears the body.

**The record (`DiscScene`).** A 4:3 canvas at `FOV 40`, with a thin-box
sleeve carrying a `CanvasTexture` front, a record that slides out of it and centres, and a
tonearm that swings to the groove. Pausing does **not** freeze the spin dead: audio stops
immediately and the disc coasts to rest over about 1.6 seconds, which is what a real turntable
under a lifted stylus does.

It falls back to a CSS rotating disc when WebGL is absent, driving the same audio. The full
poster stays at the top; its compact companion shares playback state while the reader scrolls.
Offscreen and reduced-motion WebGL rendering stops once its pose settles.

**The background (`WatercolorScene`).** A fixed pink wash with peonies and baby's breath
around the edges, leaving the center clear. Shared Pointer Events drive mouse and touch
parallax, nearby lean and drifting tap petals. Only transforms and opacity animate; reduced
motion leaves the flowers still. A mute toggle persists its setting locally.

**The lace heart (`LaceHeart`).** Cut lace as authored SVG. No `background-image` on the
`<svg>` root: a CSS background on an SVG root paints the element's *border box*, so it fills
in the gaps between the lace paths as a rectangle.

**The polaroids (`Polaroid`).** Two nested elements, because two different things animate. The
outer one carries continuous scroll-linked parallax and velocity tilt; the inner one carries
the discrete `whileInView` spring reveal. `data-testid="polaroid"` sits on the inner element
because its own `opacity` is what animates.

**The letter (`TrifoldLetter`).** A sticky stage inside a 250dvh section plus measured text
overflow — 130dvh plus overflow under
`prefers-reduced-motion`, where the fold and every word opacity are pinned to 1 and the rest of
the travel would show nothing changing. The trifold's outer panels hinge at their shared edges,
which is why they are driven with opposite `rotateX` signs, and they fold to ±90 rather than
±180. The endpoint is 90 because `backface-visibility: hidden` culls a panel once its face
normal's z component (the matrix's `m22`) goes negative: past 90 the flap is deleted rather than
parked behind the sheet. Measured, driving to ±180 culled the flap at p = 0.175 and left it
invisible for 82.5% of the section. `verify.mjs` walks `m22` across the unfold window to keep
that from coming back. Travel measures `.worn__flow.scrollHeight` against the ink viewport's
content height after subtracting vertical padding. Measuring the translated parent's scroll
height would change the remaining travel and strand the final lines.

## Do's and Don'ts

**Do:**

- Make every layer a physical object with a visible edge.
- Reach for paper language — score lines, tape, foxing, deckles — before interface language.
- Keep gold in the confetti and nowhere else.
- Measure contrast and geometry, never assume them.

**Don't:**

- Add a scene, a toggle, or a control the brief didn't ask for. Five is the shape.
- Add independent playback state for the compact player; its controls share the poster's state.
- Use colour, gold included, to signal state.
- Hide overflow to make a fit problem disappear. `.worn__ink` is a deliberate clipping
  viewport whose flow scrolls through it, and `npm run verify` asserts the scroll carries the
  whole letter to its end — an assertion that exists because 483px of overflow once sailed past
  a presence check.
- Introduce `background-blend-mode`. Every surface here is a real texture file.
