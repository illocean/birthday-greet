import { describe, expect, it } from "vitest";
import { SCENES, scrollLocked, sceneReducer, type Scene } from "./sceneMachine";

const OPEN: { type: "openEnvelope" } = { type: "openEnvelope" };
const CLOSE: { type: "closeEnvelope" } = { type: "closeEnvelope" };
const CARD_PLAYED: { type: "cardPlayed" } = { type: "cardPlayed" };
const RECORD_PLAYED: { type: "recordPlayed" } = { type: "recordPlayed" };

// The scene list and the scroll-lock boundary are the two things a future edit
// breaks silently: add a sixth scene, reorder one, or unlock scroll one scene
// early and the reader lands at the bottom of a 400vh page with no way back.
// Everything else in this build is layout and copy, verified in a browser.
describe("the five-scene order", () => {
  it("runs envelope -> card -> vinyl -> gallery -> letter, and stops", () => {
    expect(SCENES).toEqual(["envelope", "card", "vinyl", "gallery", "letter"]);
    expect(SCENES).toHaveLength(5);
  });
});

describe("scroll lock", () => {
  it("locks the first three scenes and releases it for the last two", () => {
    // The whole brief in one assertion: the story plays itself through the
    // envelope, the card and the record, and only then does the reader take
    // over. Filtering the list rather than checking each scene by hand means a
    // new scene has to declare its own lock or this fails.
    expect(SCENES.filter((scene) => scrollLocked(scene))).toEqual([
      "envelope",
      "card",
      "vinyl",
    ]);
    expect(SCENES.filter((scene) => !scrollLocked(scene))).toEqual([
      "gallery",
      "letter",
    ]);
  });

  it("locks every scene the reader must not be able to scroll past", () => {
    for (const scene of ["envelope", "card", "vinyl"] as Scene[]) {
      expect(scrollLocked(scene)).toBe(true);
    }
  });

  it("releases the scroll for the two scroll-driven scenes", () => {
    expect(scrollLocked("gallery")).toBe(false);
    expect(scrollLocked("letter")).toBe(false);
  });

  it("holds scene three until the turntable itself releases the scroll", () => {
    // The missing second argument is the whole point. Until the turntable's
    // timeline opens, nothing unlocks anything — which is what stops a stray
    // scroll during the sleeve slide from stranding the record half way out.
    expect(scrollLocked("vinyl")).toBe(true);
    expect(scrollLocked("vinyl", true)).toBe(false);
  });

  it("needs the release for every other scene too, so one cannot be assumed", () => {
    // A single flag rather than a per-scene unlock state: if a future scene wants
    // the same escape hatch it has to pass the flag, and until it does the
    // default keeps holding.
    expect(SCENES.filter((scene) => scrollLocked(scene, true))).toEqual([]);
  });

  it("fails closed on a scene it does not recognise", () => {
    // Gallery and letter are hundreds of viewport-heights tall. An unrecognised
    // name must not read as "unlocked" — that would dump the reader at the end
    // of the letter before they saw any of it. Locked is the survivable error.
    expect(scrollLocked("carousel" as Scene)).toBe(true);
    expect(scrollLocked("" as Scene)).toBe(true);
    expect(scrollLocked(undefined as unknown as Scene)).toBe(true);
  });
});

describe("openEnvelope", () => {
  it("advances the closed envelope to the card", () => {
    expect(sceneReducer("envelope", OPEN)).toBe("card");
  });

  it("is a no-op from every other scene, so no gesture can skip ahead", () => {
    // The envelope accepts a tap, a drag and a keypress. Two of those can land
    // in the same frame, and the drag also fires a click — if the reducer moved
    // on from wherever it happened to be, the card would be skipped entirely
    // and the reader would start on scene three.
    for (const scene of SCENES.filter((s) => s !== "envelope")) {
      expect(sceneReducer(scene, OPEN)).toBe(scene);
    }
  });

  it("stays on the card however many times it fires", () => {
    let scene = sceneReducer("envelope", OPEN);
    scene = sceneReducer(scene, OPEN);
    scene = sceneReducer(scene, OPEN);
    expect(scene).toBe("card");
  });

  it("only ever lands on a real scene", () => {
    expect(SCENES).toContain(sceneReducer("envelope", OPEN));
  });
});

// Scenes two and three hand off on a timer, not on a gesture. A timer can still
// double-fire — a remount in React strict mode runs effects twice, and a
// visibilitychange handler can replay — so these get the same latch as the
// envelope rather than "advance one step".
describe.each([
  ["closeEnvelope", CLOSE, "card", "envelope"],
  ["cardPlayed", CARD_PLAYED, "card", "vinyl"],
  ["recordPlayed", RECORD_PLAYED, "vinyl", "gallery"],
] as const)("%s", (_name, action, from, to) => {
  it(`advances ${from} to ${to}`, () => {
    expect(sceneReducer(from, action)).toBe(to);
  });

  it("is a no-op from every other scene, so no timer can skip ahead", () => {
    for (const scene of SCENES.filter((s) => s !== from)) {
      expect(sceneReducer(scene, action)).toBe(scene);
    }
  });

  it(`stays on ${to} however many times it fires`, () => {
    let scene = sceneReducer(from, action);
    scene = sceneReducer(scene, action);
    scene = sceneReducer(scene, action);
    expect(scene).toBe(to);
  });

  it("only ever lands on a real scene", () => {
    expect(SCENES).toContain(sceneReducer(from, action));
  });
});

describe("the three self-playing scenes advance in order", () => {
  it("walks envelope -> card -> vinyl -> gallery and stops at the reader's scenes", () => {
    let scene = sceneReducer("envelope", OPEN);
    expect(scene).toBe("card");
    scene = sceneReducer(scene, CARD_PLAYED);
    expect(scene).toBe("vinyl");
    scene = sceneReducer(scene, RECORD_PLAYED);
    expect(scene).toBe("gallery");
    // Nothing plays scene four onward. The reader scrolls.
    expect(sceneReducer(scene, OPEN)).toBe("gallery");
    expect(sceneReducer(scene, CARD_PLAYED)).toBe("gallery");
    expect(sceneReducer(scene, RECORD_PLAYED)).toBe("gallery");
  });
});
