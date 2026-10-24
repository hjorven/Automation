import { ITEM_ORDER, type ItemId } from "./items";
import { buildingTier, hubRecipeTier } from "./progression";
import { ALT_RECIPES, BASE_RECIPES, type ItemStack } from "./recipes";

/**
 * Auftraege: neben den Hub-Stufen ein zweites Ziel. Ein Auftrag verlangt eine
 * Menge eines Items aus dem Hub-Lager und gibt dafuer mehr wert zurueck, oft
 * Teile der naechsten Stufe, jedes dritte Mal auch ein alternatives Rezept.
 */
export interface Order {
  item: ItemId;
  count: number;
  reward: ItemStack[];
  /** Alternatives Rezept als Belohnung. */
  recipe?: string;
}

/** Gleichzeitig angebotene Auftraege. */
export const ORDER_SLOTS = 3;

const RAW: readonly ItemId[] = ["iron_ore", "copper_ore", "coal", "stone", "quartz", "sulfur", "crude_oil", "bauxite"];

export function isRaw(item: ItemId): boolean {
  return RAW.includes(item);
}

const tierMemo = new Map<ItemId, number>();

/** Fruehste Hub-Stufe, ab der ein Item auf dem Standardweg herstellbar ist. */
export function itemTier(item: ItemId): number {
  const known = tierMemo.get(item);
  if (known !== undefined) return known;
  tierMemo.set(item, Infinity); // gegen Zyklen
  let t: number;
  if (isRaw(item)) t = item === "crude_oil" ? buildingTier("pump") : 0;
  else {
    const ways = BASE_RECIPES.filter((r) => r.outputs.some((o) => o.item === item)).map((r) =>
      Math.max(hubRecipeTier(r.id), ...r.inputs.map((i) => itemTier(i.item))),
    );
    t = ways.length ? Math.min(...ways) : Infinity;
  }
  tierMemo.set(item, t);
  return t;
}

const valueMemo = new Map<ItemId, number>();

/** Wert in Rohstoffen auf dem Standardweg (Rohstoff = 1). */
export function rawValue(item: ItemId): number {
  const known = valueMemo.get(item);
  if (known !== undefined) return known;
  const ways = BASE_RECIPES.filter((r) => r.outputs.some((o) => o.item === item));
  const v = ways.length
    ? Math.min(
        ...ways.map((r) => {
          const out = r.outputs.find((o) => o.item === item)!.count;
          return r.inputs.reduce((n, c) => n + rawValue(c.item) * c.count, 0) / out;
        }),
      )
    : 1;
  valueMemo.set(item, v);
  return v;
}

/** Kleiner deterministischer Zufall (mulberry32), damit Auftraege reproduzierbar sind. */
function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)];

/** Auf eine runde Zahl bringen (5er-Schritte ab 20). */
function round(n: number): number {
  return n < 20 ? Math.max(1, Math.round(n)) : Math.round(n / 5) * 5;
}

/**
 * Erzeugt Auftrag Nummer `seq` fuer Hub-Stufe `tier`. `known` sagt, ob ein
 * Rezept schon freigeschaltet ist (solche gibt es nicht als Belohnung).
 */
export function makeOrder(seq: number, tier: number, known: (recipe: string) => boolean): Order {
  const r = rng(seq + 1);
  const made = ITEM_ORDER.filter((i) => !isRaw(i) && itemTier(i) <= tier);
  // Vor allem Items der letzten Stufen, damit Auftraege mitwachsen.
  const recent = made.filter((i) => itemTier(i) >= tier - 2);
  const item = pick(recent.length ? recent : made, r);
  const budget = 30 * Math.pow(1.5, tier);
  const count = Math.min(2000, Math.max(5, round(budget / rawValue(item))));
  const worth = count * rawValue(item) * 1.5;

  const order: Order = { item, count, reward: [] };
  const recipes = ALT_RECIPES.filter((a) => !known(a.id) && altTier(a.id) <= tier);
  if (seq % 3 === 2 && recipes.length) {
    order.recipe = pick(recipes, r).id;
    return order;
  }
  // Belohnung: bevorzugt Teile der naechsten Stufe.
  const next = ITEM_ORDER.filter((i) => !isRaw(i) && i !== item && itemTier(i) <= tier + 1);
  const ahead = next.filter((i) => itemTier(i) >= tier);
  const prize = pick(ahead.length ? ahead : next, r);
  order.reward.push({ item: prize, count: Math.max(1, round(worth / rawValue(prize))) });
  return order;
}

/** Ab welcher Stufe ein alternatives Rezept herstellbar ist (alle Zutaten und die Maschine). */
function altTier(id: string): number {
  const a = ALT_RECIPES.find((x) => x.id === id)!;
  return Math.max(buildingTier(a.machine), ...a.inputs.map((i) => itemTier(i.item)));
}
