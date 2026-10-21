import { BELT_SPEED, EXTRACT_TICKS, ITEM_SPACING } from "./constants";
import { DX, DY, opposite, type Dir } from "./dir";
import type { ItemId } from "./items";
import { smeltingRecipeFor, type MachineKind, type Recipe } from "./recipes";
import type { OreId } from "./terrain";

/** Was ein Gebaeude von der Welt braucht (vermeidet zyklische Imports). */
export interface Host {
  readonly tick: number;
  entityAt(x: number, y: number): Entity | undefined;
  deliver(item: ItemId): void;
}

export type EntityType = "belt" | "extractor" | MachineKind | "hub";

abstract class EntityBase {
  abstract readonly type: EntityType;

  constructor(
    readonly id: number,
    readonly x: number,
    readonly y: number,
    public dir: Dir,
  ) {}

  /**
   * Nimmt ein Item an, das von der Seite `side` kommt (Richtung vom
   * Feldmittelpunkt zur Eintrittskante). Gibt false zurueck, wenn voll/unpassend.
   */
  abstract accept(item: ItemId, side: Dir, host: Host): boolean;

  update(_host: Host): void {}

  /** Liefert dieses Gebaeude Items auf Feld (x, y)? */
  outputsTo(x: number, y: number): boolean {
    return this.x + DX[this.dir] === x && this.y + DY[this.dir] === y;
  }

  protected front(host: Host): Entity | undefined {
    return host.entityAt(this.x + DX[this.dir], this.y + DY[this.dir]);
  }

  protected pushForward(item: ItemId, host: Host): boolean {
    const target = this.front(host);
    return !!target && target.accept(item, opposite(this.dir), host);
  }
}

export interface BeltItem {
  item: ItemId;
  /** 0 = Eintrittskante, 0.5 = Feldmitte, 1 = Austrittskante. */
  progress: number;
  /** Fortschritt im vorigen Tick, fuer die Interpolation beim Zeichnen. */
  prev: number;
  entry: Dir;
  movedAt: number;
}

export class Belt extends EntityBase {
  readonly type = "belt";
  /** items[0] liegt am weitesten vorne. */
  items: BeltItem[] = [];

  accept(item: ItemId, side: Dir, host: Host): boolean {
    if (side === this.dir) return false;
    const last = this.items[this.items.length - 1];
    if (last && last.progress < ITEM_SPACING) return false;
    this.items.push({ item, progress: 0, prev: 0, entry: side, movedAt: host.tick });
    return true;
  }

  update(host: Host): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      // In diesem Tick bereits bewegt (gerade vom Vorgaenger uebergeben).
      if (it.movedAt === host.tick) continue;
      it.movedAt = host.tick;
      it.prev = it.progress;
      const limit = i === 0 ? 1 : this.items[i - 1].progress - ITEM_SPACING;
      it.progress = Math.max(it.progress, Math.min(it.progress + BELT_SPEED, limit));
    }

    const head = this.items[0];
    if (!head || head.progress < 1) return;
    const target = this.front(host);
    if (target && target.accept(head.item, opposite(this.dir), host)) {
      this.items.shift();
      if (target instanceof Belt) {
        // Bewegung ueber die Feldgrenze hinweg fluessig weiterzeichnen.
        target.items[target.items.length - 1].prev = head.prev - 1;
      }
    }
  }
}

export class Extractor extends EntityBase {
  readonly type = "extractor";
  timer = 0;
  buffer: ItemId | null = null;

  constructor(id: number, x: number, y: number, dir: Dir, readonly ore: OreId) {
    super(id, x, y, dir);
  }

  accept(): boolean {
    return false;
  }

  get working(): boolean {
    return this.buffer === null;
  }

  update(host: Host): void {
    if (this.buffer === null && ++this.timer >= EXTRACT_TICKS) {
      this.timer = 0;
      this.buffer = this.ore;
    }
    if (this.buffer !== null && this.pushForward(this.buffer, host)) this.buffer = null;
  }
}

export class Machine extends EntityBase {
  readonly input = new Map<ItemId, number>();
  readonly output = new Map<ItemId, number>();
  progress = 0;
  crafting = false;

  constructor(
    id: number,
    x: number,
    y: number,
    dir: Dir,
    readonly type: MachineKind,
    public recipe: Recipe | null,
  ) {
    super(id, x, y, dir);
  }

  setRecipe(recipe: Recipe | null) {
    this.recipe = recipe;
    this.input.clear();
    this.output.clear();
    this.progress = 0;
    this.crafting = false;
  }

  private get idle(): boolean {
    return !this.crafting && this.input.size === 0 && this.output.size === 0;
  }

  accept(item: ItemId, side: Dir): boolean {
    if (side === this.dir) return false;

    // Schmelzen stellen sich selbst auf das angelieferte Erz ein.
    if (this.type === "smelter" && this.idle && !this.recipe?.inputs.some((s) => s.item === item)) {
      const r = smeltingRecipeFor(item);
      if (r) this.recipe = r;
    }

    const need = this.recipe?.inputs.find((s) => s.item === item);
    if (!need) return false;
    const have = this.input.get(item) ?? 0;
    if (have >= need.count * 2) return false;
    this.input.set(item, have + 1);
    return true;
  }

  update(host: Host): void {
    const r = this.recipe;
    if (r && !this.crafting && this.canStart(r)) {
      for (const s of r.inputs) take(this.input, s.item, s.count);
      this.crafting = true;
      this.progress = 0;
    }
    if (r && this.crafting && ++this.progress >= r.ticks) {
      for (const s of r.outputs) this.output.set(s.item, (this.output.get(s.item) ?? 0) + s.count);
      this.crafting = false;
    }

    // Pro Tick hoechstens ein Item ausgeben.
    for (const [item] of this.output) {
      if (this.pushForward(item, host)) take(this.output, item, 1);
      break;
    }
  }

  private canStart(r: Recipe): boolean {
    const hasInputs = r.inputs.every((s) => (this.input.get(s.item) ?? 0) >= s.count);
    const hasRoom = r.outputs.every((s) => (this.output.get(s.item) ?? 0) <= s.count);
    return hasInputs && hasRoom;
  }
}

export class Hub extends EntityBase {
  readonly type = "hub";

  accept(item: ItemId, _side: Dir, host: Host): boolean {
    host.deliver(item);
    return true;
  }

  outputsTo(): boolean {
    return false;
  }
}

export type Entity = Belt | Extractor | Machine | Hub;

function take(map: Map<ItemId, number>, item: ItemId, n: number) {
  const left = (map.get(item) ?? 0) - n;
  if (left > 0) map.set(item, left);
  else map.delete(item);
}
