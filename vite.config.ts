/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the same dist/ works on a free subdomain or a sub-path
// preview. Note this does not make it openable over file:// — ES modules are
// CORS-blocked at a null origin regardless of base.
export default defineConfig({
  base: "./",
  // Tailwind v4 needs no tailwind.config.js at all: the `@theme` block in
  // src/index.css is the whole theme, and the `--color-*` prefix is what turns
  // a token into a utility. Do not add a config file back.
  plugins: [react(), tailwindcss()],
  build: { target: "es2020", assetsInlineLimit: 2048 },
  // The guarding checks are pure-function tests on the scene machine and the
  // sound volume table, so they need no DOM. No jsdom, no happy-dom, no
  // Testing Library.
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});