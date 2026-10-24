import type { ItemId } from "./items";
import type { ItemStack } from "./recipes";

/**
 * Endlos-Upgrades nach dem Raumfrachter: jede Stufe macht einen Bereich der
 * Fabrik etwas besser und kostet mehr als die vorige. Es gibt kein Ende, die
 * Kosten wachsen geometrisch.
 */
export type UpgradeId = "mining" | "crafting" | "power";

export interface Upgrade {
  id: UpgradeId;
  name: string;
  text: string;
  /** Bonus je Stufe (0.1 = +10 %). */
  per: number;
  /** Kosten der ersten Stufe; jede weitere kostet GROWTH-mal so viel. */
  base: ItemStack[];
}

const s = (item: ItemId, count: number): ItemStack => ({ item, count });

/** Kostenzuwachs je Stufe. */
export const GROWTH = 1.4;

export const UPGRADES: readonly Upgrade[] = [
  {
    id: "mining",
    name: "Bohrtechnik",
    text: "Bohrer und Pumpen fördern schneller.",
    per: 0.1,
    base: [s("motor", 40), s("computer", 20), s("steel", 200)],
  },
  {
    id: "crafting",
    name: "Fertigungstakt",
    text: "Alle Maschinen arbeiten schneller.",
    per: 0.1,
    base: [s("control_unit", 60), s("alu_casing", 40), s("turbo_motor", 5)],
  },
  {
    id: "power",
    name: "Netzausbau",
    text: "Hub und Kraftwerke liefern mehr Strom.",
    per: 0.15,
    base: [s("battery", 60), s("heavy_frame", 30), s("supercomputer", 5)],
  },
];

export function upgradeById(id: string): Upgrade | undefined {
  return UPGRADES.find((u) => u.id === id);
}

/** Kosten, um von Stufe `level` auf `level + 1` zu kommen. */
export function upgradeCost(u: Upgrade, level: number): ItemStack[] {
  const k = Math.pow(GROWTH, Math.max(0, level));
  return u.base.map((c) => ({ item: c.item, count: Math.ceil(c.count * k) }));
}

/** Multiplikator bei `level` (1 = kein Bonus). */
export function upgradeFactor(u: Upgrade, level: number): number {
  return 1 + u.per * Math.max(0, level);
}
