import { TICKS_PER_SECOND } from "../sim/constants";
import type { ItemId } from "../sim/items";
import type { World } from "../sim/world";

/** Laenge eines Zeitfensters der Statistik. */
const BUCKET_TICKS = 10 * TICKS_PER_SECOND;
/** So viele Fenster bleiben erhalten (10 Minuten). */
export const BUCKETS = 60;
const MINUTE_TICKS = 60 * TICKS_PER_SECOND;

/**
 * Lieferungen an den Hub in 10-Sekunden-Fenstern (nur fuer diese Sitzung).
 * Liest `world.delivered` (steigt nur) und verbucht die Zuwaechse seit dem
 * letzten Aufruf von `sample`.
 */
export class DeliveryStats {
  private buckets: Map<ItemId, number>[] = [new Map()];
  private bucketStart: number;
  private readonly startTick: number;
  private readonly seen: Map<ItemId, number>;
  /** Geliefert seit Beginn der Sitzung. */
  readonly total = new Map<ItemId, number>();

  constructor(private readonly world: World) {
    this.startTick = this.bucketStart = world.tick;
    this.seen = new Map(world.delivered);
  }

  /** Neue Lieferungen verbuchen; einige Male pro Sekunde aufrufen. */
  sample() {
    this.roll();
    const b = this.buckets[this.buckets.length - 1];
    for (const [item, n] of this.world.delivered) {
      const d = n - (this.seen.get(item) ?? 0);
      if (d <= 0) continue;
      this.seen.set(item, n);
      b.set(item, (b.get(item) ?? 0) + d);
      this.total.set(item, (this.total.get(item) ?? 0) + d);
    }
  }

  private roll() {
    const t = this.world.tick;
    if (t - this.bucketStart > BUCKETS * BUCKET_TICKS) {
      // Lange Pause (z. B. Tab im Hintergrund): neu anfangen.
      this.buckets = [new Map()];
      this.bucketStart = t;
      return;
    }
    while (t >= this.bucketStart + BUCKET_TICKS) {
      this.buckets.push(new Map());
      this.bucketStart += BUCKET_TICKS;
    }
    if (this.buckets.length > BUCKETS) this.buckets.splice(0, this.buckets.length - BUCKETS);
  }

  /** Lieferungen pro Minute, gemittelt ueber die letzte Minute. */
  perMinute(item: ItemId): number {
    this.roll();
    const n = Math.ceil(MINUTE_TICKS / BUCKET_TICKS);
    let sum = 0;
    for (const b of this.buckets.slice(-n)) sum += b.get(item) ?? 0;
    const span = Math.min(MINUTE_TICKS, this.world.tick - this.startTick, (n - 1) * BUCKET_TICKS + this.world.tick - this.bucketStart);
    return span > 0 ? (sum * MINUTE_TICKS) / span : 0;
  }

  /** Lieferungen je Zeitfenster, aeltestes zuerst (immer BUCKETS Werte). */
  series(item: ItemId): number[] {
    this.roll();
    const out = this.buckets.map((b) => b.get(item) ?? 0);
    return [...new Array<number>(BUCKETS - out.length).fill(0), ...out];
  }

  /** Items, die in dieser Sitzung geliefert wurden. */
  items(): ItemId[] {
    return [...this.total.keys()];
  }

  get minutes(): number {
    return (this.world.tick - this.startTick) / MINUTE_TICKS;
  }
}
