# Implementation Plan: Five-Scene Cinematic Birthday Site

Pipeline: `orch-build-mvp` · engine `orch-pipeline` · size tier: **large**
(spec doc, 9 new external deps, cross-cutting rewrite). Phases 0→1→2 done, **GATE 1 pending**.

This records the original five-scene build plan. The envelope/letter refinement brief
supersedes its former cream background, icon-sized dock, caption casing and control limits;
the affected slices below reflect the current targeted fixes.

---

## Phase 0 — Intake (done)

**Scope.** One static, mobile-first, scroll-driven SPA: five scenes, one required user
action (open the envelope), with optional close, play/pause and persisted mute controls. Static site,
no backend, no runtime network calls.

**Locked decisions from the spec** (non-negotiable, not up for redesign):
colour tokens, the five-scene order, one-gesture interaction model, scroll-lock
boundaries, 100dvh, `src/content.ts` as the single content edit point, static deploy
on a free subdomain, and the all-free + permissive-license constraint.

### Conflicts found (resolved in favour of the new brief)

| Existing doc says | New spec says | Resolution |
| --- | --- | --- |
| "Exactly four steps, in order" | Five scenes, scroll-driven | Spec wins → four-step machine deleted |
| "The record is the only music control" / "A separate MUSIC toggle must not exist" | lucide-react play/pause beside the docked record | Spec wins → the toggle returns |
| Palette `blush #f9d3de` / `gold #b98c2e` | 11-token palette incl. `--gold #E8C39E` (confetti only) | Spec wins |
| Letter in Quicksand | Letter in The Girl Next Door | Spec wins |

Both docs are rewritten in Slice 6 so the repo stops asserting a design that no longer exists.

---

## Phase 1 — Research & reuse (done)

### 1a. Dependency license audit — every candidate verified against the npm registry

The brief makes this a hard gate: *"Every npm dependency must be MIT, ISC, Apache-2.0,
or BSD… if a package does not qualify, do not use it and tell me."*

| Package | Version | SPDX | Verdict |
| --- | --- | --- | --- |
| motion | 14.0.0 | MIT | add |
| canvas-confetti | 1.9.4 | ISC | add |
| lucide-react | 1.52.0 | ISC | add |
| @tsparticles/react | 4.4.0 | MIT | add |
| @tsparticles/slim | 4.4.0 | MIT | add |
| tailwindcss | 4.3.3 | MIT | add |
| @tailwindcss/vite | 4.3.3 | MIT | add |
| @fontsource/the-girl-next-door | 5.3.0 | **OFL-1.1** | add (brief allows OFL for fonts) |
| @playwright/test | 1.63.0 | Apache-2.0 | add (dev) |
| howler | 2.2.4 | MIT | keep |
| three | 0.180.0 | MIT | keep |
| @react-three/fiber | 9.8.1 | MIT | keep |
| @react-three/drei | 10.7.9 | MIT | keep (**now actually used** — was dead weight) |

### 1b. Copy-paste components — **React Bits is disqualified**

| Repo | SPDX | Verdict |
| --- | --- | --- |
| magicuidesign/magicui | MIT | **approved** — Blur Fade, Text Animate, Sparkles Text, Text Reveal |
| DavidHDev/react-bits | **NOASSERTION** = "MIT + Commons Clause" | **rejected** |

React Bits' actual licence text adds a Commons Clause restriction ("do not sell,
sublicense, or redistribute the components themselves"). That is a source-available
restriction, not OSI-approved, so it fails both the brief's npm-licence list and its
"only if its license allows free personal use" condition. **Not used.** Magic UI covers
all four required text effects, so nothing is lost.

Magic UI is a shadcn-registry *source* distribution, not an npm package (404 on the
registry). The brief names the registry command; that command requires `components.json`
and a `tsconfig` path-alias rewrite it does not have. Plan: install `clsx` +
`tailwind-merge` (both MIT) and vendor the four MIT component sources from the Magic UI
repo into `src/components/magicui/`, credited in README. Fall back to the registry CLI
only if a component turns out to need Radix.

### 1c. Version compatibility (checked against installed `node_modules`, not memory)

- `drei@10.7.9` peers `fiber ^9.0.0`, `react ^19`, `three >=0.159` → installed 9.8.1 / 19.3.0 / 0.180.0 ✓
- `fiber@9.8.1` peers `react >=19 <19.4` → installed **19.3.0** ✓ (one minor upgrade away from breaking)
- R3F v10 has since shipped, but drei 10 pins fiber 9. Brief says "latest stable; R3F 9
  requires React 19" → **stay on 9/10**. Upgrading both is a separate change, not this build.

### 1d. API facts that change the implementation (Context7, `motion/dev` + Tailwind + pmndrs docs)

- `motion` v14 import path is **`motion/react`**, not `framer-motion`.
- Tailwind v4 needs **no `tailwind.config.js`** — `@theme { --color-blush-50: … }` in CSS
  is the whole theme, and `--color-*` namespacing is what makes a token into a utility.
- drei `<Environment>` with **`<Lightformer>` children** renders procedurally with **zero
  network fetch**; `preset`/`files` would fetch an HDR from a CDN and break the no-network
  rule. `frames={1}` because the light rig is static.
- `CanvasTexture` needs `colorSpace = THREE.SRGBColorSpace` and **manual `dispose()`** —
  R3F auto-disposes geometry it created but never a texture assigned via `map`.
- `<Canvas className>` lands on the wrapper `<div>`, so `pointer-events-none` works as written.
- `useScroll({ target, offset })` offsets: `"start end"` = target top meets viewport bottom.
- motion springs: `{ type:"spring", visualDuration, bounce }` is the current idiom; do not
  mix `duration`/`visualDuration` with `stiffness`/`damping`.

### 1e. Visual references — read directly, not inferred

The brief said "you cannot see images", so the four screenshots in `References/` were
opened and read:

- `1-step.png` — lavender **crosshatch** envelope, two lower diagonal folds, upper V flap
  with rounded tip, visible weave texture. Confirms the brief's weave + vignette direction.
- `2-step.png` — card slid diagonally out of the envelope, white calla lilies bottom-left,
  blossom clusters, text `Hi Ma!` / `Happy` / `Mother's Day!`. Copy is a **Mother's Day**
  card → occasion must be a friend's birthday (both old `PRODUCT.md` and this brief agree).
- `3-step.png` — lace doily heart centre reading the greeting, blossom tree + grass bg,
  two small polaroids bottom-right, a separate letter card bottom-left.
- `4-step.png` — the letter in a **handwritten script** ("Querida Mama:", "Con todo mi Amor")
  with letter-bead spelling the phrase. This is exactly why the brief mandates
  *The Girl Next Door* for letter text.

Layout and material language are taken from these; **no asset is copied or traced**
(brief forbids it, and they carry a third-party watermark).

### 1f. Reuse audit of the existing tree

| Keep | Why |
| --- | --- |
| `scripts/make-placeholder-audio.mjs` | Node-stdlib float-sample synth → WAV → ffmpeg MP3. Extended to render all 8 SFX; no new dep, no download. |
| `useMusic.ts` audio behavior | Kept loop intent and failed-load recovery in `src/audio.ts`. Current Howler registers native gesture unlock when the first Howl is created, so files preload and the envelope gesture resumes its context before the timeline starts. |
| `vite.config.ts` `base: "./"` | Relative build works from any static host/sub-path. |
| `content.ts` shape | Extended, not replaced. |

| Delete | Why |
| --- | --- |
| `src/steps.ts` + `steps.test.ts` | Pinned the four-step invariant the brief removes. |
| `src/components/Step*.tsx` (5) | Replaced by scene components. |
| `src/useMusic.ts` | Becomes `src/audio.ts` (8 sounds + music + tab-hidden suspend). |
| `src/styles.css` | Becomes Tailwind v4 `@theme`. |
| `dist/` | Stale build of the old design. |

---

## Phase 2 — Slices (thin vertical, each independently verifiable)

Each slice: `tdd-guide` drives red→green→refactor, then `code-reviewer`.
No security trigger is touched (no auth, no DB, no secrets, no runtime network, no
user-supplied file paths), so `security-reviewer` is **not** engaged per the pipeline rule.

### Slice 1 — Foundation + Scene 1 (envelope) ← first vertical slice
End-to-end path: arrive → see envelope → gesture → audio unlocked → flap opens → sfx.
- deps: install the 9 audited packages; `@tailwindcss/vite` into `vite.config.ts`
- `src/index.css`: `@import "tailwindcss"` + `@theme` with the 11 tokens; fonts imported
  in `main.tsx` (`the-girl-next-door`, `great-vibes`, `quicksand`), loaded before first paint
  with Quicksand 400/600/700
- `src/content.ts`: extend to `friendName, senderName, trackTitle, tileText, letterText,
  photos[], song{}` + PLACEHOLDER markers
- `src/audio.ts`: Howler manager, `html5:false`, preload plus gesture unlock, persisted mute,
  tab-hidden suspend, restartable effects without overlap and silent failure on missing file
- `src/sceneMachine.ts`: pure scene state + scroll-lock (replaces `steps.ts`), unit-tested
- `Envelope.tsx`: mauve linen texture, contact shadow, pulsing hint,
  tap **and** pointer-drag-up >60px, `<button>` so Enter/Space works,
  hinged pink flap and opaque paper driven by one reversible progress timeline,
  `closed | opening | open | closing`, matching sound cues and ignored busy input
- **Verify:** `tsc --noEmit` + `npm run build` clean; unit tests on the state machine.

### Slice 2 — Scene 2 (greeting card) — *loads `ui-taste`*
- `WatercolorScene.tsx`: fixed pastel-pink radial wash; only peonies and baby's breath at
  the edges, Pointer Events for idle sway, nearby lean, parallax and tap petals; still when reduced
- `GreetingCard.tsx`: the opaque textured paper inside the envelope; greeting starts after
  the shared flap → lift → settle sequence and pauses when the envelope closes
- Magic UI Blur Fade / Text Animate on `Hi [FRIEND_NAME]!`, Sparkles Text on `Birthday!`
- `canvas-confetti` burst once the card is up; slide then pop sfx; 3s hold then lift+fade
- `Petals.tsx`: `@tsparticles` slim, circle particles, ≤25 particles on mobile
- **Verify:** card reaches full opacity; confetti fires once; scroll still locked.

### Slice 3 — Scene 3 (vinyl poster) — *the 3D spine*
- `VinylStage.tsx`: dynamically imported persistent `<Canvas>` in the normal-flow top poster,
  `dpr={[1,2]}`, `Environment frames={1}` + pink-key `Lightformer`s (no HDR)
- `Sleeve.tsx`: thin box, `CanvasTexture` — blush gradient, lace-doily heart motif,
  `trackTitle` + "for [FRIEND_NAME]" in Great Vibes; awaited via `document.fonts.load`
- `Record.tsx`: `CylinderGeometry(128)`, groove `CanvasTexture`, physical material
  (roughness .35, metalness .5, clearcoat 1), label cylinder, spindle, `ContactShadows`
- `Tonearm.tsx`: pivot group, 1s swing, needle sfx then crackle loop @0.12
- spin-up 0→1.2 rad/s over 1.5s; song fades in over 1.2s; `trackTitle` caption beneath
- after 3s spinning → **unlock scroll** + chevron "Scroll" cue
- poster above viewport → roughly 238×66px floating bottom-right disc, track and play/pause;
  scroll back restores the full player with shared playback state. Offscreen WebGL rests.
- WebGL-absent fallback → CSS rotating disc driving the same audio
- **Verify:** canvas has a non-zero-size WebGL context; scroll lock flips exactly at unlock.

### Slice 4 — Scene 4 (gallery)
- `LaceHeart.tsx` + `LetterTile.tsx`: authored SVG, tile row `[TILE_TEXT]` tilted ~12°
- `Polaroid.tsx`: textured white frame, thick bottom border, seeded rotation −9…+9°,
  layered shadows, washi-tape SVG w/ torn ends, paper sheen
- per-polaroid `useTransform` parallax (≈70vh each) + spring reveal (opacity/scale/rotate/y)
  + `useVelocity` tilt clamped ±3°; snap sfx throttled to 400ms
- desktop alternates L/R of centre; mobile staggers 6–12% with no clipping
- captions use local The Girl Next Door at 400 with authored case and no uppercase transform
- silent clips have no native controls or pointer interaction; progress stops link memories to the letter
- **Verify:** all polaroids reveal on scroll to bottom; reduced-motion disables parallax.

### Slice 5 — Scene 5 (the letter)
- `WornPaper.tsx`: the 7 stacked layers — paper texture base, multiply aging gradient,
  crease gradient pairs + faint vertical, `feTurbulence`+`feDisplacementMap` deckled edge
  w/ drop-shadow, foxing speckles, ink in `multiply` w/ `0 0 1px` shadow, −1° rotation
- `TrifoldLetter.tsx`: 250dvh plus measured text overflow, sticky 100dvh stage, three panels
  on fold lines; travel uses flow.scrollHeight minus the ink viewport's content height,
  never its transformed parent's scrollHeight
- phase map on scroll progress: 0–35% unfold (crease lines persist) · 35–90% ordered word
  reveal 0.15→1 · 100% confetti + chime
- `Peony.tsx`: authored SVG overlapping lower-right, clear of the text
- **Verify:** full letter text present and readable at page end.

### Slice 6 — Assets, verification, docs, deploy
- generate 6 photos (`photo-1..6.webp` ≤1400px WebP q80), procedurally-authored
  textures ≤2048px, all 8 SFX + song via the extended stdlib/ffmpeg script
- `scripts/verify.mjs` → `npm run verify`: Playwright at 390×844 and 1280×800, asserts
  no console/page errors, scroll-lock transitions, non-zero WebGL canvas,
  `document.fonts.check('1em "The Girl Next Door"')`, bottom-of-page reveals all polaroids
  and full letter text; writes `/screenshots` per scene
- `scripts/license-check.mjs` → `npm run licenses`: walks the lockfile, **fails** on any
  license outside MIT/ISC/Apache-2.0/BSD/OFL; output lands in README
- rewrite `README.md` (editing `content.ts`, swapping photos/song/SFX, credits, full
  swap-in list, Cloudflare Pages/Netlify free-subdomain deploy) and correct
  `PRODUCT.md` / `DESIGN.md`
- `npx playwright install chromium` (~150 MB, not present in this machine's cache)
- **Verify:** the four brief "DONE" criteria pass end to end.

---

## Testing strategy
- **Unit** — `sceneMachine` (scene order + scroll-lock boundaries), `audio` volume table,
  `polaroid` seeded rotation + velocity clamp. Vitest, already wired.
- **Integration / E2E** — `npm run verify` Playwright run (Slice 6) covering exactly the
  assertions the brief lists, at both required viewports.
- **Build gate** — `tsc --noEmit` and `npm run build` must stay at zero errors every slice.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Autoplay blocks programmatic playback | Preload audio, use Howler's native first-gesture unlock, and resume its context in the envelope gesture. Timeline cues wait for decoded effects. Safari still needs a real-device check. |
| `@fontsource` canvas text draws in a fallback face | `document.fonts.load` awaited before any canvas text; asserted in `verify`. |
| drei `Environment preset` silently fetches a CDN HDR | Only `Lightformer` children, `frames={1}`; `frames={Infinity}` never. Verified in 1d. |
| CanvasTexture leaks / washes out | `SRGBColorSpace` + manual `dispose()` in 1d; R3F does not dispose `map` textures. |
| motion v14 spring API mismatch | `visualDuration`+`bounce` idiom only, per 1d. |
| Scene 3 has the most moving parts and the least tolerance | Isolated as its own slice with an explicit WebGL-absent fallback path. |
| `fiber@9` caps `react <19.4`; installed 19.3.0 | Verified. Pin `react` to `~19.3.0` so a transitive bump cannot break the pair. |
| Asset downloads may be blocked | Every asset has an authored procedural fallback (SVG/canvas/script) and is listed as a swap-in item — brief requires this anyway. |

## Success criteria
- [ ] `tsc --noEmit` and `npm run build` pass with zero errors
- [ ] License check lists every dependency and fails outside MIT/ISC/Apache-2.0/BSD/OFL; list in README
- [ ] `npm run verify` passes at 390×844 and 1280×800 with all six assertions + `/screenshots`
- [ ] README covers content editing, asset swaps, credits/licences, placeholder list, free-host deploy
- [ ] No flat coloured rectangle stands in for an object; every prop is texture/SVG/3D
