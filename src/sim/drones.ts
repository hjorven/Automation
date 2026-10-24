import type { Dir } from "./dir";
import { EntityBase, type Host } from "./entities";
import type { ItemId } from "./items";

// Drohnen zwischen Aussenposten. Ein Drohnenhafen sammelt Items von hinten und
// den Seiten, seine Drohne fliegt sie in Ladungen zum Zielhafen und kehrt leer
// zurueck. Der Zielhafen gibt sie vorne wieder aus. Strecke und Gelaende sind
// egal, nur die Entfernung bestimmt die Flugzeit.

/** Items pro Flug. */
export const DRONE_CARGO = 30;
/** Fluggeschwindigkeit in Feldern pro Tick (8 Felder/s). */
export const DRONE_SPEED = 0.4;
/** Kuerzeste Flugzeit pro Strecke (Start und Landung). */
export const DRONE_MIN_TICKS = 30;
/** Ladung startet spaetestens nach so vielen Ticks auch halb voll. */
export const DRONE_WAIT = 200;

export type DroneState = "idle" | "out" | "back";

export class DronePort extends EntityBase {
  readonly type = "drone_port";
  static readonly CAPACITY = 60;

  /** Zielhafen (Feld), null = sendet nicht. */
  target: { x: number; y: number } | null = null;
  /** Wartet auf den Abflug. */
  outbox: ItemId[] = [];
  /** Angekommen, wird vorne ausgegeben. */
  inbox: ItemId[] = [];
  state: DroneState = "idle";
  /** Fortschritt des aktuellen Flugs in Ticks. */
  flight = 0;
  /** Dauer einer Strecke in Ticks. */
  duration = 0;
  cargo: ItemId[] = [];
  /** Wartezeit seit dem ersten Item im Ausgang. */
  waited = 0;

  constructor(id: number, x: number, y: number, dir: Dir) {
    super(id, x, y, dir);
  }

  /** Zielhafen, falls er noch steht. */
  targetPort(host: Host): DronePort | null {
    if (!this.target) return null;
    const e = host.entityAt(this.target.x, this.target.y);
    return e instanceof DronePort && e !== this ? e : null;
  }

  accept(item: ItemId, side: Dir): boolean {
    if (side === this.dir || this.outbox.length >= DronePort.CAPACITY) return false;
    this.outbox.push(item);
    return true;
  }

  /** Flugdauer zu einem Hafen in Ticks. */
  static travelTicks(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.max(DRONE_MIN_TICKS, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / DRONE_SPEED));
  }

  update(host: Host): void {
    if (this.inbox.length && this.pushForward(this.inbox[0], host)) this.inbox.shift();

    const to = this.targetPort(host);
    if (this.state === "idle") {
      this.waited = this.outbox.length ? this.waited + 1 : 0;
      const ready = this.outbox.length >= DRONE_CARGO || (this.outbox.length > 0 && this.waited >= DRONE_WAIT);
      if (to && ready && host.powerFactor > 0) {
        this.cargo = this.outbox.splice(0, DRONE_CARGO);
        this.state = "out";
        this.flight = 0;
        this.duration = DronePort.travelTicks(this, to);
        this.waited = 0;
      }
      return;
    }

    this.flight = Math.min(this.duration, this.flight + host.powerFactor);
    if (this.flight < this.duration) return;
    if (this.state === "out") {
      // Abladen, sobald im Ziel Platz ist; ist das Ziel weg, kommt die Ladung zurueck.
      if (to) {
        if (to.inbox.length + this.cargo.length > DronePort.CAPACITY) return;
        to.inbox.push(...this.cargo);
        this.cargo = [];
      }
      this.state = "back";
      this.flight = 0;
    } else {
      this.outbox.unshift(...this.cargo);
      this.cargo = [];
      this.state = "idle";
      this.flight = 0;
    }
  }
}
