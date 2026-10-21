import { DX, DY, opposite, rotateCCW, rotateCW, tileKey, type Dir } from "./dir";
import { TUNNEL_RANGE } from "./constants";
import { Belt, Extractor, Hub, Machine, Merger, Splitter, Tunnel, type Entity, type EntityType, type Host } from "./entities";
import type { ItemId } from "./items";
import { MAX_TIER, TIERS, buildCost, buildingTier, canAfford, recipeTier } from "./progression";
import { recipesFor, type ItemStack, type Recipe } from "./recipes";
import { oreAt } from "./terrain";

/** Warum ein Bauauftrag nicht klappt (fuer Hinweise in der UI). */
export type BuildError = "blocked" | "locked" | "cost";

export class World implements Host {
  tick = 0;
  /** Steigt bei jeder Aenderung am Gebaeudebestand (fuer das Neuzeichnen). */
  version = 0;
  /** Hub-Stufe (Index in TIERS). */
  tier = 0;
  /** Lager aller Hubs: Abgeliefertes minus Ausgegebenes. */
  readonly storage = new Map<ItemId, number>();
  /** Steigt bei jeder Aenderung an Lager oder Stufe (fuer die UI). */
  storageVersion = 0;

  readonly entities = new Map<number, Entity>();
  private readonly grid = new Map<string, Entity>();
  private nextId = 1;

  static createDefault(): World {
    const w = new World();
    w.place("hub", 0, 0, 0);
    return w;
  }

  entityAt(x: number, y: number): Entity | undefined {
    return this.grid.get(tileKey(x, y));
  }

  deliver(item: ItemId) {
    this.storage.set(item, (this.storage.get(item) ?? 0) + 1);
    this.storageVersion++;
  }

  canPlace(type: EntityType, x: number, y: number): boolean {
    if (this.grid.has(tileKey(x, y))) return false;
    if ((type === "extractor" || type === "extractor_mk2") && !oreAt(x, y)) return false;
    return true;
  }

  isUnlocked(type: EntityType): boolean {
    return buildingTier(type) <= this.tier;
  }

  isRecipeUnlocked(r: Recipe): boolean {
    return recipeTier(r.id) <= this.tier;
  }

  canAfford(cost: readonly ItemStack[]): boolean {
    return canAfford(this.storage, cost);
  }

  /** Warum `build` an dieser Stelle scheitern wuerde, sonst null. */
  buildError(type: EntityType, x: number, y: number): BuildError | null {
    if (!this.isUnlocked(type)) return "locked";
    if (!this.canPlace(type, x, y)) return "blocked";
    if (!this.canAfford(buildCost(type))) return "cost";
    return null;
  }

  /** Bauen wie der Spieler: nur Freigeschaltetes, bezahlt aus dem Hub-Lager. */
  build(type: EntityType, x: number, y: number, dir: Dir, recipe: Recipe | null = null): Entity | null {
    if (this.buildError(type, x, y)) return null;
    if (recipe && !this.isRecipeUnlocked(recipe)) recipe = null;
    const e = this.place(type, x, y, dir, recipe);
    if (e) this.pay(buildCost(type));
    return e;
  }

  /** Abreissen wie der Spieler: Baukosten gehen zurueck ins Lager. */
  demolish(x: number, y: number): Entity | undefined {
    const e = this.remove(x, y);
    if (e) this.refund(buildCost(e.type));
    return e;
  }

  /** Bohrer gegen Bohrer Mk2 tauschen (Richtung bleibt). */
  upgradeExtractor(e: Entity): Entity | null {
    if (e.type !== "extractor" || !this.isUnlocked("extractor_mk2")) return null;
    const cost = buildCost("extractor_mk2");
    if (!this.canAfford(cost)) return null;
    this.demolish(e.x, e.y);
    const up = this.place("extractor_mk2", e.x, e.y, e.dir);
    if (up) this.pay(cost);
    return up;
  }

  /** Naechste Hub-Stufe kaufen. */
  upgradeHub(): boolean {
    const next = TIERS[this.tier + 1];
    if (this.tier >= MAX_TIER || !this.canAfford(next.cost)) return false;
    this.pay(next.cost);
    this.tier++;
    this.version++;
    return true;
  }

  private pay(cost: readonly ItemStack[]) {
    for (const s of cost) {
      const left = (this.storage.get(s.item) ?? 0) - s.count;
      if (left > 0) this.storage.set(s.item, left);
      else this.storage.delete(s.item);
    }
    if (cost.length) this.storageVersion++;
  }

  private refund(cost: readonly ItemStack[]) {
    for (const s of cost) this.storage.set(s.item, (this.storage.get(s.item) ?? 0) + s.count);
    if (cost.length) this.storageVersion++;
  }

  place(type: EntityType, x: number, y: number, dir: Dir, recipe: Recipe | null = null): Entity | null {
    if (!this.canPlace(type, x, y)) return null;
    const id = this.nextId++;
    let e: Entity;
    switch (type) {
      case "belt":
        e = new Belt(id, x, y, dir);
        break;
      case "extractor":
      case "extractor_mk2":
        e = new Extractor(id, x, y, dir, oreAt(x, y)!, type);
        break;
      case "smelter":
      case "assembler":
      case "foundry": {
        // Maschinen mit nur einem Rezept stellen sich gleich darauf ein.
        const only = recipesFor(type);
        if (!recipe && type !== "smelter" && only.length === 1) recipe = only[0];
        e = new Machine(id, x, y, dir, type, recipe);
        break;
      }
      case "hub":
        e = new Hub(id, x, y, dir);
        break;
      case "splitter":
        e = new Splitter(id, x, y, dir);
        break;
      case "merger":
        e = new Merger(id, x, y, dir);
        break;
      case "tunnel": {
        const t = new Tunnel(id, x, y, dir);
        t.exit = this.tunnelWantsExit(x, y, dir);
        e = t;
        break;
      }
    }
    this.entities.set(id, e);
    this.grid.set(tileKey(x, y), e);
    this.version++;
    return e;
  }

  remove(x: number, y: number): Entity | undefined {
    const e = this.entityAt(x, y);
    if (!e) return undefined;
    this.entities.delete(e.id);
    this.grid.delete(tileKey(x, y));
    this.version++;
    return e;
  }

  /**
   * Neuer Tunnel wird Ausgang, wenn hinter ihm ein Eingang gleicher Richtung
   * noch ohne Ausgang liegt; sonst Eingang.
   */
  private tunnelWantsExit(x: number, y: number, dir: Dir): boolean {
    for (let k = 1; k <= TUNNEL_RANGE; k++) {
      const e = this.entityAt(x - DX[dir] * k, y - DY[dir] * k);
      if (e instanceof Tunnel && e.dir === dir) return !e.exit && !e.partner(this);
    }
    return false;
  }

  /** Tunnel zwischen Eingang und Ausgang umschalten. */
  toggleTunnel(t: Tunnel) {
    t.exit = !t.exit;
    t.transit = [];
    t.buffer = null;
    this.version++;
  }

  setDir(e: Entity, dir: Dir) {
    if (e.dir === dir) return;
    e.dir = dir;
    this.version++;
  }

  setRecipe(m: Machine, recipe: Recipe | null) {
    m.setRecipe(recipe);
    this.version++;
  }

  step() {
    this.tick++;
    for (const e of this.entities.values()) e.update(this);
  }

  /**
   * Von welcher Seite wird ein Band beliefert? Bestimmt, ob es gerade oder
   * als Kurve gezeichnet wird (wie in Factorio).
   */
  beltInputSide(belt: Belt): Dir {
    const feeds = (side: Dir) => {
      const n = this.entityAt(belt.x + DX[side], belt.y + DY[side]);
      return !!n && n.outputsTo(belt.x, belt.y);
    };
    const back = opposite(belt.dir);
    if (feeds(back)) return back;
    const left = rotateCCW(belt.dir);
    const right = rotateCW(belt.dir);
    const l = feeds(left);
    if (l !== feeds(right)) return l ? left : right;
    return back;
  }
}
