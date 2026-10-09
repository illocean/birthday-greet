import { Howl, Howler } from "howler";
import { song as songContent } from "./content";

/**
 * One volume table for the whole build, so the mix is decided in one place.
 *
 *  - song at 0.6: under nothing.
 *  - background at 0.25: it runs under the *whole* visit, scenes one through
 *    five, so it sits below the effects rather than among them.
 *  - effects at 0.3-0.5: audible on a phone speaker without startling anyone.
 *  - crackle at 0.12: it runs under the entire record, so it has to be felt
 *    rather than heard, or it is just noise between her and the music.
 *
 * Two tracks, two jobs. `song` is the record she puts on in scene three and
 * belongs to the needle drop in `VinylStage`. `background` is the bed under
 * everything else and starts on load. The song's path comes from content.ts, so
 * swapping the track stays a one-file edit for whoever sends this; the bed's
 * loudness is `setBackgroundVolume`, because that level is a per-deploy
 * preference rather than a mix decision.
 */
export const SOUNDS = {
  song: { src: songContent.src, volume: 0.6, loop: true },
  background: { src: "audio/background.mp3", volume: 0.25, loop: true },
  // Effects live in `public/audio/sfx/`, the two tracks at the root of `public/audio/`.
  // `audio.test.ts` asserts that every one of these resolves to a real file, so
  // the two directories cannot drift apart again without the test failing.
  flap: { src: "audio/sfx/flap.mp3", volume: 0.5, loop: false },
  slide: { src: "audio/sfx/slide.mp3", volume: 0.4, loop: false },
  pop: { src: "audio/sfx/pop.mp3", volume: 0.45, loop: false },
  needle: { src: "audio/sfx/needle.mp3", volume: 0.5, loop: false },
  crackle: { src: "audio/sfx/crackle.mp3", volume: 0.12, loop: true },
  snap: { src: "audio/sfx/snap.mp3", volume: 0.4, loop: false },
  "paper-unfold": { src: "audio/sfx/paper-unfold.mp3", volume: 0.4, loop: false },
  chime: { src: "audio/sfx/chime.mp3", volume: 0.45, loop: false },
} satisfies Record<string, { src: string; volume: number; loop: boolean }>;

export type SoundName = keyof typeof SOUNDS;

// Howler registers its native gesture unlock when the first Howl is created.
// Decode ahead of the animation; do not queue a late one-shot behind its cue.
const howls = new Map<SoundName, Howl>();
let wantSong = false;
let wantCrackle = false;
let wantBackground = false;
let suspended = false;
let visibilityInstalled = false;
let muted = false;
let muteLoaded = false;
let backgroundVolume = SOUNDS.background.volume;
let unlockArmed = false;
const MUTE_KEY = "birthday-sound-muted";

/** The two beds that loop for as long as the page is open, not one-shots. */
const LOOPS: readonly SoundName[] = ["song", "crackle", "background"];

export function isMuted(): boolean {
  if (!muteLoaded) {
    muteLoaded = true;
    try { muted = localStorage.getItem(MUTE_KEY) === "true"; } catch { /* Storage can be unavailable. */ }
  }
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  muteLoaded = true;
  Howler.mute(value);
  if (value) stopSfx();
  try { localStorage.setItem(MUTE_KEY, String(value)); } catch { /* Keep the in-session choice. */ }
}

async function resumeContext(): Promise<void> {
  const ctx = Howler.ctx;
  if (ctx && (ctx.state === "suspended" || (ctx.state as string) === "interrupted")) {
    await ctx.resume().catch(() => {});
  }
}

function howlFor(name: SoundName): Howl {
  const existing = howls.get(name);
  if (existing) return existing;

  const spec = SOUNDS[name];
  const howl = new Howl({
    src: [spec.src],
    loop: spec.loop,
    // The record fades up from silence, so it is born at 0 and `startSong` is
    // what brings it up. The bed does not fade: it is wanted at full the instant
    // the browser allows it, so it is born at its own level. An effect is at its
    // level the instant it plays, because waiting would land it behind its cue.
    volume: name === "song" ? 0 : spec.volume,
    html5: false,
    preload: false,
    onload: () => {
      if (name === "song" && wantSong && !suspended) startSong();
      if (name === "crackle" && wantCrackle && !suspended) setCrackle(true);
      if (name === "background" && wantBackground && !suspended) startBackground();
    },
    onloaderror: () => {
      howl.unload();
      howls.delete(name);
    },
  });

  howls.set(name, howl);
  howl.load();
  return howl;
}

/** Missing audio resolves silently, so it cannot strand the envelope. */
export async function preloadAudio(names = Object.keys(SOUNDS) as SoundName[]): Promise<void> {
  Howler.mute(isMuted());
  await Promise.all(names.map((name) => {
    const howl = howlFor(name);
    if (howl.state() !== "loading") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        howl.off("load", done);
        howl.off("loaderror", done);
        resolve();
      };
      howl.once("load", done);
      howl.once("loaderror", done);
    });
  }));
}

/** Silence everything while the tab is in the background, and pick it back up. */
function installVisibilityGuard(): void {
  if (visibilityInstalled) return;
  visibilityInstalled = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      suspended = true;
      stopSfx();
      for (const name of LOOPS) {
        const howl = howls.get(name);
        if (howl?.playing()) howl.pause();
      }
      return;
    }
    if (!suspended) return;
    suspended = false;
    void resumeContext().then(() => {
      if (suspended || (Howler.ctx && Howler.ctx.state !== "running")) return;
      if (wantSong) startSong();
      if (wantCrackle) setCrackle(true);
      if (wantBackground) startBackground();
    });
  });
}

/** Resume inside the real gesture; Howler's native unlock supplies silent audio. */
export function primeAudio(): Promise<void> {
  howlFor("flap");
  Howler.mute(isMuted());
  installVisibilityGuard();
  return resumeContext();
}

export function stopSfx(): void {
  for (const [name, howl] of howls) {
    if (!SOUNDS[name].loop && howl.state() === "loaded") howl.stop();
  }
}

/** One-shot effect. Silent if the file is missing or will not decode. */
export function playSfx(name: SoundName): void {
  if (isMuted() || suspended || SOUNDS[name].loop) return;
  const howl = howlFor(name);
  if (howl.state() !== "loaded" || (Howler.ctx && Howler.ctx.state !== "running")) return;
  stopSfx();
  howl.seek(0);
  howl.play();
}

/**
 * The bed under the whole visit, started the moment the page loads.
 *
 * Browsers will not make noise before a gesture, so a load-time `startBackground`
 * lands on a suspended context and bails. Arm the first real input instead of
 * failing: the bed then begins the moment the browser allows it, at full level
 * with no fade, which on this site is her opening the envelope — the first thing
 * she touches anyway.
 */
export function startBackground(): void {
  wantBackground = true;
  if (suspended) return;
  const bed = howlFor("background");
  if (bed.state() !== "loaded" || bed.playing()) return;
  if (Howler.ctx && Howler.ctx.state !== "running") {
    armFirstGesture();
    void resumeContext().then(() => {
      if (wantBackground && !suspended && Howler.ctx.state === "running") startBackground();
    });
    return;
  }
  // Volume before play, not a fade after it: `play()` re-reads the howl's own
  // level, so this is the level the bed comes up at.
  bed.volume(backgroundVolume);
  bed.play();
}

/**
 * The bed's loudness, 0-1, applied live. The table's 0.25 is the default; call
 * this to move it. Not persisted — with no control on the page there is no
 * second writer, and a stale stored level would only fight the code.
 */
export function setBackgroundVolume(value: number): void {
  backgroundVolume = Math.min(1, Math.max(0, value));
  const bed = howls.get("background");
  // Only once it is audible: a bed that has not started yet still has its level
  // waiting in `startBackground`, and there is nothing to re-aim.
  if (bed?.state() === "loaded" && bed.playing()) bed.volume(backgroundVolume);
}

/**
 * Browsers will not make noise before a gesture. One-shot listener for the
 * first real input, so a load-time `startBackground` is heard rather than lost.
 *
 * One list, so adding a signal cannot leave the removal half done. `pointermove`,
 * `wheel` and `scroll` are in it because Chrome counts them as activation: a
 * reader who only moves the mouse gets the bed without ever clicking. Safari
 * wants a discrete gesture and will still be waiting, which is all any page is
 * allowed to ask for.
 */
const UNLOCK_EVENTS: readonly string[] = [
  "pointerdown", "pointerup", "click", "keydown",
  "touchstart", "wheel", "scroll", "pointermove",
];

function armFirstGesture(): void {
  if (unlockArmed) return;
  unlockArmed = true;
  const fire = () => {
    unlockArmed = false;
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, fire);
    void resumeContext().then(() => {
      if (wantBackground && !suspended) startBackground();
    });
  };
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, fire, { passive: true });
}

/**
 * The needle drop. Fades the song up to its table volume, starting it only if
 * the decoder has finished. Pausing preserves its existing playback position.
 */
export function startSong(): void {
  wantSong = true;
  if (suspended) return;
  const song = howlFor("song");
  if (song.state() !== "loaded" || song.playing()) return;
  if (Howler.ctx && Howler.ctx.state !== "running") {
    void resumeContext().then(() => {
      if (wantSong && !suspended && Howler.ctx.state === "running") startSong();
    });
    return;
  }
  song.play();
  song.fade(song.volume(), SOUNDS.song.volume, 1200);
}

/** Play/pause for the one control that is allowed on the page. */
export function setSongPlaying(want: boolean): void {
  if (!want) {
    wantSong = false;
    const song = howls.get("song");
    if (song?.state() === "loaded") song.pause();
    return;
  }
  startSong();
}

export function isSongPlaying(): boolean {
  return wantSong && !suspended;
}

/** The crackle bed, for as long as the record is spinning. */
export function setCrackle(on: boolean): void {
  wantCrackle = on;
  const crackle = on ? howlFor("crackle") : howls.get("crackle");
  if (!crackle || crackle.state() !== "loaded") return;
  if (on && Howler.ctx && Howler.ctx.state !== "running") {
    void resumeContext().then(() => {
      if (wantCrackle && !suspended && Howler.ctx.state === "running") setCrackle(true);
    });
    return;
  }
  if (on && !suspended && !crackle.playing()) crackle.play();
  else if (!on) crackle.stop();
}
