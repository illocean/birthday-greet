// The one helper the vendored Magic UI components need.
//
// Magic UI ships these imports under the shadcn `@/lib/utils` alias. Rather than
// add a tsconfig `paths` entry plus a Vite `resolve.alias` for one function —
// two config edits and a permanent indirection — the vendor script rewrites the
// import to a relative path and this file provides it.
//
// `twMerge` is here for a real reason, not cargo-culting the shadcn template: it
// resolves Tailwind conflicts by *last* argument, so a component's own
// className always beats a caller's default. Without it, `<SparklesText
// className="text-4xl">` would lose to the component's hardcoded text size.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}