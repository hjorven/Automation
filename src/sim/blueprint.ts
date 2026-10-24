import { rotateCW, type Dir } from "./dir";
import { Machine, Sorter, Tunnel } from "./entities";
import { ITEM_ORDER, type ItemId } from "./items";
import { buildCost, buildingTier, type BuildId } from "./progression";
import { recipeById, type ItemStack } from "./recipes";
import { buildIdOf, type BuildError, type World } from "./world";

/**
 * Blaupausen: ein rechteckiger Fabrikteil zum Kopieren und Einfuegen.
 * Positionen sind relativ zur oberen linken Ecke (0..w-1, 0..h-1).
 */
export interface BlueprintEntry {
  id: BuildId;
  dx: number;
  dy: number;
  dir: Dir;
  recipe?: string;
  filter?: ItemId;
  exit?: boolean;
}

export interface Blueprint {
  name: string;
  w: number;
  h: number;
  entries: BlueprintEntry[];
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Ecken in beliebiger Reihenfolge -> geordnetes Rechteck. */
export function normRect(r: Rect): Rect {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

/** Ab dieser Hub-Stufe gibt es das Blaupausen-Werkzeug. */
export const BLUEPRINT_TIER = 1;

/** Groesster erlaubter Bereich (Felder je Seite), damit Einfuegen fluessig bleibt. */
export const MAX_SIDE = 64;

/** Gebaeude im Rechteck kopieren. Der Hub bleibt aussen vor. Leer -> null. */
export function capture(world: World, rect: Rect, name = "Blaupause"): Blueprint | null {
  const r = normRect(rect);
  const entries: BlueprintEntry[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of world.entities.values()) {
    // Hub und Wracks gehoeren nicht in eine Blaupause.
    if (e.x < r.x0 || e.x > r.x1 || e.y < r.y0 || e.y > r.y1 || e.type === "hub" || e.type === "wreck") continue;
    const entry: BlueprintEntry = { id: buildIdOf(e), dx: e.x, dy: e.y, dir: e.dir };
    if (e instanceof Machine && e.recipe && e.type !== "smelter") entry.recipe = e.recipe.id;
    if (e instanceof Sorter && e.filter) entry.filter = e.filter;
    if (e instanceof Tunnel) entry.exit = e.exit;
    entries.push(entry);
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x);
    maxY = Math.max(maxY, e.y);
  }
  if (!entries.length) return null;
  // Auf die tatsaechlich belegten Felder zuschneiden.
  for (const en of entries) {
    en.dx -= minX;
    en.dy -= minY;
  }
  entries.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
  return { name, w: maxX - minX + 1, h: maxY - minY + 1, entries };
}

/** Um 90 Grad im Uhrzeigersinn drehen (neue Blaupause). */
export function rotateBlueprint(bp: Blueprint): Blueprint {
  return {
    ...bp,
    w: bp.h,
    h: bp.w,
    entries: bp.entries.map((e) => ({ ...e, dx: bp.h - 1 - e.dy, dy: e.dx, dir: rotateCW(e.dir) })),
  };
}

/** Summe der Baukosten aller Gebaeude. */
export function blueprintCost(bp: Blueprint): ItemStack[] {
  const sum = new Map<ItemId, number>();
  for (const e of bp.entries) for (const c of buildCost(e.id)) sum.set(c.item, (sum.get(c.item) ?? 0) + c.count);
  return ITEM_ORDER.filter((i) => sum.has(i)).map((item) => ({ item, count: sum.get(item)! }));
}

export type PlanStatus = "ok" | "same" | BuildError;

/**
 * Was beim Einfuegen mit der oberen linken Ecke auf (x, y) passiert, je Eintrag.
 * "same": dort steht schon genau dieses Gebaeude (wird uebersprungen).
 * Kosten werden fortlaufend abgezogen, damit "cost" genau die Felder trifft,
 * fuer die das Lager nicht mehr reicht.
 */
export function planPaste(world: World, bp: Blueprint, x: number, y: number): PlanStatus[] {
  const left = new Map(world.storage);
  return bp.entries.map((e) => {
    const tx = x + e.dx;
    const ty = y + e.dy;
    const there = world.entityAt(tx, ty);
    if (there && buildIdOf(there) === e.id && there.dir === e.dir) return "same";
    const err = world.buildError(e.id, tx, ty);
    if (err && err !== "cost") return err;
    const cost = buildCost(e.id);
    if (!cost.every((c) => (left.get(c.item) ?? 0) >= c.count)) return "cost";
    for (const c of cost) left.set(c.item, (left.get(c.item) ?? 0) - c.count);
    return "ok";
  });
}

/** Einfuegen: baut alles, was geht, und meldet, wie viel gebaut bzw. ausgelassen wurde. */
export function pasteBlueprint(world: World, bp: Blueprint, x: number, y: number): { built: number; skipped: number } {
  let built = 0;
  let skipped = 0;
  const plan = planPaste(world, bp, x, y);
  bp.entries.forEach((en, k) => {
    if (plan[k] === "same") return;
    if (plan[k] !== "ok") {
      skipped++;
      return;
    }
    const recipe = en.recipe ? (recipeById(en.recipe) ?? null) : null;
    const e = world.build(en.id, x + en.dx, y + en.dy, en.dir, recipe);
    if (!e) {
      skipped++;
      return;
    }
    if (e instanceof Sorter && en.filter) e.filter = en.filter;
    if (e instanceof Tunnel && en.exit !== undefined && e.exit !== en.exit) world.toggleTunnel(e);
    built++;
  });
  return { built, skipped };
}

/** Alle Gebaeude im Rechteck abreissen (ausser dem Hub). Baukosten gehen zurueck. */
export function demolishRect(world: World, rect: Rect): number {
  const r = normRect(rect);
  let n = 0;
  for (const e of [...world.entities.values()]) {
    if (e.x < r.x0 || e.x > r.x1 || e.y < r.y0 || e.y > r.y1 || e.type === "hub") continue;
    world.demolish(e.x, e.y);
    n++;
  }
  return n;
}

const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Gibt es diese Bau-Id (Hub-Stufe oder Forschung)? */
const known = (id: string) => buildingTier(id as BuildId) !== Infinity;

/** Prueft eine Blaupause aus Speicher oder Code und wirft bei Unsinn. */
export function parseBlueprint(raw: unknown): Blueprint {
  if (!raw || typeof raw !== "object") throw new Error("Keine gültige Blaupause");
  const b = raw as Partial<Blueprint>;
  if (!Array.isArray(b.entries) || !isInt(b.w) || !isInt(b.h) || b.w < 1 || b.h < 1) throw new Error("Keine gültige Blaupause");
  const items = new Set<string>(ITEM_ORDER);
  const entries: BlueprintEntry[] = [];
  for (const e of b.entries as Partial<BlueprintEntry>[]) {
    if (!e || typeof e.id !== "string" || !known(e.id)) continue;
    if (!isInt(e.dx) || !isInt(e.dy) || !isDir(e.dir) || e.dx < 0 || e.dy < 0 || e.dx >= b.w || e.dy >= b.h) continue;
    const out: BlueprintEntry = { id: e.id as BuildId, dx: e.dx, dy: e.dy, dir: e.dir };
    if (typeof e.recipe === "string" && recipeById(e.recipe)) out.recipe = e.recipe;
    if (typeof e.filter === "string" && items.has(e.filter)) out.filter = e.filter as ItemId;
    if (typeof e.exit === "boolean") out.exit = e.exit;
    entries.push(out);
  }
  if (!entries.length) throw new Error("Die Blaupause ist leer");
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 40) : "Blaupause";
  return { name, w: b.w, h: b.h, entries };
}
