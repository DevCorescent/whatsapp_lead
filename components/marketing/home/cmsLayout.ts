/**
 * Grid helpers for sections whose item count an admin controls.
 *
 * A fixed `lg:grid-cols-4` looks right for eight cards and wrong for five — one
 * orphan on a second row. These pick a column count that keeps rows balanced.
 * The class names are written out in full so Tailwind's scanner can see them.
 */

const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/** Columns for a card grid: at most four, and never a lone card on its own row when avoidable. */
export function balancedCols(count: number): string {
  if (count <= 4) return LG_COLS[Math.max(count, 1)];
  if (count === 5 || count === 6 || count === 9) return LG_COLS[3];
  return LG_COLS[4];
}

/** Columns for a single row of steps, up to six. */
export function rowCols(count: number): string {
  return LG_COLS[Math.min(Math.max(count, 1), 6)];
}
