// Re-fetch the vendored Magic UI components from upstream.  `npm run vendor:magicui`
//
// The four text effects are MIT-licensed source from https://magicui.design, copied
// in rather than installed: the shadcn registry CLI would demand a components.json,
// a tsconfig path-alias rewrite and a Radix runtime, and none of the four components
// use Radix at all. Verified: every one of them imports only React, `motion/react`
// and `cn`.
//
// Why vendor instead of a dependency: a pinned copy is reviewable, diffable and
// cannot break under a transitive bump — which matters when the whole point of the
// project is that every shipped line has a known licence.
//
// Only two things are changed after download:
//   1. `from "@/lib/utils"` -> `from "../../lib/utils"`   (avoids alias config)
//   2. an attribution header
//
// Run this to update to a newer Magic UI. Review the diff before committing.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/components/magicui");
const UPSTREAM = "apps/www/registry/magicui";

const FILES = ["blur-fade", "sparkles-text", "text-animate", "text-reveal"];

const HEADER = [
  "// Vendored from Magic UI (https://magicui.design) — MIT License, (c) DavidH.",
  "// Fetched by scripts/vendor-magicui.mjs. Do not edit by hand.",
  "// Only local change: the shadcn `@/lib/utils` alias became a relative path.",
  "",
  "",
].join("\n");

mkdirSync(OUT, { recursive: true });

for (const name of FILES) {
  const url = `https://api.github.com/repos/magicuidesign/magicui/contents/${UPSTREAM}/${name}.tsx?ref=main`;
  const res = await fetch(url, {
    headers: { "User-Agent": "vendor-magicui", Accept: "application/vnd.github.raw" },
  });
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const src = (await res.text()).replace(/from "@\/lib\/utils"/g, 'from "../../lib/utils"');
  if (/from "@\//.test(src)) {
    console.error(`${name}: still contains a shadcn alias — refusing to write.`);
    process.exitCode = 1;
    continue;
  }

  // `SparklesText` scatters eight animated <svg> sparkles through the greeting and
  // none of them are in the accessibility tree, so a screen reader walks the
  // middle of "Happy Birthday!" through eight unnamed graphics. The component
  // accepts no prop that reaches them, and no wrapper can hide them without also
  // hiding the words, so the fix belongs in the vendored source.
  //
  // Anchored on the className, which is unique to the sparkle, and checked: a
  // silent no-op here would quietly reintroduce the problem while looking like a
  // successful vendor run.
  let patched = src;
  if (name === "sparkles-text") {
    const from = 'className="pointer-events-none absolute z-20"';
    if (!patched.includes(from)) {
      console.error(`${name}: sparkle className moved upstream — refusing to write.`);
      process.exitCode = 1;
      continue;
    }
    patched = patched.replace(from, 'aria-hidden="true" ' + from);
  }

  writeFileSync(resolve(OUT, `${name}.tsx`), HEADER + patched);
  console.log(`wrote src/components/magicui/${name}.tsx`);
}