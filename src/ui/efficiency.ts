import { Extractor, Machine, type Entity } from "../sim/entities";
import type { World } from "../sim/world";

/** Glaettung je Messung (4 Messungen pro Sekunde, wirkt ueber etwa 15 Sekunden). */
const ALPHA = 1 / 60;

export type Why = "ok" | "input" | "output" | "recipe" | "power";

export const WHY_TEXT: Record<Why, string> = {
  ok: "arbeitet",
  input: "wartet auf Zutaten",
  output: "Ausgang voll",
  recipe: "kein Rezept",
  power: "zu wenig Strom",
};

export interface Usage {
  id: number;
  type: string;
  x: number;
  y: number;
  /** Auslastung 0..1, geglaettet. */
  load: number;
  why: Why;
}

/**
 * Misst, wie ausgelastet Bohrer und Maschinen sind (nur in dieser Sitzung).
 * Daraus entstehen das Effizienz-Ranking je Gebaeudeart und die Engpass-Liste.
 */
export class Efficiency {
  private readonly load = new Map<number, number>();
  private readonly why = new Map<number, Why>();

  constructor(private readonly world: World) {}

  /** Einige Male pro Sekunde aufrufen. */
  sample() {
    const w = this.world;
    for (const id of this.load.keys()) if (!w.entities.has(id)) this.forget(id);
    for (const e of w.entities.values()) {
      const why = state(e, w);
      if (!why) continue;
      // Bei Strommangel zaehlt nur der Anteil, mit dem die Maschine laeuft.
      const busy = why === "ok" || why === "power" ? w.powerFactor : 0;
      const prev = this.load.get(e.id);
      // Neue Gebaeude starten mit dem ersten Messwert statt bei 0.
      this.load.set(e.id, prev === undefined ? busy : prev + (busy - prev) * ALPHA);
      this.why.set(e.id, why);
    }
  }

  private forget(id: number) {
    this.load.delete(id);
    this.why.delete(id);
  }

  all(): Usage[] {
    const out: Usage[] = [];
    for (const [id, load] of this.load) {
      const e = this.world.entities.get(id);
      if (e) out.push({ id, type: e.type, x: e.x, y: e.y, load, why: this.why.get(id) ?? "ok" });
    }
    return out;
  }

  /** Durchschnittliche Auslastung je Gebaeudeart, beste zuerst. */
  byType(): { type: string; count: number; load: number }[] {
    const sums = new Map<string, { n: number; sum: number }>();
    for (const u of this.all()) {
      const s = sums.get(u.type) ?? { n: 0, sum: 0 };
      s.n++;
      s.sum += u.load;
      sums.set(u.type, s);
    }
    return [...sums]
      .map(([type, s]) => ({ type, count: s.n, load: s.sum / s.n }))
      .sort((a, b) => b.load - a.load || b.count - a.count);
  }

  /** Gesamt-Auslastung aller gemessenen Gebaeude (0..1). */
  overall(): number {
    const all = this.all();
    return all.length ? all.reduce((n, u) => n + u.load, 0) / all.length : 0;
  }

  /** Die am wenigsten ausgelasteten Gebaeude (Engpaesse). */
  bottlenecks(limit = 6): Usage[] {
    return this.all()
      .filter((u) => u.load < 0.8)
      .sort((a, b) => a.load - b.load)
      .slice(0, limit);
  }
}

/** Was ein Bohrer oder eine Maschine gerade tut; undefined fuer alles andere. */
export function state(e: Entity, w: World): Why | undefined {
  const starved = w.powerActive && w.powerFactor < 0.5;
  if (e instanceof Extractor) {
    if (e.buffer !== null) return "output";
    return starved ? "power" : "ok";
  }
  if (e instanceof Machine) {
    if (!e.recipe) return "recipe";
    if (e.crafting) return starved ? "power" : "ok";
    const full = e.recipe.outputs.some((s) => (e.output.get(s.item) ?? 0) > s.count);
    return full ? "output" : "input";
  }
  return undefined;
}
