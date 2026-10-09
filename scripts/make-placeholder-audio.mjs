// Generates a placeholder music track. One track per run, named by argument:
//
//   node scripts/make-placeholder-audio.mjs             -> public/audio/song.mp3
//   node scripts/make-placeholder-audio.mjs background  -> public/audio/background.mp3
//
// A progression written as float samples with the Node stdlib, then encoded to
// MP3 with ffmpeg. Pure stdlib + ffmpeg, no dependencies. Length is an exact bar
// multiple and the tail is cosine-tapered to zero so the file loops without a
// seam.
//
// One named track per run on purpose: both files are expected to be REPLACED
// with real music by whoever sends this, and a script that wrote both would
// silently destroy a track that had already been swapped in.
//
// `song` is the record she puts on in scene three. `background` is the bed under
// the whole visit — slower, a key lower, sparser, and with a slower decay so the
// notes wash into each other instead of ticking.
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = resolve(ROOT, '.audio-build.wav');

const SR = 44100;
const PEAK_DB = -1.5; // headroom above the MP3 encoder for both
const REST = -1;

// I - vi - IV - V in C major, two bars each.
const CHORDS_C = [
  { root: 130.81, tones: [261.63, 329.63, 392.0] }, // C3 : C4 E4 G4
  { root: 110.0, tones: [220.0, 261.63, 329.63] }, // A2 : A3 C4 E4
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F2 : F3 A3 C4
  { root: 98.0, tones: [196.0, 246.94, 293.66] }, // G2 : G3 B3 D4
];

// F - C - Dm - Bb, a fifth below and with no bright fourths in it.
const CHORDS_F = [
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F2 : F3 A3 C4
  { root: 65.41, tones: [196.0, 261.63, 329.63] }, // C2 : G3 C4 E4
  { root: 73.42, tones: [146.83, 174.61, 220.0] }, // Dm : D3 F3 A3
  { root: 58.27, tones: [146.83, 174.61, 233.08] }, // Bb : D3 F3 Bb3
];

const TRACKS = {
  song: {
    file: 'song.mp3',
    bpm: 96,
    bars: 8,
    chords: CHORDS_C,
    // Eight eighth-notes per bar; the 6th lifts an octave for a little motion.
    figure: [0, 1, 2, 1, 2, 1, 0, 2],
    lift: 5,
    partials: [[1.0, 1.0, 1.6], [2.01, 0.42, 2.4], [3.02, 0.16, 3.4], [5.4, 0.07, 4.6]],
    rootDur: 1.9,
    toneDur: 1.4,
    rootAmp: 0.16,
    // One amplitude per eighth-note, so a re-run reproduces the existing file.
    toneAmp: [0.3, 0.24, 0.24, 0.24, 0.24, 0.2, 0.24, 0.24],
  },
  background: {
    file: 'background.mp3',
    autoplay: true,
    attack: 0,
    release: 0,
    fade: 0,
    bpm: 60,
    bars: 8,
    chords: CHORDS_F,
    figure: [0, REST, 2, REST, 1, REST, 2, REST],
    lift: -1,
    rootAmp: 0.15,
    toneAmp: [0.16, 0, 0.12, 0, 0.14, 0, 0.1, 0]
  },
};

const which = process.argv[2] ?? 'song';
const track = TRACKS[which];
if (!track) {
  console.error(`unknown track "${which}" — expected one of: ${Object.keys(TRACKS).join(', ')}`);
  process.exit(1);
}
const OUT = resolve(ROOT, 'public/audio', track.file);

const BEAT = 60 / track.bpm;
const BAR = BEAT * 4;
const DUR = BAR * track.bars; // an exact bar multiple, so the loop has no seam

const buf = new Float32Array(Math.round(SR * DUR));

// A struck-bar voice: fundamental plus soft overtones, each with its own decay.
const PARTIALS = track.partials;

function pluck(freq, start, dur, amp) {
  const i0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n; i++) {
    const idx = i0 + i;
    if (idx >= buf.length) break;
    const t = i / SR;
    let v = 0;
    for (const [mult, gain, decay] of PARTIALS) {
      v += gain * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * mult * t);
    }
    const atk = Math.min(1, t / 0.004); // 4ms attack: no click
    buf[idx] += v * atk * amp;
  }
}

for (let bar = 0; bar < track.bars; bar++) {
  const chord = track.chords[Math.floor(bar / 2) % track.chords.length];
  const barStart = bar * BAR;
  pluck(chord.root, barStart, track.rootDur, track.rootAmp); // low root under the figure
  for (let s = 0; s < 8; s++) {
    const step = track.figure[s];
    if (step === REST) continue;
    const tone = chord.tones[step];
    const f = s === track.lift ? tone * 2 : tone;
    pluck(f, barStart + s * (BEAT / 2), track.toneDur, track.toneAmp[s]);
  }
}

// Taper the last 40ms to zero so the loop point is a true zero crossing.
const fade = Math.round(0.04 * SR);
for (let i = 0; i < fade; i++) {
  buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
}
buf[buf.length - 1] = 0;
buf[0] = 0;

// Normalise to PEAK_DBFS so the loop has headroom above the MP3 encoder.
let peak = 0;
for (const s of buf) peak = Math.max(peak, Math.abs(s));
const gain = peak > 0 ? 10 ** (PEAK_DB / 20) / peak : 1;

// 16-bit PCM mono WAV.
const dataBytes = buf.length * 2;
const wav = Buffer.alloc(44 + dataBytes);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < buf.length; i++) {
  const s = Math.max(-1, Math.min(1, buf[i] * gain));
  wav.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(TMP, wav);
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', TMP,
  '-codec:a', 'libmp3lame', '-b:a', '128k', '-ar', String(SR), '-ac', '1',
  OUT,
], { stdio: 'inherit' });
if (existsSync(TMP)) rmSync(TMP);

console.log(`wrote ${OUT} (${DUR}s, ${track.bpm} BPM, ${track.bars} bars)`);