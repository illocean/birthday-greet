// DONE criterion 3 — `npm run verify`
//
// Builds the site, serves the real production bundle, and drives it in Chromium at
// the two required viewports. Asserts exactly the six things the brief lists, then
// writes one screenshot per scene to /screenshots for a human to look at.
//
// The brief says "you cannot view images, so verify with scripts". This is that
// script: it is the only automated evidence the build actually works.
//
//   node scripts/verify.mjs                  # both viewports
//   node scripts/verify.mjs --viewport=mobile
//   node scripts/verify.mjs --headed         # watch it run
//   node scripts/verify.mjs --keep-server    # leave the preview server up

import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = resolve(ROOT, "screenshots");
const PORT = 4319;
const BASE = `http://localhost:${PORT}`;
const LETTER_FONT = '"The Girl Next Door"';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--viewport="))?.split("=")[1];
const headed = args.includes("--headed");

// The contract this script asserts against. Kept in one block so it is obvious
// what the app must expose; a missing hook fails loudly here rather than silently
// passing a check that never ran.
const SEL = {
  envelope: "[data-testid=envelope]",
  scene: "[data-scene]",
  card: "[data-testid=greeting-card]",
  // There is deliberately no `cardGreeting` selector, though the card is opaque
  // well before it has anything written on it (the sheet arrives at ~0.5s, the
  // last line at ~2s). No single element represents "the greeting is visible" —
  // the obvious one is a static wrapper that cannot fail. See `greetingProbe`.
  canvas: "canvas",
  polaroid: "[data-testid=polaroid]",
  letter: "[data-testid=letter]",
  // The letter's own sub-parts. `letter-last-word` is the single word the
  // timeline ends on, so it is the one element that proves the reveal *ran to
  // completion* rather than merely being present in the DOM.
  letterLastWord: "[data-testid=letter-last-word]",
  letterFlow: ".worn__flow",
  letterWord: ".letter__word",
  letterPeony: ".peony",
  // The two trifold panels. Nothing else in this file ever looks at them, which
  // is how a fold that painted for 17.5% of the section survived six slices
  // with every other letter check green.
  letterFlapTop: ".letter__flap--top",
  letterFlapBottom: ".letter__flap--bottom",
  scrollCue: "[data-testid=scroll-cue]",
};

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
].filter((v) => !only || v.name === only);

// ── tiny assertion harness ──────────────────────────────────────────────────
let failures = 0;
let checks = 0;
const results = [];

function check(label, ok, detail = "") {
  checks++;
  if (ok) results.push(`  PASS  ${label}`);
  else { failures++; results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── build + serve the production bundle ──────────────────────────────────────
// Windows: `npm` is a `.cmd` shim, and since Node 18.20/20.12/22 a `.cmd` may only
// be spawned with `shell: true` — without it Node fails with ENOENT (unresolved)
// or EINVAL (blocked, per the CVE-2024-27980 fix). So the platform flag and the
// shell flag travel together. This is safe rather than merely convenient: every
// argument below is a hardcoded literal, and the only interpolation is `PORT`,
// which is a number from this file — nothing user-supplied reaches a shell.
const ON_WIN = process.platform === "win32";
const NPM = ON_WIN ? "npm.cmd" : "npm";
const SHELL = { shell: ON_WIN };

function build() {
  // Typecheck first, and explicitly. The brief's DONE criterion names
  // `tsc --noEmit`, but this repo's root tsconfig is a *solution* file
  // (`files: []` + `references`), so a bare `tsc --noEmit` type-checks zero files
  // and exits 0 on any amount of nonsense. `tsc -b --noEmit --force` is the form
  // that actually walks the referenced projects; it was verified to exit 2 on a
  // deliberate type error where the bare form exits 0.
  console.log("· typechecking…");
  execFileSync(NPM, ["run", "typecheck"], { cwd: ROOT, stdio: "inherit", ...SHELL });
  console.log("· building production bundle…");
  execFileSync(NPM, ["run", "build"], { cwd: ROOT, stdio: "inherit", ...SHELL });
}

async function serve() {
  console.log(`· starting preview server on :${PORT}…`);
  const proc = spawn(NPM, ["run", "preview", "--", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], ...SHELL,
  });
  // Vite prints the URL on stdout; poll instead, so the banner format can change.
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return proc;
    } catch { /* not up yet */ }
  }
  proc.kill();
  throw new Error("preview server never came up");
}

// ── helpers ──────────────────────────────────────────────────────────────────
/** Try to scroll, then report where the page actually ended up. */
async function scrollAttempt(page, y) {
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), y);
  await sleep(350);
  return page.evaluate(() => window.scrollY);
}

/**
 * Try to scroll the way a reader does — a wheel over the document — then report
 * where the page actually ended up.
 *
 * Not `window.scrollTo`, and that difference is the whole point. `overflow:
 * hidden` makes the scrollport inert to input but leaves it programmatically
 * scrollable: measured on this build, `scrollTo(800)` lands on 800 while the
 * document is locked solid, while the same wheel and a PageDown both stay at 0.
 * Every lock assertion in this file ran through `scrollTo`, so they were only
 * green because the document happened to be exactly one viewport tall and the
 * target clamped to 0. Scene four changed that — the gallery gives the document
 * five screens of height — and the position check fell over, which is how the
 * hole became visible.
 *
 * Proven non-vacuous by measuring it in both states: 0 while `overflow` is
 * `hidden`, 800 the moment the lock releases. Coordinate (200, 400) is inside
 * both required viewports and away from the fixed play/pause pill.
 */
async function wheelAttempt(page, dy = 800) {
  await page.mouse.move(200, 400);
  await page.mouse.wheel(0, dy);
  await sleep(350);
  return page.evaluate(() => window.scrollY);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}

/** Probe for a WebGL context on any canvas and measure it. */
const webglProbe = () => {
  const canvases = [...document.querySelectorAll("canvas")];
  for (const c of canvases) {
    if (!c.width || !c.height) continue;
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (gl) {
      const r = c.getBoundingClientRect();
      return { found: true, width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height };
    }
  }
  return { found: false, count: canvases.length };
};

/**
 * The greeting's own reveal state, per word.
 *
 * The obvious selector for this is `.greeting-card__sparkles`, and it is useless:
 * that div is a static wrapper at `opacity: 1` with no animation attached to it, so
 * reading its opacity can never fail — which is precisely how this check managed to
 * pass against a card whose greeting had never animated at all. The opacity that
 * actually moves is on the per-word segments `TextAnimate` splits each line into,
 * and those segments are also what the `delay` prop drives: hand the library
 * milliseconds where it reads seconds and every one of them sticks at 0 while the
 * scene still renders its stage, still flips `data-scene`, and still passes the
 * card-opacity check.
 *
 * `.sr-only` is excluded because `TextAnimate` keeps a permanent screen-reader copy
 * of each line there, present whether or not the animation ever ran. `total` is part
 * of the assertion rather than a diagnostic: a query matching nothing would
 * otherwise satisfy "no segment is stuck" and pass silently, which is the same
 * vacuity one level up.
 */
async function watchSceneHistory(page) {
  await page.evaluate((cardSel) => {
    const history = window.__sceneHistory = {
      card: null, cardLock: null, greeting: { total: 0, stuck: [] }, greetingComplete: false,
      vinylSeen: false, vinylLock: null, vinylReleased: false, frames: 0,
    };
    const start = performance.now();
    const sample = () => {
      const scene = document.querySelector("main")?.dataset.scene;
      const doc = document.documentElement;
      const locked = getComputedStyle(doc).overflowY === "hidden";
      const card = document.querySelector(cardSel);
      history.frames++;
      if (scene === "card" && card) {
        const opacity = Number(getComputedStyle(card).opacity);
        if (opacity >= 0.9) history.card = { present: true, opacity };
        if (locked && scrollY === 0 && doc.scrollHeight === doc.clientHeight) {
          history.cardLock = { scene, scrollY, scroll: doc.scrollHeight, view: doc.clientHeight };
        }
        if (!history.greetingComplete) {
          const segments = [...card.querySelectorAll("span, strong")].filter((el) =>
            !el.closest(".sr-only") && !el.querySelector("span, strong") && (el.textContent ?? "").trim(),
          );
          const stuck = segments.filter((el) => {
            let effectiveOpacity = 1;
            for (let parent = el; parent && parent !== card.parentElement; parent = parent.parentElement) {
              const style = getComputedStyle(parent);
              effectiveOpacity *= Number(style.opacity);
              if (style.display === "none" || style.visibility === "hidden") effectiveOpacity = 0;
            }
            return effectiveOpacity < 0.9;
          }).map((el) => el.textContent.trim().slice(0, 24));
          history.greeting = { total: segments.length, stuck };
          history.greetingComplete = segments.length >= 4 && stuck.length === 0;
        }
      }
      if (scene === "vinyl") {
        history.vinylSeen = true;
        if (locked && scrollY === 0) {
          history.vinylLock = { scene, scrollY, scroll: doc.scrollHeight, view: doc.clientHeight, overflow: getComputedStyle(doc).overflowY };
        }
        if (!locked) history.vinylReleased = true;
      }
      if (!history.vinylReleased && performance.now() - start < 60000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, SEL.card);
}

async function runFloralChecks(page) {
  const flower = ".watercolor__flower";
  const petal = ".watercolor__drifting-petal";
  const clearPetals = () => page.locator(petal).evaluateAll((els) => els.forEach((el) => {
    el.getAnimations().forEach((animation) => animation.cancel());
    el.remove();
  }));
  const position = () => page.locator(flower).first().evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  const { width, height } = page.viewportSize();

  await page.mouse.move(width - 20, 30);
  await sleep(250);
  const right = await position();
  await page.mouse.move(20, height - 20);
  await sleep(250);
  const left = await position();
  check("mouse movement gives flowers horizontal parallax", right > 1 && left < -1,
    `right=${right.toFixed(2)} left=${left.toFixed(2)}`);

  await clearPetals();
  await page.mouse.click(8, Math.round(height * 0.25));
  const clickCount = await page.locator(petal).count();
  check("a background click spawns four drifting petals", clickCount === 4, `petals=${clickCount}`);
  await clearPetals();

  await page.evaluate((x) => window.dispatchEvent(new PointerEvent("pointermove", {
    clientX: x, clientY: 30, pointerType: "touch", pointerId: 77, isPrimary: true,
  })), width - 20);
  await sleep(250);
  const touchPosition = await position();
  check("touch Pointer Events use the same floral parallax", touchPosition > 1,
    `translateX=${touchPosition.toFixed(2)}`);

  const touchCounts = await page.evaluate(() => {
    const send = (type, x, y) => window.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, pointerType: "touch", pointerId: 77, isPrimary: true, button: 0,
    }));
    const count = () => document.querySelectorAll(".watercolor__drifting-petal").length;
    const clear = () => document.querySelectorAll(".watercolor__drifting-petal").forEach((el) => {
      el.getAnimations().forEach((animation) => animation.cancel());
      el.remove();
    });
    send("pointerdown", 20, 100);
    send("pointerup", 20, 100);
    const tap = count();
    clear();
    send("pointerdown", 20, 100);
    send("pointermove", 80, 160);
    send("pointerup", 80, 160);
    const drag = count();
    for (let i = 0; i < 8; i++) {
      send("pointerdown", 20, 100);
      send("pointerup", 20, 100);
    }
    return { tap, drag, rapid: count() };
  });
  check("a touch tap spawns petals and a scroll drag does not",
    touchCounts.tap === 4 && touchCounts.drag === 0, JSON.stringify(touchCounts));
  check("rapid taps keep the decorative petal budget bounded",
    touchCounts.rapid > 0 && touchCounts.rapid <= 12, JSON.stringify(touchCounts));
  await clearPetals();
}

async function runViewport(browser, vp) {
  console.log(`\n── ${vp.name} ${vp.width}x${vp.height} ──`);
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    // Autoplay policy must be relaxed or the first user gesture is swallowed and
    // the whole audio contract goes untested.
    bypassCSP: false,
  });
  const page = await context.newPage();

  // Observe real decoded Web Audio playback, including its matching visual pose.
  await page.addInitScript(() => {
    window.__soundCues = [];
    const sources = new WeakMap();
    const buffers = new WeakMap();
    const effects = new Set();
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      effects.delete(this);
      return stop.apply(this, args);
    };
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      const loaded = this.onload;
      this.onload = function (event) {
        if (this.response instanceof ArrayBuffer) sources.set(this.response, this.responseURL);
        return loaded?.call(this, event);
      };
      return send.apply(this, args);
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (data, done, failed) {
      const url = sources.get(data);
      const result = decode.call(this, data, (buffer) => { buffers.set(buffer, url); done?.(buffer); }, failed);
      result?.then((buffer) => buffers.set(buffer, url)).catch(() => {});
      return result;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const url = buffers.get(this.buffer);
      if (url?.includes("audio/")) {
        const flap = document.querySelector(".envelope__flap");
        window.__soundCues.push({
          name: url.split("/").at(-1).replace(".mp3", ""),
          phase: document.querySelector("[data-envelope-state]")?.dataset.envelopeState,
          angle: flap ? Math.atan2(new DOMMatrix(getComputedStyle(flap).transform).m23, new DOMMatrix(getComputedStyle(flap).transform).m22) * 180 / Math.PI : null,
          at: performance.now(), offset: args[1] ?? 0,
          overlapping: effects.size,
        });
        if (url.includes("audio/sfx/") && !url.endsWith("crackle.mp3")) {
          effects.add(this);
          this.addEventListener("ended", () => effects.delete(this), { once: true });
        }
      }
      return start.apply(this, args);
    };
  });

  // 1 — collect errors from the very first byte, not after load.
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(600);
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  await page.reload({ waitUntil: "networkidle" });
  const muteStored = await page.getByRole("button", { name: "Unmute sound", exact: true }).getAttribute("aria-pressed");
  check("mute preference survives a page reload", muteStored === "true");
  await page.getByRole("button", { name: "Unmute sound", exact: true }).click();
  await runFloralChecks(page);

  // canvas-confetti appends its canvas as a *direct child of <body>* the first time
  // it fires and takes it away when the burst drains. The petals canvas sits inside
  // its own wrapper and can never match here. Counted rather than polled, because
  // the burst runs ~3.7s across both the greeting and the handoff: any poll placed
  // after those checks samples it either already gone or not yet started, and both
  // outcomes read as "never fired".
  await page.evaluate(() => {
    window.__bodyCanvases = { added: 0, removed: 0 };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.target !== document.body) continue;
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.tagName === "CANVAS") window.__bodyCanvases.added++;
        }
        for (const n of r.removedNodes) {
          if (n.nodeType === 1 && n.tagName === "CANVAS") window.__bodyCanvases.removed++;
        }
      }
    }).observe(document.body, { childList: true });
  });

  // 2 — scroll must be locked before the gesture
  const beforeGesture = await wheelAttempt(page, 600);
  check("scroll is locked before the gesture", beforeGesture === 0, `scrollY=${beforeGesture}`);
  await shot(page, `${vp.name}-1-envelope`);

  // The envelope must be a real control, reachable by keyboard.
  const envelope = page.locator(SEL.envelope).first();
  const envelopeIsButton = await envelope.evaluate((el) => el.tagName === "BUTTON" || el.closest("button") !== null).catch(() => false);
  check("envelope is a keyboard-reachable <button>", envelopeIsButton);

  // 4 — the letter font must actually be loaded (drawn text depends on it)
  // Load it explicitly first. `document.fonts.check` only reports true for a face
  // the browser has actually fetched, and a webfont is fetched lazily the first
  // time something uses it — nothing in scene one is set in the letter face, so
  // checking here without loading first reports false for a font that is perfectly
  // correctly declared. `document.fonts.load` is also what the app awaits before
  // drawing text to the record sleeve's canvas, so this asserts the same thing the
  // app depends on.
  await page.evaluate(
    (f) => document.fonts.load(`1em ${f}`, "Dear Friend"),
    LETTER_FONT,
  );
  const fontOk = await page.evaluate((f) => document.fonts.check(`1em ${f}`), LETTER_FONT);
  check(`document.fonts.check('1em ${LETTER_FONT}')`, fontOk === true);

  // --- the one gesture -------------------------------------------------------
  // `force` because the envelope floats ±6px on a 4s loop, so Playwright's
  // stability check would never see it settle and would time out rather than click.
  await watchSceneHistory(page);
  await envelope.click({ force: true });
  await page.evaluate(() => {
    window.__heroFrames = [];
    const sample = () => {
      const stage = document.querySelector("[data-envelope-state]");
      if (!stage || window.__heroFrames.length > 1200) return;
      const letter = document.querySelector(".envelope__letter");
      const paper = letter.querySelector(".greeting-card");
      const r = letter.getBoundingClientRect();
      const flap = document.querySelector(".envelope__flap");
      window.__heroFrames.push({
        phase: stage.dataset.envelopeState, top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        background: getComputedStyle(paper).backgroundColor,
        overflow: getComputedStyle(letter.parentElement).overflow,
        origin: getComputedStyle(flap).transformOrigin,
        z: getComputedStyle(letter).zIndex,
      });
      requestAnimationFrame(sample);
    };
    sample();
    for (let i = 0; i < 8; i++) document.querySelector("[data-testid=envelope]").click();
  });

  // A click that does nothing is the single worst failure this page can have:
  // the brief allows exactly one gesture, and this used to be broken while every
  // other check still passed. Pointer capture on the wrapper was retargeting the
  // click away from the button. Assert the scene actually advances rather than
  // assuming it did — and wait on the attribute, not a fixed sleep, because the
  // flap spring plus the deliberate open-hold take longer than any sane constant
  // would survive being tuned against.
  const advanced = await page
    .waitForFunction(() => document.querySelector("main")?.dataset.scene === "card", null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const sceneNow = await page.evaluate(() => document.querySelector("main")?.dataset.scene ?? null);
  check("the one gesture (tap the envelope) advances envelope -> card", advanced, `data-scene=${sceneNow}`);

  // The one-gesture design means there is nothing to reverse: `closeEnvelope`
  // and the `.envelope-close` control it would drive are both absent from `src/`,
  // so the reverse half of this section was unreachable and only ever threw.
  const hero = await page.evaluate(() => {
    const frames = window.__heroFrames.filter((f) => ["opening", "open"].includes(f.phase));
    return {
      samples: frames.length,
      inside: frames.every((f) => f.top >= -1 && f.bottom <= innerHeight + 1 && f.left >= -1 && f.right <= innerWidth + 1),
      opaque: frames.every((f) => f.background === "rgb(255, 250, 247)" && f.overflow === "visible"),
      hinged: frames.every((f) => f.origin.split(" ")[1] === "0px"),
      layers: [...new Set(frames.map((f) => f.z))],
      cues: window.__soundCues.filter((cue) => cue.phase === "opening"),
    };
  });
  check("paper stays opaque, unclipped and inside the viewport during the lift",
    hero.samples > 15 && hero.inside && hero.opaque, JSON.stringify(hero).slice(0, 600));
  check("the flap hinges at the top edge and paper moves behind then in front",
    hero.hinged && hero.layers.includes("2") && hero.layers.includes("5"), JSON.stringify(hero.layers));
  const cueNames = hero.cues.map((cue) => cue.name);
  check("real sound playback follows the open, slide and settle cues",
    cueNames.join(",") === "flap,slide,pop"
      && hero.cues.every((cue) => cue.offset === 0 && cue.overlapping === 0), JSON.stringify(hero.cues));

  // 3 — scene 2 must actually paint the card, not merely flip the scene attribute.
  // Those are two separate facts and the old script assumed the second by sleeping
  // a fixed 2600 ms tuned against a card that did not exist yet. Wait for the
  // element to be in the DOM *and* opaque, so the screenshot is of a real card and
  // the check fails loudly if the reveal never lands.
  //
  // Note for the app: put `data-testid="greeting-card"` on the element whose own
  // opacity is animated by the reveal, not on an always-opaque wrapper.
  const cardOpaque = await page
    .waitForFunction(
      () => !!window.__sceneHistory.card,
      null,
      { timeout: 6000 },
    )
    .then(() => true)
    .catch(() => false);
  const cardState = await page.evaluate(() => window.__sceneHistory.card);
  check("scene 2 paints the greeting card at full opacity", cardOpaque, JSON.stringify(cardState));

  // 3b — and the page has not grown underneath it, and a reader cannot scroll it.
  // Every check above could pass on a document that was 105px taller than the
  // viewport: `overflow: hidden` on <html> stops a *reader* from scrolling but does
  // not stop the document being scrollable, and the scene-2 painted layers sit at
  // `inset: -10%` so the parallax has room to drift. Unclipped, that oversize grew
  // the document and left a phantom scroll the lock could not remove — and it
  // survived into every later scene, where it would have been real, visible dead
  // space above the gallery. Asserted as a scroll *attempt* — with a wheel, not
  // `scrollTo`, so the assertion says a reader was stopped rather than that a
  // target clamped.
  //
  // Sampled here, ahead of the reveal poll below, and that ordering is load-bearing.
  // The document is one viewport tall only while the gallery is unmounted, and the
  // gallery mounts from scene three — so this claim holds for the ~3s the card is on
  // screen. The poll below has a 6s budget and on a loaded machine spends all of it
  // on its own `page.evaluate` round trips; measured that way this check then read
  // 6983px of already-mounted gallery and reported the app's correct handoff as a
  // lock defect. The sampled scene is in the failure text, so a late sample is
  // self-diagnosing instead of a mystery.
  const docHeight = await page.evaluate(() => window.__sceneHistory.cardLock);
  check(
    "scene 2 is observed locked at scroll zero with a one-viewport document",
    !!docHeight && docHeight.scrollY === 0 && docHeight.scroll === docHeight.view,
    JSON.stringify(docHeight),
  );

  // 3c — and every line on it is actually visible. The check above is satisfied by
  // an empty sheet, because the card springs to full opacity at ~0.5s while the last
  // line does not land until ~2s. It passed against a blank card and screenshotted
  // one, which is the failure mode worth guarding: a scene that renders its stage
  // and silently never plays its own content. Asserted before the screenshot, so the
  // artifact is of a card with a greeting on it.
  //
  // Polled rather than sampled once, because in a single reading "not animated yet"
  // and "never animated" are the same value. Six seconds of budget for a schedule
  // whose last line lands at ~2s.
  const greetingPainted = await page.waitForFunction(() => window.__sceneHistory.greetingComplete,
    null, { timeout: 6000 }).then(() => true).catch(() => false);
  const greeting = await page.evaluate(() => window.__sceneHistory.greeting);
  check(
    "scene 2 reveals every line of the greeting",
    greetingPainted && greeting.total >= 4 && greeting.stuck.length === 0,
    JSON.stringify(greeting),
  );

  if (await page.locator(SEL.card).count()) await shot(page, `${vp.name}-3-card`);

  // 3 — scene 3 must mount. This is also the first moment a WebGL canvas can exist:
  // the brief makes the R3F canvas lazy, so probing for it while `data-scene` still
  // read "card" was structurally impossible to pass. Assert the handoff rather than
  // sleeping through it.
  const vinylMounted = await page
    .waitForFunction(() => window.__sceneHistory.vinylSeen, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const sceneAfterCard = await page.evaluate(() => document.querySelector("main")?.dataset.scene ?? null);
  check("the card hands off to the vinyl scene", vinylMounted, `data-scene=${sceneAfterCard}`);

  // Exactly one burst. Never firing reports 0, and a burst retried or re-fired by a
  // remount reports 2 — the "card unmounted and remounted, so the effect ran again"
  // failure that a `data-scene` assertion cannot see. Read after the handoff so the
  // count is final rather than sampled mid-burst.
  //
  // This claims only what a browser can see: that the effect ran, once. That the
  // burst *drains before* the handoff is `cardTimeline.test.ts`'s job — `ticks` is a
  // frame cap, so it is arithmetic, and the browser cannot observe a canvas that is
  // already gone without racing the frame it would have left on.
  const confetti = await page.evaluate(() => window.__bodyCanvases);
  check("scene 2 fires exactly one confetti burst", confetti?.added === 1, JSON.stringify(confetti));

  // 2b — still locked *during* scene 3. Checked before the canvas poll and the
  // screenshot, because both cost time, and the lock is released 5.0s into the vinyl
  // sequence (`VINYL_TIMELINE.unlockAt`). Waiting for the *declaration* rather than
  // trusting arrival order is what makes the sample land inside the locked window by
  // construction: this ran immediately after a `data-scene === "vinyl"` wait that
  // resolves on the frame the scene mounts, so the wait below is already satisfied.
  // It costs nothing when the lock is correct and turns a late-arriving harness into
  // a reported `declared=false` instead of a silent "the lock is broken".
  const vinylLock = await page.evaluate(() => window.__sceneHistory.vinylLock);
  check(
    "scene 3 is observed locked at scroll zero while the gallery is mounted",
    !!vinylLock && vinylLock.scrollY === 0 && vinylLock.scroll > vinylLock.view,
    JSON.stringify(vinylLock),
  );

  // The declaration, not the position. The position now carries real weight —
  // scene four is mounted from scene three, so the document is five screens tall
  // and there is somewhere to scroll *to* — but it only does because the attempt
  // above was a wheel. Under `scrollTo` this assertion read 800 while the lock
  // held: `overflow: hidden` is inert to input, not to script, and the check used
  // to be green purely because the document was exactly one viewport tall and the
  // target clamped to 0. Belt and braces either way; the overflow declaration is
  // the mechanism itself, so read it too.
  const midHidden = vinylLock?.overflow === "hidden";
  check("the document is observed declared locked during scene 3", midHidden);

  // 3 — a WebGL canvas must exist with non-zero size. The canvas mounts a beat
  // after the scene flips (lazy chunk fetch + R3F commit), so poll a bounded
  // number of times instead of assuming it is there on the very first frame.
  let gl = { found: false, count: 0 };
  for (let i = 0; i < 50; i++) {
    gl = await page.evaluate(webglProbe);
    if (gl.found && gl.width > 0 && gl.height > 0) break;
    await sleep(100);
  }
  check("canvas has a WebGL context with non-zero size",
    gl.found && gl.width > 0 && gl.height > 0,
    JSON.stringify(gl));
  await shot(page, `${vp.name}-4-vinyl`);

  // The cue is the last thing the vinyl sequence renders. Wait for it to be
  // attached rather than sampling `isVisible()` on an untimed tick — asking "is it
  // visible right now" reports false for a cue that has not been mounted yet, the
  // same class of hole as the WebGL probe above.
  const cueAttached = await page
    .waitForSelector(SEL.scrollCue, { state: "attached", timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("scroll cue appears when scene 3 ends", cueAttached);

  await scrollAttempt(page, 0);
  // Poster only: `.vinyl-controls` is an empty div, so the in-scene play/pause
  // button this used to assert never existed. The docked mini player's control
  // is still checked, and still must be a real button.
  const fullPlayer = await page.evaluate(() => {
    const poster = document.querySelector(".vinyl-rig-layer");
    if (!poster) return { present: false };
    const r = poster.getBoundingClientRect();
    return {
      present: true,
      position: getComputedStyle(poster).position,
      inside: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
    };
  });
  check("the full vinyl poster fits in the normal page flow",
    fullPlayer.present && fullPlayer.position !== "fixed" && fullPlayer.inside,
    JSON.stringify(fullPlayer));

  // 4 — the poster is actually painted. Every check above passes against a live
  // WebGL context showing an untextured white disc: `map` arriving flips the
  // USE_MAP shader define per material, and if three is not told to rebuild, the
  // record keeps the material's default white while the sleeve — a different
  // material — is correct. That shipped through two full runs of this file with
  // a green canvas check, so the assertion has to be about the pixels, not the
  // context.
  //
  // A WebGL canvas cannot be read back after compositing (the drawing buffer is
  // cleared), so the sample comes from a real screenshot decoded by the page's
  // own 2D canvas. No dependency, and it is what the reader actually sees.
  // Fractions rather than coordinates, so it holds at 360px and at 1280px.
  const rigShot = await page.locator(".vinyl-rig").screenshot();
  const ink = await page.evaluate(async (dataUrl) => {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    let dark = 0, light = 0, n = 0, min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (l < 60) dark++;
      if (l > 200) light++;
      if (l < min) min = l;
      if (l > max) max = l;
      n++;
    }
    return { dark: +(dark / n).toFixed(3), light: +(light / n).toFixed(3), min: Math.round(min), max: Math.round(max) };
  }, `data:image/png;base64,${rigShot.toString("base64")}`);
  check("the poster paints a dark record against the light sleeve",
    !!ink && ink.dark > 0.03 && ink.light > 0.1 && ink.max - ink.min > 120,
    JSON.stringify(ink));

  let unlocked = 0;
  for (let i = 0; i < 20; i++) {
    unlocked = await wheelAttempt(page, 800);
    if (unlocked > 0) break;
  }
  check("scroll unlocks after scene 3", unlocked > 0, `scrollY=${unlocked}`);

  // Same reasoning as the locked check above, run in the other direction. A
  // `scrollTo` could not have proven this either — it reports 800 both locked and
  // released, which is why the pair above is worthless under that method. The
  // wheel moving is the reader actually getting through.
  const released = await page.evaluate(() => document.documentElement.style.overflow === "");
  check("the document lock is released when scene 3 ends", released);

  // The poster stays at the page top; its compact companion must restore in
  // both directions, including controls and an animated record rather than an icon.
  await scrollAttempt(page, await page.locator(".vinyl-stage").evaluate((el) => el.offsetHeight + 120));
  const miniVisible = await page.waitForSelector(".vinyl-mini", { state: "visible", timeout: 3000 })
    .then(() => true).catch(() => false);
  const mini = await page.evaluate(() => {
    const el = document.querySelector(".vinyl-mini");
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    const disc = el.querySelector(".vinyl-disc");
    const title = el.querySelector(".vinyl-mini__track");
    return {
      present: true, width: r.width, height: r.height,
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      title: !!title?.textContent.trim(),
      spinning: !!disc && getComputedStyle(disc).animationName === "vinyl-spin"
        && getComputedStyle(disc).animationPlayState === "running",
    };
  });
  check("scrolling docks a compact animated vinyl player with its track title",
    miniVisible && mini.present && mini.inside && mini.width <= 260 && mini.height <= 80 && mini.title && mini.spinning,
    JSON.stringify(mini));
  const miniControl = page.locator(".vinyl-mini .vinyl-toggle");
  if (miniVisible) {
    await miniControl.click();
    const paused = await page.locator(".vinyl-mini .vinyl-disc").evaluate((el) =>
      getComputedStyle(el).animationPlayState === "paused");
    check("the compact player's control pauses its animation and retains playback state",
      paused && await miniControl.getAttribute("aria-pressed") === "false");
    await miniControl.click();
  }
  await scrollAttempt(page, 0);
  const restored = await page.waitForFunction(() => !document.querySelector(".vinyl-mini"), null, { timeout: 3000 })
    .then(() => true).catch(() => false);
  // Poster only — there is no in-scene button whose pressed state could be
  // compared, and the compact player's own state is asserted above.
  check("scrolling back restores the full poster", restored);
  await shot(page, `${vp.name}-4-vinyl-restored`);

  const clips = await page.locator(".polaroid video").evaluateAll((videos) => ({
    count: videos.length,
    passive: videos.every((video) => !video.controls && video.tabIndex === -1
      && video.disablePictureInPicture && getComputedStyle(video).pointerEvents === "none"),
  }));
  check("gallery clips have no player controls and cannot receive pointer or keyboard interaction",
    clips.count > 0 && clips.passive, JSON.stringify(clips));

  // 5 — walk the whole page so every scroll-driven reveal fires
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await scrollAttempt(page, Math.round((maxY * i) / steps));
    if (i === 4) await shot(page, `${vp.name}-5-gallery-top`);
    if (i === 10) await shot(page, `${vp.name}-6-gallery`);
  }
  await scrollAttempt(page, maxY);
  await sleep(900); // let the letter's final reveal settle
  await shot(page, `${vp.name}-7-letter`);

  // 5 — all polaroids present AND visible (a reveal that never fired shows opacity 0)
  const polaroids = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    return {
      total: els.length,
      visible: els.filter((el) => {
        const s = getComputedStyle(el);
        return parseFloat(s.opacity) > 0.05 && s.visibility !== "hidden" && s.display !== "none";
      }).length,
    };
  }, SEL.polaroid);
  check("all polaroids revealed at the bottom of the page",
    polaroids.total > 0 && polaroids.visible === polaroids.total,
    `${polaroids.visible}/${polaroids.total} visible`);

  // 5 — the full letter text is present and actually painted
  const letter = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { present: false };
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    const r = el.getBoundingClientRect();
    return { present: true, chars: text.length, height: r.height, opacity: parseFloat(getComputedStyle(el).opacity), text: text.slice(0, 80) };
  }, SEL.letter);
  check("letter is present with its full text", letter.present && letter.chars > 200, JSON.stringify(letter).slice(0, 160));

  // 5 — the reveal reached its last word. A presence check passes on a letter
  // whose words are all still at the opening `dim` opacity, which is a scene
  // that looks blank and was green here once already.
  const lastWord = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { present: false };
    return { present: true, opacity: parseFloat(getComputedStyle(el).opacity) };
  }, SEL.letterLastWord);
  check("the letter's last word reaches full ink",
    lastWord.present && lastWord.opacity >= 0.9,
    JSON.stringify(lastWord));

  // 5 — the sheet is on screen at the end of the page, fully inside it. The
  // letter is sticky, so "present" and "readable" are different claims.
  const sheet = await page.evaluate(() => {
    const el = document.querySelector(".worn__sheet");
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    return {
      present: true,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      viewportH: window.innerHeight,
      inside: r.top >= -1 && r.bottom <= window.innerHeight + 1,
    };
  });
  check("the letter's sheet sits inside the viewport at the page end",
    sheet.present && sheet.inside, JSON.stringify(sheet));

  // 5 — the sheet's travel reaches the letter's last pixel. The letter is
  // deliberately larger than the sheet (`.worn__ink` is a clipping viewport over
  // `.worn__flow`, section grows by the measured overflow), so the old claim —
  // "the ink fits its sheet" — is now false by design. What must stay true is
  // that the scroll carries the flow all the way: at the page end the remaining
  // overflow plus the applied translateY has to be ~0, or the closing lines are
  // stranded under the clip and no other check here would notice.
  const inkTravel = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { present: false };
    const ink = el.parentElement;
    if (!ink) return { present: false };
    const style = getComputedStyle(ink);
    const view = ink.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const over = Math.max(0, el.scrollHeight - view);
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { present: true, over: Math.round(over), y: Math.round(m.m42), left: Math.round(over + m.m42) };
  }, SEL.letterFlow);
  check("the sheet's travel carries the letter to its end",
    inkTravel.present && inkTravel.left <= 4 && inkTravel.left >= -4,
    JSON.stringify(inkTravel));
  const lastVisible = await page.locator(SEL.letterLastWord).evaluate((word) => {
    const r = word.getBoundingClientRect();
    const ink = word.closest(".worn__ink").getBoundingClientRect();
    const mini = document.querySelector(".vinyl-mini")?.getBoundingClientRect();
    return r.top >= ink.top - 1 && r.bottom <= ink.bottom + 1 && r.bottom <= innerHeight
      && (!mini || r.right <= mini.left || r.bottom <= mini.top);
  });
  check("the final letter word is physically visible and clear of the floating player", lastVisible);
  const captions = await page.locator(".polaroid__caption").evaluateAll((els) => els.map((el) => ({
    face: getComputedStyle(el).fontFamily, casing: getComputedStyle(el).textTransform,
  })));
  check("photo captions use the loaded handwriting face and preserve authored case",
    captions.length === 6 && captions.every((c) => c.face.includes("The Girl Next Door") && c.casing === "none"));

  // 5 — no word is painted underneath the peony. Both rects come from
  // getBoundingClientRect, so this compares them in the same screen space and
  // includes the sheet's -1deg rotation. Word rects are axis-aligned boxes
  // around rotated inline spans, which over-states them slightly — the safe
  // direction for a collision check.
  const peony = await page.evaluate((sels) => {
    const l = document.querySelector(sels.peony);
    if (!l) return { present: false };
    const lr = l.getBoundingClientRect();
    const hits = [...document.querySelectorAll(sels.word)].filter((w) => {
      const r = w.getBoundingClientRect();
      return r.left < lr.right && r.right > lr.left && r.top < lr.bottom && r.bottom > lr.top;
    });
    return {
      present: true,
      words: hits.length,
      first: hits.length ? hits[0].textContent.trim() : null,
      peony: { l: Math.round(lr.left), t: Math.round(lr.top) },
    };
  }, { word: SEL.letterWord, peony: SEL.letterPeony });
  check("no word of the letter collides with the peony",
    peony.present && peony.words === 0, JSON.stringify(peony));

  // 5 — the fold is actually still folding when the unfold window says it should
  // be. This is the check the old +/-180 mapping needed and did not have.
  //
  // `backface-visibility: hidden` culls a panel the moment its face normal's z
  // component goes negative, so driving the fold past 90 degrees does not park a
  // panel behind the sheet — it deletes it, for the rest of the section. With
  // +/-180 the measured `m22` crossed zero at p = 0.175 and then sat at -0.977,
  // -0.999 and -1 out to p = 1: the paper visibly unfolded and then did nothing
  // for 82.5% of the letter's travel, and every other check in this file stayed
  // green throughout.
  //
  // So this asserts the specific property on the element that owns it: walk the
  // top flap's rendered matrix across the unfold window and require it to still
  // be facing the reader at 34%, which is where `letterTimeline.ts` says the
  // fold ends. Read from `getComputedStyle` rather than from the `open` motion
  // value, because the failure mode is a disagreement between the two.
  const fold = await page.evaluate((sels) => {
    const el = document.querySelector(sels.top);
    if (!el) return { present: false };
    const m = new DOMMatrix(getComputedStyle(el).transform);
    // rotateX(a) puts cos(a) in m22 and sin(a) in m32.
    return {
      present: true,
      cos: +m.m22.toFixed(3),
      deg: +((Math.atan2(m.m32, m.m22) * 180) / Math.PI).toFixed(1),
      hidden: getComputedStyle(el).backfaceVisibility,
    };
  }, { top: SEL.letterFlapTop, bottom: SEL.letterFlapBottom });

  // Walk the unfold window and record the flap's facing at each stop. `p` is
  // the section's own scroll progress, so 0.175 is the point the old mapping
  // culled at and 0.34 is just short of `unfoldEnd`.
  const foldWindow = [];
  for (const p of [0.175, 0.26, 0.34]) {
    const s = await page.evaluate(
      async ({ sel, at }) => {
        const sec = document.querySelector(".letter");
        const start = sec.offsetTop;
        const span = sec.offsetHeight - window.innerHeight;
        window.scrollTo(0, Math.round(start + at * span));
        // Let the scroll handler and Motion's frame land before reading the
        // matrix; two frames is what the fold needs to be one frame behind.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.querySelector(sel);
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { at, cos: +m.m22.toFixed(3), painted: Math.round(el.getBoundingClientRect().height) };
      },
      { sel: SEL.letterFlapTop, at: p }
    );
    foldWindow.push(s);
  }
  // Still facing the reader, and still shrinking, at every stop — including the
  // last, which is the one that used to read -1.
  const foldOk =
    fold.present &&
    foldWindow.every((s) => s.cos >= 0 && s.painted > 0) &&
    foldWindow.at(-1).cos < 0.5;
  check(
    "the letter's fold is still visible at the end of its unfold window",
    foldOk,
    `at rest ${JSON.stringify(fold)} | across the window ${JSON.stringify(foldWindow)}`
  );

  // Reaching the end must remain repeatable after reverse scroll and viewport resize.
  const originalWidth = vp.width;
  await page.setViewportSize({ width: originalWidth - 30, height: vp.height - 40 });
  await scrollAttempt(page, await page.locator(".letter").evaluate((el) => el.offsetTop));
  await scrollAttempt(page, await page.evaluate(() => document.documentElement.scrollHeight));
  const resizedEnd = await page.locator(SEL.letterLastWord).evaluate((word) => {
    const r = word.getBoundingClientRect();
    const ink = word.closest(".worn__ink").getBoundingClientRect();
    return r.top >= ink.top - 1 && r.bottom <= ink.bottom + 1 && r.bottom <= innerHeight
      && Number(getComputedStyle(word).opacity) >= 0.99;
  });
  check("resizing and reverse scrolling still reach the full letter's final word", resizedEnd);
  await page.setViewportSize({ width: originalWidth, height: vp.height });
  await scrollAttempt(page, await page.evaluate(() => document.documentElement.scrollHeight));

  const progress = page.getByTestId("gallery-progress");
  const journey = await progress.evaluate((fill) => {
    const nav = fill.closest("nav");
    const stops = Array.from(nav.querySelectorAll("a"));
    return {
      fill: new DOMMatrix(getComputedStyle(fill).transform).m22,
      enabled: !nav.inert,
      stops: stops.length,
      usable: stops.every((stop) => {
        const r = stop.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44 && r.left >= -1 && r.right <= innerWidth + 1
          && !!stop.getAttribute("aria-label");
      }),
    };
  });
  check("gallery progress reaches the letter with seven usable memory links",
    journey.fill >= 0.99 && journey.enabled && journey.stops === 7 && journey.usable,
    JSON.stringify(journey));
  await page.locator('a[href="#memory-3"]').click();
  const memoryReached = await page.waitForFunction(() => {
    const r = document.querySelector("#memory-3").getBoundingClientRect();
    return Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2;
  }, null, { timeout: 6000 }).then(() => true).catch(() => false);
  const midFill = await progress.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m22);
  check("gallery progress links jump to a memory and update their fill on reverse scroll",
    memoryReached && midFill > 0.1 && midFill < 0.8, `reached=${memoryReached}, fill=${midFill}`);
  await shot(page, `${vp.name}-8-gallery-progress`);
  await page.locator('a[href="#letter"]').click();
  const letterReached = await page.waitForFunction(() =>
    Math.abs(document.querySelector("#letter").getBoundingClientRect().top) < 2,
  null, { timeout: 6000 }).then(() => true).catch(() => false);
  check("the gallery's final progress stop opens the letter from its beginning", letterReached);

  // 1 — no errors anywhere in the run
  const errs = [...consoleErrors, ...pageErrors];
  check("no console or page errors", errs.length === 0, errs.slice(0, 4).join(" | "));

  await context.close();
}

// ── run ──────────────────────────────────────────────────────────────────────
async function runReducedMotion(browser) {
  console.log("\n-- reduced motion 390x844 --");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: "reduce", hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(300);

  const floralTransforms = () => page.locator(".watercolor [data-depth]").evaluateAll(
    (els) => els.map((el) => getComputedStyle(el).transform),
  );
  const stillBefore = await floralTransforms();
  await sleep(350);
  await page.touchscreen.tap(8, 100);
  const stillAfter = await floralTransforms();
  check("reduced motion keeps background flowers still and disables drifting petals",
    stillBefore.length > 0 && stillBefore.every((value) => value === "none")
      && JSON.stringify(stillBefore) === JSON.stringify(stillAfter)
      && await page.locator(".watercolor__drifting-petal").count() === 0);

  const envelope = page.locator(SEL.envelope).first();
  await envelope.focus();
  await page.evaluate(() => {
    window.__reducedPaperFrames = [];
    const sample = () => {
      const phase = document.querySelector("[data-envelope-state]")?.dataset.envelopeState;
      if (phase === "opening" || phase === "open") {
        const paper = document.querySelector(".envelope__letter");
        const card = paper?.querySelector(".greeting-card");
        const rect = paper?.getBoundingClientRect();
        const color = card ? getComputedStyle(card).backgroundColor : "transparent";
        const opaque = color !== "transparent" && (!color.startsWith("rgba") || /,\s*1\)$/.test(color));
        window.__reducedPaperFrames.push({
          phase, color, present: !!paper && !!card, opaque,
          inside: !!rect && rect.width > 0 && rect.height > 0 && rect.top >= -1
            && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1,
        });
      }
      if (phase !== "open") requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.press("Enter");
  const opened = await page.waitForFunction(
    () => window.__reducedPaperFrames.some((frame) => frame.phase === "open"),
    null, { timeout: 20000 },
  ).then(() => true).catch(() => false);
  const frames = await page.evaluate(() => window.__reducedPaperFrames);
  const heroPaper = frames.find((frame) => frame.phase === "open");
  check("reduced motion opens the envelope by keyboard with opaque, fully visible paper",
    opened && heroPaper?.present && heroPaper.opaque && heroPaper.inside, JSON.stringify(heroPaper));
  check("reduced motion keeps paper opaque and inside the viewport throughout opening",
    frames.length > 1 && frames.every((frame) => frame.opaque && frame.inside), JSON.stringify(frames));
  await shot(page, "reduced-2-envelope-open");

  const unlocked = await page.waitForFunction(
    () => document.documentElement.style.overflow !== "hidden" && document.querySelector(".worn__flow"),
    null, { timeout: 20000 },
  ).then(() => true).catch(() => false);
  check("reduced motion finishes the introduction and releases scrolling", unlocked);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(650);
  const finalLetter = await page.evaluate((sel) => {
    const last = document.querySelector(sel);
    const ink = document.querySelector(".worn__ink");
    const words = Array.from(document.querySelectorAll(".letter__word"));
    if (!last || !ink) return { present: false };
    const rect = last.getBoundingClientRect();
    const clip = ink.getBoundingClientRect();
    return {
      present: true,
      allInk: words.length > 0 && words.every((word) => Number(getComputedStyle(word).opacity) >= 0.99),
      lastVisible: rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1
        && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      lastBottom: Math.round(rect.bottom), inkBottom: Math.round(clip.bottom),
    };
  }, SEL.letterLastWord);
  check("reduced motion scrolls the final letter word into view with all ink fully visible",
    finalLetter.present && finalLetter.allInk && finalLetter.lastVisible, JSON.stringify(finalLetter));
  check("reduced motion has no horizontal overflow", finalLetter.noHorizontalOverflow === true);
  await shot(page, "reduced-7-letter");
  check("reduced motion has no console or page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
  await context.close();
}

async function runCompactScreens(browser) {
  for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    const reduced = viewport.width === 320;
    const context = await browser.newContext({ viewport, hasTouch: true, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(BASE, { waitUntil: "networkidle" });
    // Observe short states before the gesture; host round trips can outlast them.
    // No closing probe: `.envelope-close` is not rendered anywhere in `src/`, so
    // clicking it killed the rAF chain and this pass timed out instead of failing.
    await page.evaluate(() => {
      const probe = window.__compactHero = { open: null };
      const deadline = performance.now() + 30000;
      const sample = () => {
        const stage = document.querySelector("[data-envelope-state]");
        const paper = document.querySelector(".greeting-card");
        if (stage?.dataset.envelopeState === "open" && paper) {
          const r = paper.getBoundingClientRect();
          const text = paper.querySelector(".greeting-card__birthday").getBoundingClientRect();
          const fits = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
            && text.left >= r.left && text.right <= r.right;
          probe.open ??= { fits };
          probe.open.fits &&= fits;
        }
        if ((!stage && probe.open) || performance.now() >= deadline) return;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByTestId("envelope").tap();
    await page.waitForFunction(() => !!window.__compactHero.open, null, { timeout: 20000 });
    // `fits` is the AND over the whole open hold, so the check at the bottom of
    // this loop needs the sampler to have stopped — either the envelope unmounted
    // or the probe hit its deadline.
    await page.waitForFunction(() => !document.querySelector("[data-envelope-state]"), null, { timeout: 30000 })
      .catch(() => null);
    if (reduced) {
      await page.waitForSelector(SEL.scrollCue, { timeout: 15000 });
      const posterFits = await page.locator(".vinyl-rig-layer").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      });
      check("320px screen retains a full vinyl poster", posterFits);
      await page.locator('a[href="#memory-1"]').focus();
      const keptFocus = await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return document.activeElement?.getAttribute("href") === "#memory-1";
      });
      await page.keyboard.press("Enter");
      const keyboardMemory = await page.waitForFunction(() => {
        const r = document.querySelector("#memory-1").getBoundingClientRect();
        return Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2;
      }, null, { timeout: 3000 }).then(() => true).catch(() => false);
      check("gallery navigation retains keyboard focus and Enter selects the memory",
        keptFocus && keyboardMemory);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const compact = await page.waitForSelector(".vinyl-mini", { state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
      check("reduced motion keeps the compact vinyl controls available while reading", compact);
      await page.locator('a[href="#memory-2"]').tap();
      const touchedMemory = await page.waitForFunction(() => {
        const r = document.querySelector("#memory-2").getBoundingClientRect();
        return Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2;
      }, null, { timeout: 3000 }).then(() => true).catch(() => false);
      const stillClips = await page.locator(".polaroid video").evaluateAll((videos) =>
        videos.length > 0 && videos.every((video) => video.paused && !video.controls));
      check("320px touch navigation jumps to memories while reduced-motion clips stay still",
        touchedMemory && stillClips);
    }
    check(`${viewport.width}x${viewport.height} touch opening fits paper and greeting inside the screen`,
      await page.evaluate(() => window.__compactHero.open?.fits === true));
    check(`${viewport.width}x${viewport.height} has no horizontal overflow or browser errors`,
      errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), errors.join(" | "));
    await shot(page, `${viewport.width}x${viewport.height}-compact-check`);
    await context.close();
  }
}

build();
if (existsSync(SHOTS)) rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const server = await serve();

// Prefer the system Google Chrome so nothing has to be downloaded; fall back to
// Playwright's bundled Chromium if `npx playwright install chromium` has been run.
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: !headed });
  console.log("· using system Google Chrome");
} catch {
  browser = await chromium.launch({ headless: !headed });
  console.log("· using Playwright Chromium");
}

let fatal = null;
try {
  for (const vp of VIEWPORTS) await runViewport(browser, vp);
  await runReducedMotion(browser);
  await runCompactScreens(browser);
} catch (e) {
  fatal = e;
} finally {
  await browser.close();
  if (!args.includes("--keep-server")) server.kill();
}

console.log("\n" + results.join("\n"));
console.log(`\nscreenshots → ${SHOTS}`);
if (fatal) console.error(`\nRUN ERROR: ${fatal.stack || fatal.message}`);
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures || fatal ? 1 : 0);
