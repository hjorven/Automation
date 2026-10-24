import { DX, DY, opposite, type Dir } from "./dir";
import { EntityBase, Generator, Machine, type Entity, type Host } from "./entities";
import type { ItemId } from "./items";

// Rohre und Fluessigkeiten. Benachbarte Rohre, Tanks und Rohrpumpen bilden
// zusammen ein Netz mit einem gemeinsamen Inhalt (eine Sorte Fluessigkeit).
// Pumpen und Maschinen geben Fluessigkeit hinein, Maschinen und Kraftwerke
// an den Raendern ziehen sie heraus. Der Durchfluss eines Netzes ist begrenzt
// und sinkt mit der Laenge, wenn keine Rohrpumpen nachhelfen.

export type PipeKind = "pipe" | "fluid_tank" | "pipe_pump";

/** Was in Rohren fliessen kann. */
export const FLUIDS: ReadonlySet<ItemId> = new Set<ItemId>(["water", "crude_oil", "fuel"]);
export const isFluid = (item: ItemId) => FLUIDS.has(item);

/** Fassungsvermoegen je Bauteil in Einheiten. */
export const FLUID_CAPACITY: Record<PipeKind, number> = { pipe: 10, pipe_pump: 10, fluid_tank: 400 };

/** Hoechster Durchfluss eines Netzes in Einheiten pro Tick (20/s). */
export const PIPE_FLOW = 1;

/**
 * So viele Bauteile schafft der volle Durchfluss ohne Hilfe; jede Rohrpumpe
 * verlaengert die Reichweite um noch einmal so viel.
 */
export const PIPE_REACH = 24;

/** Rohr, Tank oder Rohrpumpe. Haelt seinen Anteil am Netz-Inhalt. */
export class FluidCarrier extends EntityBase {
  /** Inhalt beim letzten Aufteilen des Netzes (fuer Umbau und Spielstand). */
  fluid: ItemId | null = null;
  amount = 0;
  /** Netz, zu dem dieses Teil gerade gehoert (nicht gespeichert). */
  net: FluidNet | null = null;

  constructor(
    id: number,
    x: number,
    y: number,
    dir: Dir,
    readonly type: PipeKind,
  ) {
    super(id, x, y, dir);
  }

  get capacity(): number {
    return FLUID_CAPACITY[this.type];
  }

  /** Pumpen und Maschinen schieben Fluessigkeit von jeder Seite hinein. */
  accept(item: ItemId): boolean {
    return !!this.net && isFluid(item) && this.net.insert(item);
  }

  outputsTo(): boolean {
    return false;
  }
}

export interface FluidConsumer {
  entity: Entity;
  /** Seite des Verbrauchers, an der das Rohr anliegt. */
  side: Dir;
}

/** Zusammenhaengendes Rohrnetz. */
export class FluidNet {
  fluid: ItemId | null = null;
  amount = 0;
  capacity = 0;
  readonly members: FluidCarrier[] = [];
  readonly consumers: FluidConsumer[] = [];
  boosters = 0;
  /** Aktueller Hoechstdurchfluss (Einheiten pro Tick). */
  limit = PIPE_FLOW;
  /** Geglaetteter tatsaechlicher Durchfluss (Einheiten pro Tick) fuer Anzeige und Animation. */
  flow = 0;
  private inLeft = 0;
  private outLeft = 0;
  private moved = 0;
  private next = 0;

  /** Eine Einheit hineingeben (von Pumpe oder Maschine). */
  insert(item: ItemId): boolean {
    if (this.fluid !== null && this.fluid !== item) return false;
    if (this.amount + 1 > this.capacity + 1e-9 || this.inLeft < 1) return false;
    this.fluid = item;
    this.amount += 1;
    this.inLeft -= 1;
    this.moved += 1;
    return true;
  }

  /** Durchfluss fuer diesen Tick freigeben und Verbraucher beliefern. */
  tick(host: Host, boostFactor: number) {
    this.flow += (this.moved - this.flow) * 0.05;
    this.moved = 0;
    const reach = PIPE_REACH * (1 + this.boosters * boostFactor);
    this.limit = PIPE_FLOW * Math.min(1, reach / Math.max(1, this.members.length));
    // Eimer-Prinzip: auch Bruchteile pro Tick ergeben ueber die Zeit ganze Einheiten.
    const cap = Math.max(1, this.limit) * 2;
    this.inLeft = Math.min(cap, this.inLeft + this.limit);
    this.outLeft = Math.min(cap, this.outLeft + this.limit);

    const fluid = this.fluid;
    const n = this.consumers.length;
    if (fluid !== null && n) {
      for (let i = 0; i < n && this.amount >= 1 && this.outLeft >= 1; i++) {
        const c = this.consumers[(this.next + i) % n];
        while (this.amount >= 1 && this.outLeft >= 1 && c.entity.accept(fluid, c.side, host)) {
          this.amount -= 1;
          this.outLeft -= 1;
        }
      }
      this.next = (this.next + 1) % n;
    }
    if (this.amount < 1e-6) {
      this.amount = 0;
      this.fluid = null;
    }
  }

  /** Inhalt anteilig auf die Bauteile verteilen (vor Umbau oder Speichern). */
  flush() {
    for (const m of this.members) {
      m.fluid = this.fluid;
      m.amount = this.capacity ? (this.amount * m.capacity) / this.capacity : 0;
    }
  }
}

/** Haelt die Rohrnetze einer Welt aktuell. */
export class FluidSystem {
  nets: FluidNet[] = [];
  private builtVersion = -1;

  constructor(private readonly world: Host & { version: number; entities: Map<number, Entity> }) {}

  /** Einmal pro Tick, vor den Gebaeuden. `boostFactor` = Leistung der Rohrpumpen (Strom). */
  tick(boostFactor: number) {
    if (this.world.version !== this.builtVersion) this.rebuild();
    for (const net of this.nets) net.tick(this.world, boostFactor);
  }

  /** Netz-Inhalte in die Bauteile zurueckschreiben. */
  flush() {
    for (const net of this.nets) net.flush();
  }

  private rebuild() {
    this.flush();
    this.builtVersion = this.world.version;
    this.nets = [];
    const w = this.world;
    const seen = new Set<number>();
    for (const start of w.entities.values()) {
      if (!(start instanceof FluidCarrier) || seen.has(start.id)) continue;
      const net = new FluidNet();
      const totals = new Map<ItemId, number>();
      const stack: FluidCarrier[] = [start];
      seen.add(start.id);
      while (stack.length) {
        const c = stack.pop()!;
        c.net = net;
        net.members.push(c);
        net.capacity += c.capacity;
        if (c.type === "pipe_pump") net.boosters++;
        if (c.fluid && c.amount > 0) totals.set(c.fluid, (totals.get(c.fluid) ?? 0) + c.amount);
        for (let d = 0 as Dir; d < 4; d++) {
          const n = w.entityAt(c.x + DX[d], c.y + DY[d]);
          if (n instanceof FluidCarrier) {
            if (!seen.has(n.id)) {
              seen.add(n.id);
              stack.push(n);
            }
          } else if (n && takesFluid(n)) {
            net.consumers.push({ entity: n, side: opposite(d) });
          }
        }
      }
      // Gemischte Reste (nach Umbau): die groesste Menge gewinnt.
      let best: ItemId | null = null;
      for (const [f, a] of totals) if (best === null || a > totals.get(best)!) best = f;
      net.fluid = best;
      net.amount = best ? Math.min(net.capacity, totals.get(best)!) : 0;
      net.consumers.sort((a, b) => a.entity.id - b.entity.id);
      this.nets.push(net);
    }
  }
}

/** Gebaeude, die Fluessigkeit aus einem anliegenden Rohr ziehen. */
function takesFluid(e: Entity): boolean {
  return e instanceof Machine || e instanceof Generator;
}

/**
 * Seiten (Bitmaske ueber Dir) eines Rohrteils, an denen etwas anschliesst:
 * andere Rohrteile, Maschinen, Kraftwerke und Pumpen, die hineinfoerdern.
 */
export function pipeConnections(c: FluidCarrier, entityAt: (x: number, y: number) => Entity | undefined): number {
  let mask = 0;
  for (let d = 0 as Dir; d < 4; d++) {
    const n = entityAt(c.x + DX[d], c.y + DY[d]);
    if (!n) continue;
    const pump = (n.type === "pump" || n.type === "water_pump") && n.outputsTo(c.x, c.y);
    if (n instanceof FluidCarrier || takesFluid(n) || pump) mask |= 1 << d;
  }
  return mask;
}
