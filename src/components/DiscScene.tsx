import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { LACE_HOLE, LACE_OUTER } from "./LaceHeart";
import { friendName, trackTitle } from "../content";
import type { VinylPhase } from "../vinylTimeline";

/**
 * The turntable in scene three, in three.js.
 *
 * Nothing about the artwork is a file. The sleeve print, the grooves, the label
 * and the drop shadow are all drawn into offscreen canvases at runtime, which
 * means the record is never a flat coloured rectangle standing in for an object
 * and the whole scene costs four textures instead of four downloads.
 *
 * The shape of the file follows one decision: the rig has six moving parts, so
 * it gets exactly one `useFrame` and one pose object. Every frame reads where the
 * rig is heading, damps the pose towards it, advances the spin, and writes all six
 * parts out. Adding a second `useFrame` here would be a second place to forget
 * that the parts are the same object.
 */

function token(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// ── Geometry ────────────────────────────────────────────────────────────────
//
// Chosen against a 4:3 canvas at 40deg fov, so the visible half-width at the
// spinning shot is 4.7 * tan(20) * (4/3) = 2.29 and the half-height is 1.80. The
// sleeve is 2.7 square with the arm's pivot at x 2.36, so the composition just
// fits: 2.36 + 0.16 = 2.52 wide against 2.58 available.

const FOV = 40;
const SLEEVE = 2.7;
const SLEEVE_D = 0.1;
const DISC_R = 1.3;
const DISC_D = 0.035;
const LABEL_R = 0.46;
const ARM_LEN = 1.35;
const SPIN = 1.2; // rad/s, the brief's top speed

/** Where the sleeve sits; only the camera moves, so it never does. */
const SLEEVE_X = -0.55;
const SLEEVE_Z = 0;

/** The record, stowed behind the sleeve and pulled clear of it. */
const STOWED = { x: SLEEVE_X, z: -0.08 };
/** Overlapping the sleeve's right half: the pulled-record pose every record
 *  collection is photographed in, and the only one that keeps the composition
 *  centred instead of shoving the disc off to one side. */
const PULLED = { x: 0.95, z: 0.12 };

/** Camera shots, one per beat. */
const SLEEVE_SHOT = { x: -0.55, z: 5.8 };
const CENTRED_SHOT = { x: 0.175, z: 4.95 };
const SPINNING_SHOT = { x: 0.175, z: 4.7 };
const DOCKED_SHOT = { x: 0.95, z: 3.66 };

const ARM_PIVOT: [number, number, number] = [2.36, 0.98, 0.3];
/** Parked, the needle sits at r 1.43 — clear of the 1.3 disc. Down, r 0.64. */
const ARM_REST = -0.02;
const ARM_DOWN = -0.6;

/** How fast the rig chases its goal, in exponential units per second. */
const RATE = 3.4;

/** The longest a single frame is allowed to count for, in seconds. Anything
 *  longer is a stall rather than elapsed time. See the clamp in `useFrame`. */
const MAX_STEP = 1 / 20;

// ── Artwork ─────────────────────────────────────────────────────────────────

/** The exact sizes the sleeve's two lines are painted at, so the face asked for
 *  by `document.fonts.load` is the face `ctx.font` then asks for. */
const TITLE_PX = 112;
const QUICKSAND_PX = 33;

/**
 * Draw a line, shrinking it until it fits.
 *
 * Both strings come out of `content.ts`, so their length is not ours to fix: a
 * sleeve that reads "For You, W" because the default title was two words longer
 * than the painter expected is a broken poster, not a tuning problem. Measuring
 * once and stepping down is the whole fix, and it means a longer track title or
 * friend name costs legibility rather than clipping.
 */
function fillFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  startPx: number,
  font: (px: number) => string,
  centerX: number,
  y: number,
  maxWidth: number,
) {
  for (let px = startPx; px >= 12; px -= 2) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.fillText(text, centerX, y);
}

type Art = {
  sleeve: THREE.CanvasTexture | null;
  grooves: THREE.CanvasTexture | null;
  label: THREE.CanvasTexture | null;
  soft: THREE.CanvasTexture | null;
};

const NO_ART: Art = { sleeve: null, grooves: null, label: null, soft: null };

function draw(size: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  // No 2D canvas is not worth a dialog. The sleeve falls back to flat board
  // colour and the record to black plastic; she still gets a turntable.
  if (!ctx) return null;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  // Everything drawn here is colour. Without this three reads it as linear data
  // and the entire record comes out muddy.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function paintSleeve(ctx: CanvasRenderingContext2D) {
  const s = ctx.canvas.width;
  const board = ctx.createLinearGradient(0, 0, s * 0.2, s);
  board.addColorStop(0, token("--color-blush-50", "#FFF6F8"));
  board.addColorStop(1, token("--color-blush-200", "#F9D3DE"));
  ctx.fillStyle = board;
  ctx.fillRect(0, 0, s, s);

  // A printed keyline, the way a real sleeve has one.
  ctx.strokeStyle = token("--color-rose-300", "#F4B3C6");
  ctx.lineWidth = s * 0.005;
  ctx.strokeRect(s * 0.05, s * 0.05, s * 0.9, s * 0.9);

  // The doily scene four is built from, straight out of its path data — one
  // heart for the whole card rather than two that happen to look alike.
  const lace = new Path2D(LACE_OUTER);
  const hole = new Path2D(LACE_HOLE);
  ctx.save();
  ctx.translate(s / 2, s * 0.4);
  ctx.scale((s * 0.56) / 200, (s * 0.56) / 190);
  ctx.translate(-100, -95);
  ctx.fillStyle = token("--color-cream", "#FFFAF7");
  ctx.fill(lace);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.setLineDash([0, 9]);
  ctx.strokeStyle = token("--color-rose-300", "#F4B3C6");
  ctx.stroke(lace);
  ctx.setLineDash([]);
  ctx.fillStyle = token("--color-blush-100", "#FDE8EE");
  ctx.fill(hole);
  ctx.restore();

  // Title, then who it is for. Uppercased rather than letter-spaced: canvas
  // letterSpacing is not in the lib this project types against. Both lines are
  // held inside the keyline's inner edge, which is the only part of the sleeve
  // with a fixed size to be out of.
  const textWidth = s * 0.78;
  ctx.textAlign = "center";
  ctx.fillStyle = token("--color-rose-600", "#B8607D");
  fillFitted(ctx, trackTitle, TITLE_PX, (px) => `${px}px "Great Vibes", cursive`, s / 2, s * 0.76, textWidth);
  ctx.fillStyle = token("--color-ink", "#5A3A46");
  fillFitted(
    ctx,
    `A RECORD FOR ${friendName.toUpperCase()}`,
    QUICKSAND_PX,
    (px) => `600 ${px}px Quicksand, sans-serif`,
    s / 2,
    s * 0.85,
    textWidth,
  );
}

function paintGrooves(ctx: CanvasRenderingContext2D) {
  const s = ctx.canvas.width;
  const c = s / 2;
  // Vinyl is nearly black with a warm cast, not the flat #000 of a drawing.
  ctx.fillStyle = "#2a1c25";
  ctx.fillRect(0, 0, s, s);
  // Every other ring catches the light, which is what makes a record read as a
  // record from across a room.
  const step = s * 0.006;
  let i = 0;
  for (let r = s * 0.2; r < c; i++, r += step) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.34)";
    ctx.lineWidth = step * 0.9;
    ctx.stroke();
  }
  // The sheen a lamp leaves across the run-out.
  const sheen = ctx.createLinearGradient(0, 0, s * 0.8, s);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0.03)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
}

function paintLabel(ctx: CanvasRenderingContext2D) {
  const s = ctx.canvas.width;
  const c = s / 2;
  const wash = ctx.createRadialGradient(c, c * 0.82, s * 0.04, c, c, c);
  wash.addColorStop(0, token("--color-blush-50", "#FFF6F8"));
  wash.addColorStop(1, token("--color-rose-400", "#EC93AE"));
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  // The printed border. No type: at 28% of the disc's radius it would be a smear
  // on a phone and a different smear again in the docked chip.
  ctx.strokeStyle = token("--color-rose-600", "#B8607D");
  ctx.lineWidth = s * 0.018;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  // The spindle hole is drawn dark rather than punched: what is behind the label
  // is the sleeve board, and that is exactly as dark as a hole in a record.
  ctx.fillStyle = "#2a1c25";
  ctx.beginPath();
  ctx.arc(c, c, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function paintSoft(ctx: CanvasRenderingContext2D) {
  const s = ctx.canvas.width;
  const c = s / 2;
  const wash = ctx.createRadialGradient(c, c, 0, c, c, c);
  wash.addColorStop(0, "rgba(90, 58, 70, 0.5)");
  wash.addColorStop(0.5, "rgba(90, 58, 70, 0.2)");
  wash.addColorStop(1, "rgba(90, 58, 70, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, s, s);
}

/**
 * The record's artwork, painted once and freed on the way out.
 *
 * A canvas uses whatever face is loaded at the instant it is drawn and is never
 * repainted when one arrives later, so the script has to be in before the sleeve
 * is drawn rather than hoped for — the same reason scene five waits on
 * `document.fonts.load`.
 */
function useDiscArt(): { art: Art; painted: boolean } {
  const [art, setArt] = useState<Art>(NO_ART);
  // "Settled", not "textures exist": a machine with no 2D context yields four
  // nulls, and it still has to start the show rather than wait forever for an
  // image that is never going to arrive.
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let live = true;
    let built: Art = NO_ART;

    Promise.all([
      document.fonts.load(`${TITLE_PX}px "Great Vibes"`),
      document.fonts.load(`600 ${QUICKSAND_PX}px Quicksand`),
    ])
      // A face that never arrives must not cost her the sleeve: it falls back to
      // the generic cursive, which is a worse poster and still a poster.
      .catch(() => undefined)
      .then(() => {
        if (!live) return;
        built = {
          sleeve: draw(1024, paintSleeve),
          grooves: draw(1024, paintGrooves),
          label: draw(512, paintLabel),
          soft: draw(256, paintSoft),
        };
        setArt(built);
        setPainted(true);
      });

    return () => {
      live = false;
      for (const texture of Object.values(built)) texture?.dispose();
    };
  }, []);

  return { art, painted };
}

// ── Poses ───────────────────────────────────────────────────────────────────

type Pose = { x: number; z: number; pull: number; drop: number; fade: number; spin: number; angle: number };

const START: Pose = { x: SLEEVE_SHOT.x, z: SLEEVE_SHOT.z, pull: 0, drop: 0, fade: 0, spin: 0, angle: 0 };

/**
 * Where the rig is heading, as absolute numbers.
 *
 * A function rather than four inline literals so the reduced-motion branch and
 * the docked branch cannot drift apart: the chip is the spinning pose seen from
 * closer, not a fourth shot anybody has to re-derive.
 */
function goalsFor(opts: { docked: boolean; phase: VinylPhase; playing: boolean; reduced: boolean }): Pose {
  const spin = opts.playing && !opts.reduced ? SPIN : 0;
  if (opts.docked) return { ...START, x: DOCKED_SHOT.x, z: DOCKED_SHOT.z, pull: 1, drop: 1, fade: 1, spin };
  // Reduced motion gets the finished composition on the first frame: the record
  // out, the arm down, nothing travelling. Panning the camera for two seconds to
  // arrive at a still picture is the motion the preference is asking us not to
  // produce, and scene two already decided this.
  if (opts.reduced) return { ...START, x: SPINNING_SHOT.x, z: SPINNING_SHOT.z, pull: 1, drop: 1, spin };
  if (opts.phase === "out") return { ...START };
  if (opts.phase === "centred") return { ...START, x: CENTRED_SHOT.x, z: CENTRED_SHOT.z, pull: 1 };
  return { ...START, x: SPINNING_SHOT.x, z: SPINNING_SHOT.z, pull: 1, drop: 1, spin };
}

// ── The rig ─────────────────────────────────────────────────────────────────

function Turntable({
  phase,
  playing,
  docked,
  reduced,
  spinSeconds,
  onLanded,
  onPaint,
}: {
  phase: VinylPhase;
  playing: boolean;
  docked: boolean;
  reduced: boolean;
  spinSeconds: number;
  /** Has the rig finished easing to its pose? Drives whether the loop may stop. */
  onLanded: (landed: boolean) => void;
  /** The sleeve is on screen. Until this fires there is nothing worth timing. */
  onPaint?: () => void;
}) {
  const { art, painted } = useDiscArt();
  const camera = useThree((state) => state.camera);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const record = useRef<THREE.Group>(null);
  const spindle = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const shade = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const pose = useRef<Pose>(START);
  const goals = goalsFor({ docked, phase, playing, reduced });

  /**
   * A canvas texture arriving is not just a new image: `map` going from null to a
   * texture flips the USE_MAP shader define, so three has to be told to rebuild
   * the program. R3F sets the uniform and not the flag.
   *
   * The define lives on the *material*, not the mesh, and every mesh here is fed
   * a different piece of `art`. Flagging only the sleeve's front face left the
   * record drawing with the define off — an untextured white disc, lit and
   * shadowed but with no grooves, which is the shape this bug takes when you
   * only look at the composition. So walk everything and flag whatever carries
   * a map; adding a mesh later cannot repeat it.
   */
  useEffect(() => {
    record.current?.parent?.traverse((node) => {
      const { material } = node as THREE.Mesh;
      for (const m of Array.isArray(material) ? material : [material]) {
        if (m && "map" in m && m.map) m.needsUpdate = true;
      }
    });
  }, [art]);

  const write = useCallback(() => {
    const p = pose.current;
    camera.position.set(p.x, 0, p.z);
    record.current?.position.set(
      STOWED.x + (PULLED.x - STOWED.x) * p.pull,
      0,
      STOWED.z + (PULLED.z - STOWED.z) * p.pull,
    );
    if (spindle.current) spindle.current.rotation.y = p.angle;
    if (arm.current) arm.current.rotation.z = ARM_REST + (ARM_DOWN - ARM_REST) * p.drop;
    if (face.current) face.current.opacity = 1 - p.fade;
    if (shade.current) shade.current.material.opacity = 0.9 * (1 - p.fade);
  }, [camera]);

  /**
   * Is the rig *at* its pose yet?
   *
   * `angle` is deliberately not in here. It is accumulated rotation, not a
   * destination: there is no pose the disc is turning *toward*, so nothing can be
   * "at" it. `goals.angle` is not a target either — `goalsFor` spreads `START`,
   * the same object `pose.current` begins as, so it carries a sample of the
   * rotation taken at the last render rather than a value anyone chose.
   * Comparing against it would gate arrival on how long ago that render was;
   * assigning to it, which is what the old snap did, discards rotation for no
   * stated reason.
   *
   * `spin` gets a loose tolerance on purpose: it is an exponential approach to
   * zero and never arrives, so the number that matters is where the last of the
   * motion stops being visible rather than where it reaches it.
   */
  const atGoals = useCallback(() => {
    const p = pose.current;
    const off =
      Math.abs(goals.x - p.x) +
      Math.abs(goals.z - p.z) +
      Math.abs(goals.pull - p.pull) +
      Math.abs(goals.drop - p.drop) +
      Math.abs(goals.fade - p.fade);
    return off < 1e-3 && Math.abs(goals.spin - p.spin) < 0.05;
  }, [goals]);

  const arrived = useRef(true);
  /** Publishes a change of arrival state, and nothing when nothing changed. */
  const syncArrival = useCallback(() => {
    const done = atGoals();
    if (done !== arrived.current) {
      arrived.current = done;
      onLanded(done);
    }
  }, [atGoals, onLanded]);

  // A stopped turntable is the whole point of the play/pause control, and the
  // gallery and letter are hundreds of viewport-heights long — leaving a
  // full-size WebGL canvas rendering at 60fps underneath them is the one thing
  // that would make this page warm a phone.
  const looping = phase !== "spinning" || (playing && !reduced);

  useFrame((_, rawDelta) => {
    const p = pose.current;
    // R3F hands back the clock's own delta, and that clock keeps counting while
    // the loop is idle. Once the rig has landed the loop drops to `demand`, and
    // after a docked scroll or a backgrounded tab the first frame back carries
    // every second spent stopped. Taken at face value it does two visible wrong
    // things at once: the speed ramp below saturates to 1 in a single frame, so
    // the record is at full speed before it has visibly started, and `angle`
    // integrates the whole gap at once, spinning it through several revolutions
    // nobody saw. Clamping to one 20fps frame keeps a genuine stall from being
    // integrated wholesale while still tracking real time on a slow device.
    const delta = Math.min(rawDelta, MAX_STEP);
    // Reduced motion snaps rather than eases, and the ramp becomes a formality.
    const chase = reduced ? 1 : 1 - Math.exp(-delta * RATE);
    p.x += (goals.x - p.x) * chase;
    p.z += (goals.z - p.z) * chase;
    p.pull += (goals.pull - p.pull) * chase;
    p.drop += (goals.drop - p.drop) * chase;
    p.fade += (goals.fade - p.fade) * chase;
    // The speed ramp is a second constant rather than a second animation because
    // it has to take exactly `spinSeconds` to arrive: an exponential approach at
    // three time constants is 95% of the way, and by the time the scroll is
    // released the record is at full speed.
    p.spin += (goals.spin - p.spin) * (reduced ? 1 : 1 - Math.exp((-delta * 3) / spinSeconds));
    p.angle += p.spin * delta;
    write();
    // Only while the loop is meant to stop does arrival matter, and checking it
    // here — in the frame that actually landed — is what lets the loop stop on
    // the very next render instead of cutting to the end pose.
    if (!looping) syncArrival();
  });

  // The render loop drops to `demand` once the rig has landed, and a demand loop
  // moves nothing — so the ordering is the whole fix: keep the loop running
  // until the ease has genuinely finished, then let it stop.
  //
  // The snap this replaces assigned `goals` wholesale: it froze the spin rate
  // dead on every pause rather than letting it wind down, and hard-cut any
  // in-flight move straight to its end pose. Neither happens now, because there
  // is never a frame where the rig is both mid-move and not rendering — it
  // slows to a stop where it stands.
  useEffect(() => {
    if (looping) return;
    syncArrival();
  }, [looping, syncArrival]);

  // Report upward rather than taking the timeline: the clock belongs to the
  // stage, and all it needs to know is that the sleeve is finally on screen.
  useEffect(() => {
    if (painted) onPaint?.();
  }, [painted, onPaint]);

  // Nothing in here is safe to draw before the sleeve exists. A material whose
  // `map` is still null renders whatever colour it was given, and the shade
  // plane is a 7.6 x 5.8 sheet at 0.9 opacity that would cover the composition
  // in white. The CSS disc is on screen for exactly this window.
  if (!painted) return null;

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2.6, 3.2, 4.4]} intensity={1.35} />
      <directionalLight
        position={[-3.4, -1.8, 2.6]}
        intensity={0.55}
        color={token("--color-rose-300", "#F4B3C6")}
      />
      {/* An environment map is what makes the arm's metal look like metal and the
          grooves look like vinyl — without one, both are flat plastic. drei builds
          it from Lightformers alone, so there is no .hdr to ship or to fail to
          load, and one frame is enough because the room never changes. */}
      <Environment frames={1} resolution={256}>
        <Lightformer
          intensity={2.6}
          color={token("--color-cream", "#FFFAF7")}
          position={[0, 3.2, 2]}
          scale={[7, 3, 1]}
        />
        <Lightformer
          intensity={1.8}
          color={token("--color-rose-300", "#F4B3C6")}
          position={[-3.4, 0.6, 1]}
          scale={[5, 5, 1]}
        />
        <Lightformer
          intensity={1.1}
          color={token("--color-rose-400", "#EC93AE")}
          position={[3.6, -1.6, 1.4]}
          scale={[4, 3, 1]}
        />
      </Environment>

      {/* The drop shadow behind the poster, drawn rather than cast. drei's
          ContactShadows re-renders the scene into a depth map, and the record is
          turning every single frame — so either the map is rebuilt at 60fps on a
          phone or the shadow goes stale against the thing it belongs to. */}
      <mesh ref={shade} position={[0.25, -0.1, -0.4]}>
        <planeGeometry args={[7.6, 5.8]} />
        <meshBasicMaterial map={art.soft} transparent depthWrite={false} toneMapped={false} />
      </mesh>

      {/* The sleeve. Six faces, because it is a box and a real sleeve has board
          edges you can see when it stands up on a shelf. Material order is
          (+x, -x, +y, -y, +z, -z), so the printed face is index 4. */}
      <mesh position={[SLEEVE_X, 0, SLEEVE_Z]}>
        <boxGeometry args={[SLEEVE, SLEEVE, SLEEVE_D]} />
        {[0, 1, 2, 3].map((side) => (
          <meshStandardMaterial
            key={side}
            attach={`material-${side}`}
            color={token("--color-cream", "#FFFAF7")}
            roughness={0.94}
          />
        ))}
        <meshStandardMaterial
          ref={face}
          attach="material-4"
          map={art.sleeve}
          roughness={0.85}
          transparent
        />
        <meshStandardMaterial
          attach="material-5"
          color={token("--color-blush-200", "#F9D3DE")}
          roughness={0.9}
        />
      </mesh>

      {/* The record. Cylinder materials read (side, top cap, bottom cap) and the
          top cap is index 1 — which faces the camera, because the group below is
          tipped. */}
      <group ref={record} position={[STOWED.x, 0, STOWED.z]}>
        {/* Tipped +90 on X so the cylinder's own axis — local +Y — points at the
            camera. That is what lets the spindle group spin on its own
            rotation.y without fighting the tilt. */}
        <group ref={spindle} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[DISC_R, DISC_R, DISC_D, 96]} />
            {/* Vinyl is a dielectric with a hard sheen, not a metal: a high
                metalness would let it mirror the pink environment and read as
                silver plastic instead of a record. */}
            <meshStandardMaterial attach="material-0" color="#2a1c25" roughness={0.36} metalness={0.1} />
            <meshStandardMaterial attach="material-1" map={art.grooves} roughness={0.36} metalness={0.1} />
            <meshStandardMaterial attach="material-2" color="#1d1319" roughness={0.4} metalness={0.1} />
          </mesh>
          <mesh position={[0, DISC_D / 2 + 0.001, 0]}>
            <cylinderGeometry args={[LABEL_R, LABEL_R, 0.004, 64]} />
            <meshStandardMaterial map={art.label} roughness={0.72} />
          </mesh>
        </group>
      </group>

      {/* The arm. It hangs from a pivot off the back-right corner and swings over
          the record; parked, it sits clear of the disc, which is the only reason
          it is modelled at all. */}
      <group position={ARM_PIVOT}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.18, 0.22, 32]} />
          <meshStandardMaterial
            color={token("--color-rose-600", "#B8607D")}
            roughness={0.3}
            metalness={0.75}
          />
        </mesh>
        <group ref={arm}>
          <mesh position={[0, -ARM_LEN / 2, 0]}>
            <boxGeometry args={[0.06, ARM_LEN, 0.06]} />
            <meshStandardMaterial
              color={token("--color-cream", "#FFFAF7")}
              roughness={0.34}
              metalness={0.8}
            />
          </mesh>
          {/* The headshell reaches back towards the disc so the needle reads as
              sitting on the surface rather than hovering over it. */}
          <mesh position={[0, -ARM_LEN - 0.05, -0.14]}>
            <boxGeometry args={[0.12, 0.17, 0.2]} />
            <meshStandardMaterial color={token("--color-ink", "#5A3A46")} roughness={0.42} />
          </mesh>
        </group>
      </group>
    </>
  );
}

// ── The canvas ──────────────────────────────────────────────────────────────

export type DiscSceneProps = {
  phase: VinylPhase;
  playing: boolean;
  docked: boolean;
  reduced: boolean;
  /** `spinUpDone - needleDrop`: how long the 0 to 1.2 rad/s ramp is allowed. */
  spinSeconds: number;
  /** The context went away. There is no way back, so this is one-way. */
  onFail: () => void;
  /** The sleeve has been drawn and the rig is on screen. */
  onPaint?: () => void;
};

export default function DiscScene(props: DiscSceneProps) {
  // The loop may only fall to `demand` once the rig has arrived at its pose.
  // Starting `true` is right: on mount the rig is at `START` and so are its
  // goals for phase "out", so there is nothing to wait for.
  const [landed, setLanded] = useState(true);
  const running = props.phase !== "spinning" || (props.playing && !props.reduced);
  return (
    <Canvas
      camera={{ position: [SLEEVE_SHOT.x, 0, SLEEVE_SHOT.z], fov: FOV }}
      dpr={props.docked ? 0.6 : [1, 2]}
      frameloop={running || !landed ? "always" : "demand"}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        // Mobile Safari and Chrome both drop the context when a tab is
        // backgrounded for long enough, and without this she comes back to a
        // black rectangle. The listener is one-shot: nothing tries to restore a
        // context that is not coming back, the CSS disc takes over instead.
        gl.domElement.addEventListener("webglcontextlost", props.onFail, { once: true });
      }}
    >
      <Turntable {...props} onLanded={setLanded} />
    </Canvas>
  );
}
