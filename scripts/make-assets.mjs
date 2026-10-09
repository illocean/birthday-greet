// Generates every binary PLACEHOLDER asset, using nothing but the Node stdlib
// plus ffmpeg. No network, no image/audio library, no dependency.
//
//   public/photos/photo-1..6.webp   pastel out-of-focus placeholders, labelled
//   public/photos/photo-1,2,4,6.mp4 short looping gradient clips for the video slots
//   public/audio/sfx/*.mp3          eight synthesised sound effects
//
// Everything it writes is meant to be OVERWRITTEN by the sender. Run it again if
// you ever want the placeholders back. See README.md for the swap-in list.
//
// The song (public/audio/song.mp3) is generated separately by
// scripts/make-placeholder-audio.mjs and is left alone by this script.

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS = resolve(ROOT, "public/photos");
const SFX = resolve(ROOT, "public/audio/sfx");
const TMP = resolve(ROOT, ".assets-build");

const ffmpeg = (...args) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });

// ── deterministic RNG ────────────────────────────────────────────────────────
// Fixed seed: regenerating the placeholders must give byte-identical files, or
// every `git status` after a rerun shows phantom diffs.
let seed = 0x2f6e2b1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.7;

// ── PNG writer ───────────────────────────────────────────────────────────────
// Node's zlib is enough to emit a valid PNG by hand, which is the only reason
// this file needs no image dependency.
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

/** rgb: Uint8Array of w*h*3. Writes an 8-bit truecolour PNG. */
function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}

// ── placeholder photos ───────────────────────────────────────────────────────
// Deliberately abstract and out-of-focus: a real photo of a person must never
// be faked by this generator, so it produces soft pastel blobs instead. The
// "placeholder" word is burned into the corner on purpose — a forgotten
// placeholder shipping inside a birthday gift is the worst possible outcome.
const CREAM = [0xff, 0xfa, 0xf7];
const BLUSH = [0xfd, 0xe8, 0xee];
const BLUSH200 = [0xf9, 0xd3, 0xde];
const ROSE = [0xf4, 0xb3, 0xc6];
const ROSE400 = [0xec, 0x93, 0xae];
const SAGE = [0xee, 0xf3, 0xe4];
const INK = [0x5a, 0x3a, 0x46];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function photo(w, h, tint) {
  const px = new Uint8Array(w * h * 3);

  // Background: a vertical wash from cream down into the tint.
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const row = mix(CREAM, tint, 0.15 + t * 0.5);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      px[i] = row[0]; px[i + 1] = row[1]; px[i + 2] = row[2];
    }
  }

  // Soft blobs — the "out of focus photograph" read.
  const blobs = 7 + (rnd() * 5) | 0;
  const palette = [BLUSH200, ROSE, ROSE400, SAGE, BLUSH, CREAM];
  for (let b = 0; b < blobs; b++) {
    const cx = rnd() * w;
    const cy = rnd() * h * 0.9;
    const rad = (0.18 + rnd() * 0.34) * Math.min(w, h);
    const col = palette[(rnd() * palette.length) | 0];
    const strength = 0.25 + rnd() * 0.4;
    const x0 = Math.max(0, (cx - rad) | 0), x1 = Math.min(w, (cx + rad + 1) | 0);
    const y0 = Math.max(0, (cy - rad) | 0), y1 = Math.min(h, (cy + rad + 1) | 0);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d >= 1) continue;
        // smoothstep falloff keeps the blob edge invisible
        const f = (1 - d) * (1 - d) * (3 - 2 * (1 - d)) * strength;
        const i = (y * w + x) * 3;
        px[i] = clamp255(px[i] + (col[0] - px[i]) * f);
        px[i + 1] = clamp255(px[i + 1] + (col[1] - px[i + 1]) * f);
        px[i + 2] = clamp255(px[i + 2] + (col[2] - px[i + 2]) * f);
      }
    }
  }

  // Vignette, warm rather than neutral grey.
  const cx0 = w / 2, cy0 = h / 2, maxd = Math.hypot(cx0, cy0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx0, y - cy0) / maxd;
      const f = Math.max(0, d - 0.55) * 0.5;
      const i = (y * w + x) * 3;
      px[i] = clamp255(px[i] * (1 - f) + 90 * f);
      px[i + 1] = clamp255(px[i + 1] * (1 - f) + 66 * f);
      px[i + 2] = clamp255(px[i + 2] * (1 - f) + 78 * f);
    }
  }

  // Corner label. 5x7 bitmap glyphs — no font file needed, no measurement risk.
  const GLYPH = {
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  };
  const text = "PLACEHOLDER";
  const s = Math.max(1, Math.round(w / 190));
  const gw = 6 * s, gap = s;
  const tw = text.length * gw + (text.length - 1) * gap;
  const ox = w - tw - Math.round(w * 0.04);
  const oy = h - 7 * s - Math.round(h * 0.05);
  for (let ci = 0; ci < text.length; ci++) {
    const g = GLYPH[text[ci]];
    if (!g) continue;
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (g[ry][rx] !== "1") continue;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const x = ox + ci * (gw + gap) + rx * s + dx;
            const y = oy + ry * s + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const i = (y * w + x) * 3;
            // 55% ink over the image: readable, never a black slab.
            px[i] = clamp255(px[i] * 0.45 + INK[0] * 0.55);
            px[i + 1] = clamp255(px[i + 1] * 0.45 + INK[1] * 0.55);
            px[i + 2] = clamp255(px[i + 2] * 0.45 + INK[2] * 0.55);
          }
        }
      }
    }
  }
  return px;
}

// ── audio ────────────────────────────────────────────────────────────────────
const SR = 44100;

/** Float buffer → 16-bit mono WAV → mp3. */
function toMp3(name, buf, bitrate = "128k") {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const wav = Buffer.alloc(44 + data.length);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + data.length, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(data.length, 40); data.copy(wav, 44);
  const wavPath = resolve(TMP, `${name}.wav`);
  writeFileSync(wavPath, wav);
  ffmpeg("-i", wavPath, "-codec:a", "libmp3lame", "-b:a", bitrate, "-ar", String(SR), "-ac", "1", resolve(SFX, `${name}.mp3`));
  rmSync(wavPath, { force: true });
}

const secs = (n) => Math.round(n * SR);
const white = (n) => Float64Array.from({ length: n }, gauss);

/** One-pole low-pass. Paper is mostly high-mid, so this is the "material". */
function lowpass(x, hz) {
  const a = Math.exp((-2 * Math.PI * hz) / SR);
  const y = new Float64Array(x.length);
  let p = 0;
  for (let i = 0; i < x.length; i++) { p = (1 - a) * x[i] + a * p; y[i] = p; }
  return y;
}

/** One-pole high-pass, for removing the DC/rumble a paper burst leaves behind. */
function highpass(x, hz) {
  const lp = lowpass(x, hz);
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] - lp[i];
  return y;
}

/** Exponential decay envelope with a short linear attack (no click on onset). */
function env(n, atkSec, decay) {
  const e = new Float64Array(n);
  const atk = Math.max(1, secs(atkSec));
  for (let i = 0; i < n; i++) e[i] = i < atk ? i / atk : Math.exp((-decay * (i - atk)) / SR);
  return e;
}

const mul = (x, e, g = 1) => { const y = new Float64Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * e[i] * g; return y; };
const add = (...xs) => { const n = xs[0].length; const y = new Float64Array(n); for (const x of xs) for (let i = 0; i < n; i++) y[i] += x[i]; return y; };

/**
 * Crossfade the tail over the head so a noise-based loop has no seam.
 * Standard trick: the last XF samples are blended toward the first XF samples,
 * and the file ends early by XF so total length stays exactly `n`.
 */
function seamless(x, xfSec = 0.25) {
  const xf = Math.min(secs(xfSec), x.length >> 2);
  const y = x.slice(0, x.length - xf);
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    y[y.length - xf + i] = x[x.length - xf + i] * (1 - t) + x[i] * t;
  }
  return y;
}

function normalise(x, dbfs = -1.5) {
  let peak = 0;
  for (const s of x) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 10 ** (dbfs / 20) / peak : 0;
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * g;
  // taper both ends to zero: guarantees silence at every file boundary
  const f = Math.min(secs(0.01), x.length >> 2);
  for (let i = 0; i < f; i++) { y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / f); y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / f); }
  return y;
}

// Each sfx: a paper-ish material plus a gesture-specific shape.

// flap — envelope flap: a broad paper whoosh, mid-band, swelling then falling.
function flap() {
  const n = secs(0.55);
  let x = lowpass(white(n), 2600);
  x = mul(x, env(n, 0.05, 9));
  // a low thump as the flap lands
  const body = new Float64Array(n);
  for (let i = 0; i < n; i++) body[i] = Math.sin((2 * Math.PI * 85 * i) / SR) * Math.exp((-14 * i) / SR);
  return normalise(add(mul(x, env(n, 0.03, 3), 1), mul(body, env(n, 0.002, 14), 0.5)));
}

// slide — card sliding out of the envelope: longer, smoother, brighter sweep.
function slide() {
  const n = secs(0.7);
  let x = mul(white(n), env(n, 0.12, 5));
  x = lowpass(x, 3400);
  // gentle rising resonance so it reads as motion, not just noise
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] * (1 + 0.35 * Math.sin((2 * Math.PI * 220 * i) / SR));
  return normalise(y, -3);
}

// pop — confetti pop: a short pitched blip, pitch dropping as it decays.
function pop() {
  const n = secs(0.28);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 520 * Math.exp(-9 * t) + 90; // falling pitch
    y[i] = Math.sin(2 * Math.PI * f * t);
  }
  return normalise(add(mul(y, env(n, 0.004, 16)), mul(lowpass(white(secs(0.02)), 6000), env(secs(0.02), 0.0005, 90), 0.35)));
}

// needle — stylus drop: a click, then the tiniest hint of surface noise.
function needle() {
  const n = secs(0.22);
  const click = mul(lowpass(white(secs(0.03)), 5200), env(secs(0.03), 0.0005, 110), 1);
  const ring = new Float64Array(n);
  for (let i = 0; i < n; i++) ring[i] = Math.sin((2 * Math.PI * 1400 * i) / SR) * Math.exp((-40 * i) / SR);
  return normalise(add(new Float64Array(n).map((_, i) => (i < click.length ? click[i] : 0)), mul(ring, env(n, 0.001, 40), 0.3)));
}

// crackle — looping vinyl surface noise: sparse pops over a quiet noise floor.
function crackle() {
  const n = secs(4.0);
  const floor = mul(lowpass(white(n), 1500), new Float64Array(n).fill(1), 0.05);
  const y = Float64Array.from(floor);
  const pops = 260;
  for (let p = 0; p < pops; p++) {
    const at = (rnd() * (n - 2000)) | 0;
    const len = secs(0.0006 + rnd() * 0.002);
    const amp = 0.25 + rnd() * 0.75;
    for (let i = 0; i < len && at + i < n; i++) {
      y[at + i] += gauss() * amp * Math.exp((-i / (len * 0.4)));
    }
  }
  return normalise(seamless(y, 0.3), -9); // quiet by design: sits at volume 0.12
}

// snap — soft paper snap: the tightest, brightest burst in the set.
function snap() {
  const burst = highpass(white(secs(0.05)), 1800);
  return normalise(mul(burst, env(secs(0.05), 0.0004, 120), 1), -3);
}

// paper-unfold — a long crinkle: several rustles, not one continuous hiss.
function paperUnfold() {
  const total = secs(1.5);
  const y = new Float64Array(total);
  const bursts = 5;
  for (let b = 0; b < bursts; b++) {
    const len = secs(0.18 + rnd() * 0.22);
    const at = ((b / bursts) * (total - len) * (0.6 + rnd() * 0.7)) | 0;
    const src = lowpass(white(len), 2200 + rnd() * 1800);
    const e = env(len, 0.02, 16);
    const g = 0.5 + rnd() * 0.5;
    for (let i = 0; i < len && at + i < total; i++) y[at + i] += src[i] * e[i] * g;
  }
  return normalise(y, -4);
}

// chime — soft bell: inharmonic partials, each with its own decay.
function chime() {
  const n = secs(2.2);
  const partials = [[1, 1, 1.1], [2.02, 0.42, 1.7], [2.98, 0.24, 2.4], [4.11, 0.13, 3.2], [5.43, 0.07, 4.4]];
  const f0 = 660;
  const y = new Float64Array(n);
  for (const [mult, gain, decay] of partials) {
    const d = n - secs(0.01);
    for (let i = 0; i < d; i++) y[i] += Math.sin((2 * Math.PI * f0 * mult * i) / SR) * gain * Math.exp((-decay * i) / SR);
  }
  return normalise(mul(y, env(n, 0.006, 0.55)), -3);
}

// ── run ──────────────────────────────────────────────────────────────────────
mkdirSync(PHOTOS, { recursive: true });
mkdirSync(SFX, { recursive: true });
mkdirSync(TMP, { recursive: true });

const TINTS = [BLUSH200, ROSE, ROSE400, BLUSH, SAGE, ROSE400];
const W = 1200, H = 900; // → ffmpeg lands the long side at 1400 with q80 WebP

for (let i = 1; i <= 6; i++) {
  const name = `photo-${i}`;
  writePNG(resolve(TMP, `${name}.png`), W, H, photo(W, H, TINTS[i - 1]));
  // -vf scale bounds the long side; the brief caps photos at 1400px, q80.
  ffmpeg("-i", resolve(TMP, `${name}.png`), "-vf", `scale='if(gt(iw,ih),1400,-1)':'if(gt(iw,ih),-1,1400)'`, "-quality", "80", resolve(PHOTOS, `${name}.webp`));
  rmSync(resolve(TMP, `${name}.png`), { force: true });
  console.log(`wrote public/photos/${name}.webp`);
}

// ── placeholder clips ────────────────────────────────────────────────────────
// Four default slots are `.mp4`, so the placeholder set ships with short
// looping gradient clips as well as stills — otherwise the gallery would
// demonstrate no clip slot at all. Played forward and then reversed
// (split → reverse → concat), so the loop point is seamless; a fixed seed
// keeps a rerun byte-identical like every other file this script writes.
const hex = (c) => c.map((v) => v.toString(16).padStart(2, "0")).join("");
const CLIPS = { 1: BLUSH200, 2: ROSE, 4: ROSE400, 6: ROSE400 };
for (const [slot, tint] of Object.entries(CLIPS)) {
  ffmpeg(
    "-f", "lavfi",
    "-i", `gradients=s=${W}x${H}:r=24:d=4:seed=42:speed=0.015:c0=0x${hex(tint)}:c1=0x${hex(CREAM)}`,
    "-filter_complex", "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,format=yuv420p[v]",
    "-map", "[v]", "-c:v", "libx264", "-crf", "30", "-movflags", "+faststart",
    resolve(PHOTOS, `photo-${slot}.mp4`),
  );
  console.log(`wrote public/photos/photo-${slot}.mp4`);
}

const SFX_MAP = { flap, slide, pop, needle, crackle, snap, "paper-unfold": paperUnfold, chime };
for (const [name, fn] of Object.entries(SFX_MAP)) {
  toMp3(name, fn());
  console.log(`wrote public/audio/sfx/${name}.mp3`);
}

rmSync(TMP, { recursive: true, force: true });
console.log("\ndone — every file above is a PLACEHOLDER. See README.md for the swap-in list.");