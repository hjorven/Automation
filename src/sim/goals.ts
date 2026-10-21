import type { ItemId } from "./items";

export interface Goal {
  item: ItemId;
  count: number;
}

/** Auftraege in fester Reihenfolge. Gezaehlt wird alles, was im Hub ankommt. */
export const GOALS: readonly Goal[] = [
  { item: "iron_plate", count: 20 },
  { item: "copper_plate", count: 20 },
  { item: "gear", count: 30 },
  { item: "wire", count: 60 },
  { item: "circuit", count: 30 },
];

/** Index des ersten noch offenen Auftrags; GOALS.length, wenn alle erfuellt sind. */
export function currentGoalIndex(delivered: ReadonlyMap<ItemId, number>): number {
  const i = GOALS.findIndex((g) => (delivered.get(g.item) ?? 0) < g.count);
  return i === -1 ? GOALS.length : i;
}
