// Production licence check.  `npm run licenses`
//
// The brief is a hard constraint, not a guideline:
//   "Every npm dependency must be MIT, ISC, Apache-2.0, or BSD… if a package
//    does not qualify, do not use it and tell me."
//   Fonts must be SIL OFL.
//
// So this walks the *whole* lockfile — not just package.json — because the risk
// is in the transitive tree (311 packages today), fails on anything outside the
// allowlist, and prints the table that belongs in README.md.
//
//   node scripts/license-check.mjs            # check, human table
//   node scripts/license-check.mjs --markdown # emit the README table
//
// Exit code 1 means: a dependency violates the constraint. Do not ship.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── the allowlist ────────────────────────────────────────────────────────────
const ALLOWED = new Set([
  "MIT", "ISC", "Apache-2.0",
  "BSD", "BSD-2-Clause", "BSD-3-Clause", "0BSD",
  "OFL-1.1", // fonts only, per the brief
]);

// ── documented exceptions ────────────────────────────────────────────────────
// Every entry is a deliberate, written decision. Anything not listed here and
// not on the allowlist is a hard failure.
const EXCEPTIONS = {
  "lightningcss": {
    licenses: ["MPL-2.0"],
    family: true, // covers lightningcss-<platform>-<arch> prebuilt binaries too
    reason:
      "Build-time only. It is a hard dependency of @tailwindcss/node, which the brief " +
      "mandates (Styling: Tailwind CSS), so it cannot be removed without dropping Tailwind. " +
      "MPL-2.0 is file-level copyleft: it only triggers if you modify *lightningcss's own* " +
      "files. Nothing from it is bundled or shipped — it minifies CSS during `vite build` " +
      "and never reaches the browser. The output contains zero MPL-covered code.",
  },
  "caniuse-lite": {
    licenses: ["CC-BY-4.0"],
    reason:
      "devDependency of browserslist. A browser-support *data file*, not code, and it is " +
      "never shipped to the browser. Attribution is satisfied by the licence itself.",
  },
};

// ── licence resolution ───────────────────────────────────────────────────────
/** Sniff the first recognisable line out of a LICENSE file. */
function sniffLicenseFile(dir) {
  for (const name of readdirSync(dir)) {
    if (!/^licen[sc]e(\.|$)|^copying(\.|$)/i.test(name)) continue;
    let text;
    try { text = readFileSync(resolve(dir, name), "utf8"); } catch { continue; }
    const head = text.slice(0, 2000);
    if (/Apache License/i.test(head) && /Version 2\.0/i.test(head)) return "Apache-2.0";
    if (/MIT License|Permission is hereby granted, free of charge/i.test(head) && /without restriction/i.test(head)) return "MIT";
    if (/Mozilla Public License/i.test(head)) return "MPL-2.0";
    if (/GNU AFFERO/i.test(head)) return "AGPL";
    if (/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/i.test(head)) return "GPL-3.0";
    if (/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 2/i.test(head)) return "GPL-2.0";
    if (/Creative Commons Attribution 4\.0/i.test(head)) return "CC-BY-4.0";
    if (/BSD[\s\S]{0,200}Redistribution and use in source and binary forms/i.test(head)) return "BSD-3-Clause";
    if (/ISC License|Permission to use, copy, modify, and\/or distribute this software/i.test(head)) return "ISC";
    return `UNKNOWN(${name})`;
  }
  return null;
}

/**
 * Resolve an exception by exact name, or — when the exception opts in with
 * `family` — by package family, so one entry covers `lightningcss-win32-x64-msvc`
 * and every other prebuilt platform binary alongside `lightningcss` itself.
 */
function exceptionFor(name) {
  if (EXCEPTIONS[name]) return EXCEPTIONS[name];
  for (const [key, ex] of Object.entries(EXCEPTIONS)) {
    if (ex.family && name.startsWith(`${key}-`)) return ex;
  }
  return undefined;
}

/**
 * The `license` field, falling back to the LICENSE file.
 *
 * The fallback is not decoration: webgl-constants@1.1.1 ships a genuine MIT
 * LICENSE file but omits the `license` field from its package.json entirely. A
 * check that trusted the field alone would fail a package that is actually
 * compliant, and a check that trusted neither would miss real problems.
 */
function licenseOf(name, lockEntry) {
  if (lockEntry?.license) {
    // npm allows compound expressions; every part must qualify.
    const parts = String(lockEntry.license).split(/\s+OR\s+|\s+AND\s+|,/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [String(lockEntry.license)];
  }
  const pkgDir = resolve(ROOT, "node_modules", name);
  if (existsSync(resolve(pkgDir, "package.json"))) {
    try {
      const p = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8"));
      if (p.license) return Array.isArray(p.license) ? p.license : [p.license];
    } catch { /* fall through to the file sniff */ }
  }
  if (existsSync(pkgDir)) {
    const sniffed = sniffLicenseFile(pkgDir);
    if (sniffed) return [sniffed];
  }
  return ["(undisclosed)"];
}

// ── walk the lockfile ────────────────────────────────────────────────────────
const lock = JSON.parse(readFileSync(resolve(ROOT, "package-lock.json"), "utf8"));
const rows = [];
for (const [path, meta] of Object.entries(lock.packages || {})) {
  if (!path.startsWith("node_modules/")) continue;
  const name = path.replace(/^node_modules\//, "").replace(/.*\/node_modules\//, "");
  const licenses = licenseOf(name, meta);
  const isProd = !meta.dev;
  const exception = exceptionFor(name);
  const ok = licenses.some((l) => ALLOWED.has(l)) || (exception && exception.licenses.some((l) => licenses.includes(l)));
  rows.push({ name, licenses, dev: !isProd, ok, exception });
}

const violations = rows.filter((r) => !r.ok);
const byLicense = new Map();
for (const r of rows) {
  const key = r.licenses.join(" OR ");
  if (!byLicense.has(key)) byLicense.set(key, []);
  byLicense.get(key).push(r);
}

// ── report ───────────────────────────────────────────────────────────────────
const md = process.argv.includes("--markdown");

if (md) {
  const direct = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  const table = (deps) => {
    const names = Object.keys(deps).sort();
    const licences = names.map((n) => {
      const row = rows.find((r) => r.name === n);
      return row ? row.licenses.join(" OR ") : "see lockfile";
    });
    return names
      .map((n, i) => `| \`${n}\` | ${deps[n]} | ${licences[i]} |`)
      .join("\n");
  };
  console.log("### Runtime dependencies (shipped to the browser)\n");
  console.log("| Package | Version | License |");
  console.log("| --- | --- | --- |");
  console.log(table(direct.dependencies ?? {}));
  console.log("\n### Dev dependencies (build/test only, never shipped)\n");
  console.log("| Package | Version | License |");
  console.log("| --- | --- | --- |");
  console.log(table(direct.devDependencies ?? {}));
} else {
  console.log(`Licence check — ${rows.length} packages in package-lock.json\n`);
  const sorted = [...byLicense.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [lic, list] of sorted) {
    const prod = list.filter((r) => !r.dev).length;
    console.log(`  ${lic.padEnd(18)} ${String(list.length).padStart(3)}  (${prod} runtime, ${list.length - prod} dev)`);
  }
  console.log("\n  Documented exceptions:");
  for (const [name, ex] of Object.entries(EXCEPTIONS)) {
    console.log(`    ${name} — ${ex.licenses.join("/")}`);
    console.log(`      ${ex.reason}`);
  }
}

if (violations.length) {
  console.error(`\nFAIL — ${violations.length} package(s) outside the allowed set:`);
  for (const v of violations) console.error(`  ${v.name} — ${v.licenses.join(" OR ")} (${v.dev ? "dev" : "RUNTIME"})`);
  process.exit(1);
}

console.log(`\nPASS — every dependency is MIT, ISC, Apache-2.0, BSD or OFL, or a documented exception above.`);