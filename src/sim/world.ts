import { DX, DY, opposite, rotateCCW, rotateCW, tileKey, type Dir } from "./dir";
import { Belt, Extractor, Hub, Machine, type Entity, type EntityType, type Host } from "./entities";
import type { ItemId } from "./items";
import type { Recipe } from "./recipes";
import { oreAt } from "./terrain";

export class World implements Host {
  tick = 0;
  /** Steigt bei jeder Aenderung am Gebaeudebestand (fuer das Neuzeichnen). */
  version = 0;
  readonly delivered = new Map<ItemId, number>();
  deliveredVersion = 0;

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
    this.delivered.set(item, (this.delivered.get(item) ?? 0) + 1);
    this.deliveredVersion++;
  }

  canPlace(type: EntityType, x: number, y: number): boolean {
    if (this.grid.has(tileKey(x, y))) return false;
    if (type === "extractor" && !oreAt(x, y)) return false;
    return true;
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
        e = new Extractor(id, x, y, dir, oreAt(x, y)!);
        break;
      case "smelter":
      case "assembler":
        e = new Machine(id, x, y, dir, type, recipe);
        break;
      case "hub":
        e = new Hub(id, x, y, dir);
        break;
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
