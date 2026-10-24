import type { ItemId } from "./items";
import { RECIPES } from "./recipes";

/**
 * Wert eines Items in Roh-Erz: wie viele Rohstoffe stecken mindestens darin?
 * Grundlage fuer den Fabrikwert (Statistik und Ranking).
 */
const cache = new Map<ItemId, number>();

export function itemValue(item: ItemId): number {
  const hit = cache.get(item);
  if (hit !== undefined) return hit;
  const v = compute(item, new Set());
  cache.set(item, v);
  return v;
}

function compute(item: ItemId, visiting: Set<ItemId>): number {
  // Rohstoffe (kein Rezept stellt sie her) zaehlen 1.
  if (!RECIPES.some((r) => r.outputs.some((o) => o.item === item))) return 1;
  if (visiting.has(item)) return Infinity;
  visiting.add(item);
  let best = Infinity;
  for (const r of RECIPES) {
    const out = r.outputs.find((o) => o.item === item);
    if (!out) continue;
    let sum = 0;
    for (const i of r.inputs) sum += i.count * (cache.get(i.item) ?? compute(i.item, visiting));
    const made = r.outputs.reduce((n, o) => n + o.count, 0);
    best = Math.min(best, sum / made);
  }
  visiting.delete(item);
  return Number.isFinite(best) ? best : 1;
}

/** Fabrikwert pro Minute: Lieferraten (Items/min) gewichtet mit dem Item-Wert. */
export function factoryScore(perMinute: Iterable<[ItemId, number]>): number {
  let score = 0;
  for (const [item, rate] of perMinute) score += rate * itemValue(item);
  return score;
}

/** Raenge nach Fabrikwert pro Minute. */
export const RANKS: readonly { min: number; name: string }[] = [
  { min: 0, name: "Bastler" },
  { min: 30, name: "Werkstatt" },
  { min: 150, name: "Manufaktur" },
  { min: 600, name: "Fabrik" },
  { min: 2000, name: "Industriepark" },
  { min: 6000, name: "Konzern" },
  { min: 15000, name: "Megafabrik" },
  { min: 40000, name: "Planetare Industrie" },
];

export function rankFor(score: number): { index: number; name: string; next?: { min: number; name: string } } {
  let index = 0;
  RANKS.forEach((r, i) => {
    if (score >= r.min) index = i;
  });
  return { index, name: RANKS[index].name, next: RANKS[index + 1] };
}
