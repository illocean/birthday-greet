import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SOUNDS, type SoundName } from "./audio";

// Volume is the one part of the audio layer that is pure data, so it is the one
// part worth pinning. Getting it wrong is not a crash: it is a song that drowns
// the crackle under it, or an effects pass loud enough to be startling on a
// phone speaker — which no browser check will ever catch.
describe("the sound table", () => {
  it("holds every sound the five scenes call for", () => {
    expect(Object.keys(SOUNDS).sort()).toEqual([
      "background",
      "chime",
      "crackle",
      "flap",
      "needle",
      "paper-unfold",
      "pop",
      "slide",
      "snap",
      "song",
    ]);
  });

  it("keeps the song at 0.6, under nothing and over everything", () => {
    // The record is fixed at this level: unlike the bed it has no runtime knob,
    // so pinning the number is the point.
    expect(SOUNDS.song.volume).toBe(0.6);
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      if (name === "song") continue;
      expect(SOUNDS[name].volume).toBeLessThan(SOUNDS.song.volume);
    }
  });

  it("holds the background bed below the effects it runs under", () => {
    // It plays from the first moment of the visit, so everything else lands on
    // top of it. Louder than an effect and the whole page sits behind the bed.
    expect(SOUNDS.background.volume).toBeLessThan(SOUNDS.flap.volume);
    expect(SOUNDS.background.volume).toBeLessThan(SOUNDS.song.volume);
    expect(SOUNDS.background.volume).toBeGreaterThan(0);
  });

  it("holds the crackle bed at 0.12 — felt, not heard", () => {
    // It runs under the whole record. Anything louder and it is noise between
    // her and the song, which is the opposite of what vinyl is for.
    expect(SOUNDS.crackle.volume).toBe(0.12);
  });

  it("keeps every effect in the 0.3-0.5 band", () => {
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      if (name === "song" || name === "crackle" || name === "background") continue;
      expect(SOUNDS[name].volume).toBeGreaterThanOrEqual(0.3);
      expect(SOUNDS[name].volume).toBeLessThanOrEqual(0.5);
    }
  });

  it("loops only the three sounds that have to run longer than they last", () => {
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      const shouldLoop = name === "song" || name === "crackle" || name === "background";
      expect(SOUNDS[name].loop).toBe(shouldLoop);
    }
  });

  it("keeps the two tracks in separate files, both at the audio root", () => {
    // Two loops from one file would be one Howl fighting itself. Distinct paths
    // is what keeps `song` and `background` independently replaceable.
    expect(SOUNDS.song.src).not.toBe(SOUNDS.background.src);
    expect(SOUNDS.song.src).toMatch(/^audio\/[a-z-]+\.mp3$/);
    expect(SOUNDS.background.src).toMatch(/^audio\/[a-z-]+\.mp3$/);
  });

  it("points every sound at a relative path under public/audio", () => {
    // Absolute paths resolve against the origin root and 404 on any sub-path
    // deploy. Public files are copied verbatim, so Vite never rewrites these.
    // The song is the one file at the root of `audio/`; effects live in `sfx/`.
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      expect(SOUNDS[name].src).toMatch(/^audio\/(?:sfx\/)?[a-z-]+\.mp3$/);
    }
  });

  it("points every sound at a file that is actually on disk", () => {
    // This is the check that catches a moved directory. The path-shape assertion
    // above is satisfied by `/audio/nonsense/nope.mp3` just as happily as by a
    // real file, which is why all eight effects were 404ing while it passed:
    // the table said `audio/flap.mp3` and the file was at `audio/sfx/flap.mp3`.
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      const url = new URL(`../public/${SOUNDS[name].src}`, import.meta.url);
      expect(
        existsSync(fileURLToPath(url)),
        `${name} -> public/${SOUNDS[name].src} does not exist`,
      ).toBe(true);
    }
  });
});

// One set of fakes for the whole file, reset per case. `audio.ts` keeps its
// state in module scope, so each case needs its own import to start from
// nothing; the mocks live out here only so both cases can share them.
const instances = new Map<string, MockHowl>();
const listeners = new Map<string, () => void>();
const tab = {
  hidden: false,
  addEventListener: (event: string, fn: () => void) => { listeners.set(event, fn); },
  removeEventListener: (event: string, fn: () => void) => {
    if (listeners.get(event) === fn) listeners.delete(event);
  },
};
const globalAudio = { mute: vi.fn(), ctx: { state: "running" as string, resume: vi.fn(async () => {}) } };
let storage = new Map<string, string>();

class MockHowl {
  ready = "loaded";
  active = false;
  position = 0;
  level: number;
  fades = 0;
  constructor(options: { src: string[]; volume: number }) {
    this.level = options.volume;
    instances.set(options.src[0], this);
  }
  load() { return this; }
  state() { return this.ready; }
  playing() { return this.active; }
  play = vi.fn(() => { this.active = true; return 1; });
  stop = vi.fn(() => { this.active = false; this.position = 0; return this; });
  pause = vi.fn(() => { this.active = false; return this; });
  seek = vi.fn((position: number) => { this.position = position; return this; });
  volume(value?: number) { if (value === undefined) return this.level; this.level = value; return this; }
  fade(_from: number, to: number) { this.fades++; this.level = to; return this; }
  once() { return this; }
  off() { return this; }
}

/** Fresh module, fakes and storage, with the mute preference seeded. */
async function importAudio(seedMuted: boolean) {
  storage = new Map(seedMuted ? [["birthday-sound-muted", "true"]] : []);
  instances.clear();
  listeners.clear();
  tab.hidden = false;
  globalAudio.ctx.state = "running";
  globalAudio.mute.mockClear();
  globalAudio.ctx.resume.mockClear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("document", tab);
  vi.doMock("howler", () => ({ Howl: MockHowl, Howler: globalAudio }));
  vi.resetModules();
  return import("./audio");
}

/** Let a `resumeContext().then(...)` chain run out without changing the state. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function releaseAudio(): void {
  vi.doUnmock("howler");
  vi.unstubAllGlobals();
}

it("restarts effects without overlap, resumes one music loop, and retains mute", async () => {
  try {
    const audio = await importAudio(true);
    expect(audio.isMuted()).toBe(true);
    await audio.preloadAudio();
    expect(globalAudio.mute).toHaveBeenLastCalledWith(true);
    audio.setMuted(false);
    expect(storage.get("birthday-sound-muted")).toBe("false");
    audio.primeAudio();
    expect(globalAudio.ctx.resume).not.toHaveBeenCalled();

    const flap = instances.get(SOUNDS.flap.src)!;
    const slide = instances.get(SOUNDS.slide.src)!;
    audio.playSfx("flap");
    flap.position = 0.4;
    audio.playSfx("flap");
    expect(flap.seek).toHaveBeenLastCalledWith(0);
    expect(flap.position).toBe(0);
    audio.playSfx("slide");
    expect(flap.active).toBe(false);
    expect(slide.active).toBe(true);
    slide.ready = "loading";
    audio.playSfx("slide");
    expect(slide.play).toHaveBeenCalledTimes(1);
    slide.ready = "loaded";
    globalAudio.ctx.state = "suspended";
    audio.playSfx("pop");
    expect(instances.get(SOUNDS.pop.src)!.play).not.toHaveBeenCalled();
    globalAudio.ctx.state = "running";

    audio.startSong();
    audio.startSong();
    audio.setCrackle(true);
    audio.setCrackle(true);
    audio.startBackground();
    audio.startBackground();
    const song = instances.get(SOUNDS.song.src)!;
    const crackle = instances.get(SOUNDS.crackle.src)!;
    const bed = instances.get(SOUNDS.background.src)!;
    expect(song.play).toHaveBeenCalledTimes(1);
    expect(crackle.play).toHaveBeenCalledTimes(1);
    expect(bed.play).toHaveBeenCalledTimes(1);
    // The bed wants to be heard the instant it is allowed, so it comes up at
    // its own level with no fade. A 2.5s ramp here is the whole difference
    // between "playing" and "not playing" to anyone opening the page.
    expect(bed.level).toBe(SOUNDS.background.volume);
    expect(bed.fades).toBe(0);
    // The bed's loudness knob, live, and clamped at both ends. The record has
    // no such knob — its level is the table, and the bed starting is not the
    // song starting.
    audio.setBackgroundVolume(0.3);
    expect(bed.level).toBe(0.3);
    expect(song.level).toBe(0.6);
    // The record still fades up; only the bed stopped.
    expect(song.fades).toBe(1);
    audio.setBackgroundVolume(2);
    expect(bed.level).toBe(1);
    song.position = 12;
    tab.hidden = true;
    listeners.get("visibilitychange")!();
    tab.hidden = false;
    listeners.get("visibilitychange")!();
    await Promise.resolve();
    expect(song.play).toHaveBeenCalledTimes(2);
    expect(crackle.play).toHaveBeenCalledTimes(2);
    expect(bed.play).toHaveBeenCalledTimes(2);
    expect(song.position).toBe(12);
    audio.stopSfx();
    expect(song.active).toBe(true);
    expect(crackle.active).toBe(true);
    expect(bed.active).toBe(true);
    audio.setMuted(true);
    audio.playSfx("pop");
    expect(instances.get(SOUNDS.pop.src)!.play).not.toHaveBeenCalled();
    expect(storage.get("birthday-sound-muted")).toBe("true");
  } finally {
    releaseAudio();
  }
});

/**
 * The load-time path, which is the one the brief actually asks about: the bed
 * has to be running the instant the browser permits sound.
 */
it("brings the bed up at full level on the first input, not on a click", async () => {
  try {
    const audio = await importAudio(false);
    await audio.preloadAudio(["background"]);
    const bed = instances.get(SOUNDS.background.src)!;

    // Every browser on load: the file is decoded, the context is suspended, and
    // the bed cannot be heard yet.
    globalAudio.ctx.state = "suspended";
    audio.startBackground();
    await flush();
    expect(bed.play).not.toHaveBeenCalled();
    // Armed past a click, because Chrome counts a bare mouse move as activation
    // and a reader who only moves the mouse should still get the bed.
    expect(listeners.has("pointermove")).toBe(true);
    expect(listeners.has("pointerdown")).toBe(true);
    expect(listeners.has("keydown")).toBe(true);

    globalAudio.ctx.state = "running";
    listeners.get("pointermove")!();
    await flush();
    expect(bed.play).toHaveBeenCalledTimes(1);
    // Full level, no ramp — a 2.5s fade is what "not playing" looks like to
    // someone opening the page.
    expect(bed.level).toBe(SOUNDS.background.volume);
    expect(bed.fades).toBe(0);
    // One-shot: the listeners come off, so later input cannot restart it.
    expect(listeners.size).toBe(0);
  } finally {
    releaseAudio();
  }
});
