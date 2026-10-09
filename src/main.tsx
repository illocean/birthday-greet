import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Latin subsets only. The bare `400.css` also pulls cyrillic, greek and
// vietnamese woff2 files — dead weight on the metered connection this is most
// likely to be opened over.
//
// Three faces, each with one job: The Girl Next Door is the letter, Great Vibes
// is every script heading, Quicksand is hints and buttons. Nothing here fetches
// at runtime; @fontsource ships the woff2 in the bundle.
import "@fontsource/the-girl-next-door/latin-400.css";
import "@fontsource/great-vibes/latin-400.css";
import "@fontsource/quicksand/latin-400.css";
import "@fontsource/quicksand/latin-600.css";
import "@fontsource/quicksand/latin-700.css";
import "./index.css";
import App from "./App";
import { preloadAudio, startBackground } from "./audio";

// Before the font gate below, and outside React entirely. The bed is 0.67MB and
// the render is held until every face resolves, so asking for the audio after
// render puts it behind the fonts on the critical path — this is the whole
// difference between the bed starting on load and starting a beat after it.
startBackground();
void preloadAudio();

// Load each local face before painting; late font swaps otherwise change the
// handwriting and layout between browsers, especially below the fold.
void Promise.all([
  document.fonts.load('400 1em "The Girl Next Door"'),
  document.fonts.load('400 1em "Great Vibes"'),
  ...[400, 600, 700].map((weight) => document.fonts.load(`${weight} 1em Quicksand`)),
]).catch(() => undefined).then(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
