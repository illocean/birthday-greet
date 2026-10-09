import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted } from "./audio";
import WatercolorScene from "./components/WatercolorScene";
import { SCENES, sceneReducer, scrollLocked } from "./sceneMachine";
import Envelope from "./components/Envelope";
import Gallery from "./components/Gallery";
import GreetingCard from "./components/GreetingCard";
import TrifoldLetter from "./components/TrifoldLetter";
import VinylStage from "./components/VinylStage";

export default function App() {
  const [scene, dispatch] = useReducer(sceneReducer, SCENES[0]);
  // Scene three releases the scroll mid-scene rather than handing it on, so the
  // lock needs an input from inside the scene rather than a member of the scene
  // list. `VinylStage` stays mounted after the handoff — the record keeps
  // playing — which is why this is a latch and not a per-scene derivation.
  const [unlocked, setUnlocked] = useState(false);
  const [muted, changeMuted] = useState(isMuted);

  const openEnvelope = useCallback(() => dispatch({ type: "openEnvelope" }), []);
  const closeEnvelope = useCallback(() => dispatch({ type: "closeEnvelope" }), []);
  const cardPlayed = useCallback(() => dispatch({ type: "cardPlayed" }), []);
  const recordPlayed = useCallback(() => dispatch({ type: "recordPlayed" }), []);
  const unlockScroll = useCallback(() => setUnlocked(true), []);
  const main = useRef<HTMLElement | null>(null);

  // Envelope, card and record play themselves. Locking the document is the only
  // thing that stops a stray scroll from dragging the reader out of the middle
  // of an animation; gallery and letter hand the scroll back, which is the
  // boundary `scrollLocked` exists to keep in one place.
  useEffect(() => {
    document.documentElement.style.overflow = scrollLocked(scene, unlocked) ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [scene, unlocked]);

  // The envelope button becomes disabled as its paper opens. Intro scenes move
  // focus to the stage; reading scenes keep focus on the reader's chosen link.
  // The stage is focusable but
  // not tabbable (`tabIndex={-1}`, so tab order is unchanged).
  //
  // `preventScroll` is not optional: the scene also changes on the reader's first
  // scroll, and a plain `focus()` scrolls its target back into view — which would
  // throw her to the top of the page on exactly the gesture that docks the record.
  useEffect(() => {
    if (scene === "gallery" || scene === "letter") return;
    main.current?.focus({ preventScroll: true });
  }, [scene]);

  return (
    <main
      ref={main}
      tabIndex={-1}
      className="min-h-[100dvh] focus:outline-none"
      data-scene={scene}
    >
      {/* The document's only heading, kept here rather than inside the envelope
          so it survives the envelope unmounting. */}
      <h1 className="sr-only">Happy Birthday!</h1>
      <WatercolorScene />
      <button type="button" className="sound-toggle" aria-label={muted ? "Unmute sound" : "Mute sound"} aria-pressed={muted}
        onClick={() => { setMuted(!muted); changeMuted(!muted); }}>
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>

      {/* Envelope and card are mounted *together* in scene two. The brief has the
          card rise out of an envelope that is by then falling away, and that
          needs both in the tree at once — swapping one for the other as the scene
          changes is a cut, and the whole beat of the card coming out of
          something is lost. */}
      {(scene === "envelope" || scene === "card") && (
        <Envelope onOpen={openEnvelope} onClose={closeEnvelope}>
          {(phase) => <GreetingCard active={phase === "open"} onDone={cardPlayed} />}
        </Envelope>
      )}

      {/* The record outlives its own scene. The brief has it dock into a mini
          player and stay there while she reads the photographs and the letter, so
          the mount condition is the three scenes it can be visible in rather than
          the one it belongs to. */}
      {(scene === "vinyl" || scene === "gallery" || scene === "letter") && (
        <VinylStage onRecordPlayed={recordPlayed} onUnlock={unlockScroll} />
      )}

      {/*
        * The gallery mounts from scene three, not from scene four, and that is
        * load-bearing rather than tidy.
        *
        * The scene three -> four handoff fires on the reader's first *scroll*,
        * and the scroll is still locked until the needle has landed. With the
        * gallery mounted only at scene four, the document is exactly 100dvh for
        * the whole locked window, so `scrollTo` clamps to 0, no scroll event ever
        * arrives, and the reader is stranded on the poster forever.
        *
        * The full poster stays at the top of the document. Its compact player
        * appears when the poster leaves the viewport, while this mounted content
        * provides the scroll travel into the photographs.
        */}
      {(scene === "vinyl" || scene === "gallery") && <Gallery navigable={unlocked} />}

      {/* The letter is the same deal as the gallery above, and for the same
          reason: it is the reader's own scroll that carries her through it, so
          it has to exist in the document while the scroll is still locked.
          `scene` stops at "gallery" — `sceneMachine` has no transition into
          "letter" and no intent to have one — so this could not be keyed on it. */}
      {(scene === "vinyl" || scene === "gallery") && <TrifoldLetter />}
    </main>
  );
}
