// Fetch and prepare the CC0 surface textures.  `npm run textures`
//
// Both textures are from ambientCG (https://ambientcg.com), which releases its
// entire library under CC0 1.0 — public domain, no attribution required. We credit
// it anyway in README.md, because "no attribution required" is not "no attribution
// welcome" and the provenance of a shipped asset should be auditable.
//
//   Fabric061 → src/assets/textures/envelope-linen.webp   the envelope's crosshatch weave
//   Paper005  → src/assets/textures/paper.webp            warm fibrous stock for the letter
//
// Why src/assets/ and not public/: a file in public/ is copied to the output verbatim and
// Vite never rewrites its URL, so a CSS url() aimed at it breaks on any sub-path deploy.
// Under src/assets/ Vite processes, hashes and base-rewrites the reference, which is what
// makes `base: "./"` hold everywhere. The photos and the song must stay in public/ — the
// brief names those paths, and Howler and `<img src>` read them at runtime, unprocessed.
//
// Only the *color* map is taken. The normal map is deliberately skipped: the
// envelope is a CSS/SVG layer, not a 3D mesh, so nothing in this build can consume
// a tangent-space normal map. Downloading it would ship weight with no reader.
//
// Requires ffmpeg on PATH (already a dependency of the asset scripts).

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/assets/textures");
const TMP = resolve(ROOT, ".textures-build");

const ASSETS = [
  {
    id: "Fabric061",
    out: "envelope-linen.webp",
    size: 640,
    quality: 72,
    // Tinted into the palette here, at generation time, rather than in CSS.
    //
    // Two blends were tried first and both fail. `multiply` drags the surface
    // toward the weave's grey mean and turns pastel pink into flat taupe.
    // `soft-light` is mathematically near-invisible on a light backdrop — the
    // backdrop is ~0.95 luma, where soft-light has almost nothing to work with —
    // so the weave vanishes. Neither can be rescued with more tweaking, because
    // the problem is the backdrop's brightness, not the blend's strength.
    //
    // So the colour goes into the pixels. `lutrgb` maps each channel linearly
    // from the source's dark-to-light range onto a pink range of the same
    // *relative* span (~23%), which keeps the thread contrast intact instead of
    // the flattening an offset-only remap would cause. Result: a texture that
    // already is pink linen, and CSS that needs no blend mode at all.
    filter:
      "eq=contrast=1.55:brightness=0.04:saturation=0.6," +
      "lutrgb=r='clip(val*0.341+168,0,255)':" +
      "g='clip(val*0.365+141,0,255)':" +
      "b='clip(val*0.371+145,0,255)'",
    note: "coarse basket weave, tinted to blush-100",
  },
  {
    id: "Paper005",
    out: "paper.webp",
    size: 1024,
    quality: 84,
    // Same reasoning as the linen, and for the same reason it was needed: the
    // colour map from ambientCG is kraft, not stock. Left alone it measured a
    // median of (205, 171, 123) at luma 167, and it turned the whole of scene two
    // tan — a kraft envelope of a card, on a kraft table, in a build whose entire
    // palette is pastel pink on cream. An earlier note here described it as "warm
    // off-white" and was simply wrong.
    //
    // So the colour goes into the pixels again. The slope is 1.6 rather than the
    // linen's 0.32 because paper is not linen: the kraft map's middle 98% spans
    // only ~7/255 per channel, and a sub-unity slope maps that to ~2/255, which
    // quantises the fibre away and produced a 3.3KB flat rectangle. At 1.6 the
    // fibre spans 11–14 levels, still pale at a median of (243, 233, 235), and
    // the darkest foxing marks survive as soft mauve at (190, 181, 182) instead
    // of clipping. Under 1% of pixels hit the white clip.
    filter:
      "eq=contrast=1.12," +
      "lutrgb=r='clip(val*1.6-81,0,255)':" +
      "g='clip(val*1.6-38.6,0,255)':" +
      "b='clip(val*1.6+40.2,0,255)'",
    note: "kraft remapped to pale blush stock — fibre preserved, foxing intact",
  },
];

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

for (const a of ASSETS) {
  const zip = join(TMP, `${a.id}.zip`);
  const dir = join(TMP, a.id);
  console.log(`· ${a.id} — ${a.note}`);

  const res = await fetch(`https://ambientcg.com/get?file=${a.id}_1K-JPG.zip`, {
    headers: { "User-Agent": "texture-fetch" },
  });
  if (!res.ok) { console.error(`  download failed: HTTP ${res.status}`); process.exitCode = 1; continue; }
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

  // Windows ships bsdtar as `tar`, which reads zip; PowerShell's Expand-Archive
  // is the fallback. One of the two is always present.
  try {
    execFileSync("tar", ["-xf", zip, "-C", TMP], { stdio: "inherit" });
  } catch {
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path '${zip}' -DestinationPath '${dir}' -Force`], { stdio: "inherit" });
  }

  // Find the colour map wherever the archive put it.
  const color = findColor(dir, a.id) ?? findColor(TMP, a.id);
  if (!color) { console.error(`  no colour map found for ${a.id}`); process.exitCode = 1; continue; }

  // Resampled with lanczos. The brief caps textures at 2048px; each asset is sized to
  // its own job instead. The weave tiles at 320px in CSS, so 640 is exactly 2x on a
  // high-DPI phone — and at that size it is 116KB instead of the 298KB a 1024 source
  // costs, which matters because scene one preloads it. The paper is nearly flat, so it
  // compresses to 11KB and can afford to stay large.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", color,
    "-vf", `scale=${a.size}:${a.size}:flags=lanczos,${a.filter}`,
    "-quality", String(a.quality),
    resolve(OUT, a.out),
  ], { stdio: "inherit" });
  console.log(`  -> src/assets/textures/${a.out}`);
}

rmSync(TMP, { recursive: true, force: true });

function findColor(dir, id) {
  if (!existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.name.startsWith(id) && /_Color\.(jpg|jpeg|png)$/i.test(entry.name)) return p;
    }
  }
  return null;
}