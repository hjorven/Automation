import { BELT_SPEED, EXTRACT_TICKS, ITEM_SPACING, TUNNEL_RANGE } from "./constants";
import { DX, DY, opposite, rotateCCW, rotateCW, type Dir } from "./dir";
import type { ItemId } from "./items";
import { GENERATORS } from "./progression";
import { smeltingRecipeFor, type MachineKind, type Recipe } from "./recipes";
import type { OreId } from "./terrain";

/** Was ein Gebaeude von der Welt braucht (vermeidet zyklische Imports). */
export interface Host {
  readonly tick: number;
  entityAt(x: number, y: number): Entity | undefined;
  deliver(item: ItemId): void;
  /** Anteil der Leistung, mit dem Strom-Verbraucher laufen (0..1). */
  readonly powerFactor: number;
  /** Auslastung der Kraftwerke (0..1): so schnell verbrennen sie Brennstoff. */
  readonly powerLoad: number;
  recipeUnlocked(r: Recipe): boolean;
}

export type ExtractorKind = "extractor" | "extractor_mk2" | "extractor_mk3" | "pump";
export type GeneratorKind = "generator_coal" | "generator_fuel";

export type EntityType =
  | "belt"
  | ExtractorKind
  | MachineKind
  | GeneratorKind
  | "hub"
  | "splitter"
  | "merger"
  | "tunnel"
  | "storage"
  | "sorter";

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
  /** Bandstufe: Mk1 bis Mk3 laufen 1-, 2- und 4-mal so schnell (Durchsatz ebenso). */
  level: 1 | 2 | 3 = 1;

  get speed(): number {
    return BELT_SPEED * (this.level === 3 ? 4 : this.level);
  }

  accept(item: ItemId, side: Dir, host: Host): boolean {
    if (side === this.dir) return false;
    const n = this.items.length;
    const last = this.items[n - 1];
    if (last) {
      // Wo das letzte Item nach diesem Tick steht: Baender werden der Reihe nach
      // aktualisiert, dieses hier vielleicht erst nach dem Lieferanten.
      let pos = last.progress;
      if (last.movedAt !== host.tick) {
        const limit = n > 1 ? this.items[n - 2].progress - ITEM_SPACING : 1;
        pos = Math.max(pos, Math.min(pos + this.speed, limit));
      }
      if (pos < ITEM_SPACING) return false;
    }
    this.items.push({ item, progress: 0, prev: 0, entry: side, movedAt: host.tick });
    return true;
  }

  update(host: Host): void {
    const speed = this.speed;
    // Wie weit das vorderste Item ueber die Kante hinaus kaeme (fuer die Uebergabe).
    let overshoot = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      // In diesem Tick bereits bewegt (gerade vom Vorgaenger uebergeben).
      if (it.movedAt === host.tick) continue;
      it.movedAt = host.tick;
      it.prev = it.progress;
      const limit = i === 0 ? 1 : this.items[i - 1].progress - ITEM_SPACING;
      if (i === 0) overshoot = Math.max(0, it.progress + speed - 1);
      it.progress = Math.max(it.progress, Math.min(it.progress + speed, limit));
      // Rundungsfehler (10 x 0.1 < 1) sollen keinen Extra-Tick kosten.
      if (it.progress > 1 - 1e-9 && limit === 1) it.progress = 1;
    }

    const head = this.items[0];
    if (!head || head.progress < 1) return;
    const target = this.front(host);
    if (target && target.accept(head.item, opposite(this.dir), host)) {
      this.items.shift();
      if (target instanceof Belt) {
        // Ueberschuss mitnehmen, damit schnelle Baender an Kanten nicht bremsen,
        // und die Bewegung ueber die Feldgrenze fluessig weiterzeichnen.
        const moved = target.items[target.items.length - 1];
        const ahead = target.items[target.items.length - 2];
        const max = ahead ? ahead.progress - ITEM_SPACING : 1;
        moved.progress = Math.max(0, Math.min(overshoot, max, target.speed));
        moved.prev = head.prev - 1;
      }
    }
  }
}

export class Extractor extends EntityBase {
  timer = 0;
  buffer: ItemId | null = null;

  constructor(
    id: number,
    x: number,
    y: number,
    dir: Dir,
    readonly ore: OreId,
    readonly type: ExtractorKind = "extractor",
  ) {
    super(id, x, y, dir);
  }

  /** Mk2 foerdert doppelt, Mk3 viermal so schnell; die Oelpumpe wie ein Bohrer. */
  get interval(): number {
    if (this.type === "extractor_mk2") return EXTRACT_TICKS / 2;
    if (this.type === "extractor_mk3") return EXTRACT_TICKS / 4;
    return EXTRACT_TICKS;
  }

  accept(): boolean {
    return false;
  }

  get working(): boolean {
    return this.buffer === null;
  }

  update(host: Host): void {
    if (this.buffer === null && (this.timer += host.powerFactor) >= this.interval) {
      this.timer -= this.interval;
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

  accept(item: ItemId, side: Dir, host: Host): boolean {
    if (side === this.dir) return false;

    // Schmelzen stellen sich selbst auf das angelieferte Erz ein.
    if (this.type === "smelter" && this.idle && !this.recipe?.inputs.some((s) => s.item === item)) {
      const r = smeltingRecipeFor(item);
      if (r && host.recipeUnlocked(r)) this.recipe = r;
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
    if (r && this.crafting && (this.progress += host.powerFactor) >= r.ticks) {
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

/** Verteiler: nimmt von hinten an, gibt abwechselnd nach vorne, links und rechts aus. */
export class Splitter extends EntityBase {
  readonly type = "splitter";
  buffer: ItemId | null = null;
  /** Naechster Ausgang im Wechsel (Index in `outputs`). */
  next = 0;

  private get outputs(): Dir[] {
    return [this.dir, rotateCCW(this.dir), rotateCW(this.dir)];
  }

  accept(item: ItemId, side: Dir): boolean {
    if (side !== opposite(this.dir) || this.buffer !== null) return false;
    this.buffer = item;
    return true;
  }

  update(host: Host): void {
    if (this.buffer === null) return;
    const outs = this.outputs;
    for (let i = 0; i < outs.length; i++) {
      const k = (this.next + i) % outs.length;
      const d = outs[k];
      const target = host.entityAt(this.x + DX[d], this.y + DY[d]);
      if (target && target.accept(this.buffer, opposite(d), host)) {
        this.buffer = null;
        this.next = (k + 1) % outs.length;
        return;
      }
    }
  }

  outputsTo(x: number, y: number): boolean {
    return this.outputs.some((d) => this.x + DX[d] === x && this.y + DY[d] === y);
  }
}

/** Zusammenfuehrer: nimmt von hinten, links und rechts an, gibt nach vorne aus. */
export class Merger extends EntityBase {
  readonly type = "merger";
  buffer: ItemId | null = null;
  private lastSide: Dir | null = null;
  /** Seiten (Bitmaske), die zuletzt abgewiesen wurden; fuer faires Abwechseln. */
  private waiting = 0;
  private waitingPrev = 0;

  accept(item: ItemId, side: Dir): boolean {
    if (side === this.dir) return false;
    const others = (this.waiting | this.waitingPrev) & ~(1 << side);
    if (this.buffer !== null || (side === this.lastSide && others)) {
      this.waiting |= 1 << side;
      return false;
    }
    this.buffer = item;
    this.lastSide = side;
    return true;
  }

  update(host: Host): void {
    this.waitingPrev = this.waiting;
    this.waiting = 0;
    if (this.buffer !== null && this.pushForward(this.buffer, host)) this.buffer = null;
  }
}

export interface TunnelItem {
  item: ItemId;
  /** Verbleibende Ticks bis zum Ausgang. */
  left: number;
}

/**
 * Tunnel (Untergrund-Band). Ein Eingang schickt Items unter bis zu
 * TUNNEL_RANGE - 1 Feldern hindurch zum naechsten Ausgang gleicher Richtung.
 */
export class Tunnel extends EntityBase {
  readonly type = "tunnel";
  /** Eingang (false) oder Ausgang (true). */
  exit = false;
  /** Eingang: Items unterwegs, [0] ist am weitesten. */
  transit: TunnelItem[] = [];
  /** Ausgang: wartet auf Platz vor dem Tunnel. */
  buffer: ItemId | null = null;

  /** Zum Eingang gehoeriger Ausgang, falls vorhanden. */
  partner(host: Host): Tunnel | null {
    for (let k = 1; k <= TUNNEL_RANGE; k++) {
      const e = host.entityAt(this.x + DX[this.dir] * k, this.y + DY[this.dir] * k);
      if (e instanceof Tunnel && e.dir === this.dir) return e.exit ? e : null;
    }
    return null;
  }

  accept(item: ItemId, side: Dir, host: Host): boolean {
    if (this.exit || side !== opposite(this.dir)) return false;
    const out = this.partner(host);
    if (!out) return false;
    const travel = Math.round(Math.hypot(out.x - this.x, out.y - this.y) / BELT_SPEED);
    const last = this.transit[this.transit.length - 1];
    if (last && last.left > travel - TUNNEL_GAP) return false;
    this.transit.push({ item, left: travel });
    return true;
  }

  update(host: Host): void {
    if (this.exit) {
      if (this.buffer !== null && this.pushForward(this.buffer, host)) this.buffer = null;
      return;
    }
    for (let i = 0; i < this.transit.length; i++) {
      const min = i === 0 ? 0 : this.transit[i - 1].left + TUNNEL_GAP;
      this.transit[i].left = Math.max(min, this.transit[i].left - 1);
    }
    const head = this.transit[0];
    if (!head || head.left > 0) return;
    const out = this.partner(host);
    if (out && out.buffer === null) {
      out.buffer = head.item;
      this.transit.shift();
    }
  }

  outputsTo(x: number, y: number): boolean {
    return this.exit && super.outputsTo(x, y);
  }
}

/** Lagerkiste: nimmt von hinten und den Seiten an, gibt der Reihe nach vorne aus. */
export class Storage extends EntityBase {
  readonly type = "storage";
  static readonly CAPACITY = 200;
  /** queue[0] kommt als Naechstes raus. */
  queue: ItemId[] = [];

  accept(item: ItemId, side: Dir): boolean {
    if (side === this.dir || this.queue.length >= Storage.CAPACITY) return false;
    this.queue.push(item);
    return true;
  }

  update(host: Host): void {
    if (this.queue.length && this.pushForward(this.queue[0], host)) this.queue.shift();
  }
}

/**
 * Sortierer: nimmt von hinten an. Das gefilterte Item geht nach vorne, alles
 * andere abwechselnd nach links und rechts. Ohne Filter wie ein Verteiler.
 */
export class Sorter extends EntityBase {
  readonly type = "sorter";
  filter: ItemId | null = null;
  buffer: ItemId | null = null;
  next = 0;

  private outputsFor(item: ItemId): Dir[] {
    const sides = [rotateCCW(this.dir), rotateCW(this.dir)];
    if (this.filter === null) return [this.dir, ...sides];
    return item === this.filter ? [this.dir] : sides;
  }

  accept(item: ItemId, side: Dir): boolean {
    if (side !== opposite(this.dir) || this.buffer !== null) return false;
    this.buffer = item;
    return true;
  }

  update(host: Host): void {
    if (this.buffer === null) return;
    const outs = this.outputsFor(this.buffer);
    for (let i = 0; i < outs.length; i++) {
      const k = (this.next + i) % outs.length;
      const d = outs[k];
      const target = host.entityAt(this.x + DX[d], this.y + DY[d]);
      if (target && target.accept(this.buffer, opposite(d), host)) {
        this.buffer = null;
        this.next = (k + 1) % outs.length;
        return;
      }
    }
  }

  outputsTo(x: number, y: number): boolean {
    return [this.dir, rotateCCW(this.dir), rotateCW(this.dir)].some(
      (d) => this.x + DX[d] === x && this.y + DY[d] === y,
    );
  }
}

/** Kraftwerk: verbrennt Kohle oder Treibstoff, so schnell wie Strom gebraucht wird. */
export class Generator extends EntityBase {
  static readonly FUEL_CAPACITY = 10;
  fuel = 0;
  /** Verbleibende Brenndauer der aktuellen Einheit (Ticks bei Volllast). */
  burnLeft = 0;

  constructor(
    id: number,
    x: number,
    y: number,
    dir: Dir,
    readonly type: GeneratorKind,
  ) {
    super(id, x, y, dir);
  }

  get spec() {
    return GENERATORS[this.type]!;
  }

  /** Liefert gerade Strom. */
  get burning(): boolean {
    return this.burnLeft > 0 || this.fuel > 0;
  }

  accept(item: ItemId): boolean {
    if (item !== this.spec.fuel || this.fuel >= Generator.FUEL_CAPACITY) return false;
    this.fuel++;
    return true;
  }

  update(host: Host): void {
    if (this.burnLeft <= 0 && this.fuel > 0 && host.powerLoad > 0) {
      this.fuel--;
      this.burnLeft += this.spec.burnTicks;
    }
    if (this.burnLeft > 0) this.burnLeft = Math.max(0, this.burnLeft - host.powerLoad);
  }

  outputsTo(): boolean {
    return false;
  }
}

/** Mindestabstand zweier Items im Tunnel, wie auf dem Band. */
const TUNNEL_GAP = Math.ceil(ITEM_SPACING / BELT_SPEED);

export type Entity = Belt | Extractor | Machine | Hub | Splitter | Merger | Tunnel | Storage | Sorter | Generator;

function take(map: Map<ItemId, number>, item: ItemId, n: number) {
  const left = (map.get(item) ?? 0) - n;
  if (left > 0) map.set(item, left);
  else map.delete(item);
}
