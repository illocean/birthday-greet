// The five scenes, in order, and nothing else.
//
// This lives in its own pure module for one reason: the brief's core invariant
// is "five scenes in this order, scroll locked through the first three", and a
// pure function is the cheapest place to pin it. It is a machine, not a mood.

export const SCENES = [
  "envelope",
  "card",
  "vinyl",
  "gallery",
  "letter",
] as const;

export type Scene = (typeof SCENES)[number];

/**
 * The scenes the reader scrolls through themselves. Everything before this
 * point plays on its own — the envelope opens, the card rises, the needle drops
 * — and scrolling away from any of it would leave half a gesture on screen.
 *
 * Stated as the *unlocked* list on purpose. Gallery and letter together run to
 * several hundred viewport-heights, so anything this function does not
 * recognise has to read as locked: an unknown scene that returned `false` would
 * drop the reader at the bottom of the letter before they saw any of it.
 *
 * `unlocked` is scene three releasing the document from inside itself, three
 * seconds after the needle lands. It cannot be a sixth scene, because the record
 * does not go anywhere when the reader scrolls — it docks into the corner and
 * keeps playing — so the release is an input to the predicate rather than a
 * state it walks through. Before that moment it is false for every scene, which
 * is what keeps an early scroll from stranding the turntable mid-swing.
 */
const SCROLL_UNLOCKED: ReadonlySet<Scene> = new Set<Scene>(["gallery", "letter"]);

export function scrollLocked(scene: Scene, unlocked = false): boolean {
  return unlocked ? false : !SCROLL_UNLOCKED.has(scene);
}

export type SceneAction =
  | { type: "openEnvelope" }
  | { type: "closeEnvelope" }
  | { type: "cardPlayed" }
  | { type: "recordPlayed" };

/**
 * Every transition, as (source -> target). Reading the whole machine off one table
 * is why the scene order can be checked without rendering anything.
 *
 * Each transition names its *source* scene rather than being "advance one step",
 * and that is the whole point of the shape. The envelope takes a tap, a drag and
 * a keypress, and a drag also fires a click; scenes two and three hand off from a
 * timer, and a timer double-fires on any remount or replayed visibility handler.
 * Advancing from wherever the machine happens to be would let a second dispatch
 * skip a scene entirely — the card would never be seen, or the record would never
 * spin. Keyed by source, every one of those repeats is a no-op.
 *
 * `recordPlayed` fires on the reader's first scroll in scene three, not on a
 * beat — the record is already playing by then and simply keeps playing, docked
 * and silent of the transition. It is keyed by source for the same reason as the
 * rest: a scroll event can fire many times per gesture, and a wheel tick and a
 * momentum tail can both arrive after the reader has reached the gallery.
 */
const TRANSITIONS: Readonly<Record<SceneAction["type"], [Scene, Scene]>> = {
  openEnvelope: ["envelope", "card"],
  closeEnvelope: ["card", "envelope"],
  cardPlayed: ["card", "vinyl"],
  recordPlayed: ["vinyl", "gallery"],
};

export function sceneReducer(scene: Scene, action: SceneAction): Scene {
  const [from, to] = TRANSITIONS[action.type];
  return scene === from ? to : scene;
}
