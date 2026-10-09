// One beaded letter tile. The row of these is what spells her name.
//
// The rotation is per-tile and seeded from the character's index, so the row
// looks laid down by hand rather than snapped to a grid.
export default function LetterTile({
  letter,
  index,
}: {
  letter: string;
  index: number;
}) {
  // Deterministic scatter: no Math.random, so it never re-shuffles on re-render.
  const tilt = ((index * 37) % 9) - 4;
  const lift = ((index * 13) % 5) - 2;

  return (
    <span
      className="tile"
      style={{ transform: `translateY(${lift}px) rotate(${tilt}deg)` }}
    >
      {letter}
    </span>
  );
}
