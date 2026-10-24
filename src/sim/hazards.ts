import { TICKS_PER_SECOND } from "./constants";
import { isNight } from "./daycycle";
import { Extractor, Generator, Machine, Turret, type Entity, type EntityType } from "./entities";
import { BIOME_GEN, LEGACY_GEN } from "./terrain";
import type { World } from "./world";

// Herausforderung: Umweltverschmutzung (Smog) und Kreaturen. Maschinen
// stossen Smog aus, der sich in Feldern von CHUNK x CHUNK Kacheln ausbreitet
// und langsam abbaut. Erreicht er ein Nest, werden dessen Kreaturen wuetend
// und greifen nachts die Fabrik an. Abwehrtuerme halten sie auf. Im
// friedlichen Modus gibt es keine Angriffe, der Smog bleibt nur sichtbar.

/** Kantenlaenge eines Smog-Feldes in Kacheln. */
export const CHUNK = 8;
/** Ausstoss in Smog pro Sekunde bei voller Arbeit. */
export const POLLUTION: Partial<Record<EntityType, number>> = {
  extractor: 1,
  extractor_mk2: 2,
  extractor_mk3: 3,
  pump: 3,
  smelter: 2,
  foundry: 4,
  assembler: 1,
  refinery: 5,
  manufacturer: 3,
  generator_coal: 6,
  generator_fuel: 3,
};
/** Anteil, der pro Sekunde in jedes der vier Nachbarfelder zieht. */
const SPREAD = 0.04;
/** Abbau pro Sekunde: Anteil und fester Betrag je Feld (Pflanzen, Boden). */
const DECAY = 0.01;
const ABSORB = 0.3;
const MIN_POLLUTION = 0.05;

/** Nester liegen weit draussen: hoechstens eins je Zelle, nicht naeher als NEST_MIN_DIST. */
const NEST_CELL = 18;
const NEST_MIN_DIST = 40;
const NEST_RANGE = 170;
const NEST_CHANCE = 0.5;
export const NEST_HP = 400;
/** So viel Smog (Summe ueber die Zeit) braucht ein Nest fuer einen Angriff. */
export const WAVE_ANGER = 300;

export const CREATURE_HP = 60;
/** Kacheln pro Tick. */
const CREATURE_SPEED = 1.6 / TICKS_PER_SECOND;
/** Schaden pro Sekunde und Kreatur. */
const CREATURE_DPS = 5;
const MAX_CREATURES = 80;
/** Lebenspunkte aller Gebaeude; ein Band haelt weniger aus. */
export const BUILDING_HP = 100;
export const BELT_HP = 40;
/** Gebaeude heilen sich langsam selbst (pro Sekunde). */
const REPAIR = 1;

/** Abwehrturm: Reichweite in Kacheln, Schaden pro Schuss, Ticks zwischen zwei Schuessen. */
export const TURRET = { range: 7, damage: 20, reload: 10 };

/** Ab dieser Hub-Stufe greifen Kreaturen an (vorher gibt es noch keine Tuerme). */
export const ATTACK_TIER = 2;

export interface Nest {
  id: string;
  x: number;
  y: number;
  hp: number;
  anger: number;
}

export interface Creature {
  id: number;
  x: number;
  y: number;
  /** Position im vorigen Tick (fuer fluessiges Zeichnen). */
  px: number;
  py: number;
  hp: number;
  nest: string;
  target: number | null;
  /** Kreaturen fliehen bei Sonnenaufgang zurueck zum Nest. */
  fleeing: boolean;
}

export const chunkKey = (cx: number, cy: number) => `${cx},${cy}`;
export const chunkOf = (x: number, y: number) => [Math.floor(x / CHUNK), Math.floor(y / CHUNK)] as const;

export class Hazards {
  /** Smog je Feld (Schluessel chunkKey). */
  pollution = new Map<string, number>();
  readonly nests = new Map<string, Nest>();
  creatures: Creature[] = [];
  /** Schaden je Gebaeude-Id. */
  readonly damage = new Map<number, number>();
  /** Zaehler fuer die UI: Angriffe, zerstoerte Gebaeude und Nester. */
  waves = 0;
  destroyed = 0;
  nestsCleared = 0;
  /** Letzter Angriff: Position des Nests (fuer die Meldung). */
  lastWave: { x: number; y: number } | null = null;
  /** Steigt bei jeder Aenderung am Smog (fuer das Neuzeichnen). */
  version = 0;
  private nextCreature = 1;

  constructor() {
    for (const n of nestSites()) this.nests.set(n.id, { ...n, hp: NEST_HP, anger: 0 });
  }

  /** Liegt auf Feld (x, y) ein (noch nicht zerstoertes) Nest? Dort kann man nicht bauen. */
  nestAt(x: number, y: number): Nest | undefined {
    const n = this.nests.get(NEST_TILES.get(`${x},${y}`) ?? "");
    return n;
  }

  pollutionAt(x: number, y: number): number {
    const [cx, cy] = chunkOf(x, y);
    return this.pollution.get(chunkKey(cx, cy)) ?? 0;
  }

  /** Gesamtausstoss der Fabrik pro Sekunde (fuer die Anzeige). */
  emission(world: World): number {
    let sum = 0;
    for (const e of world.entities.values()) sum += emissionOf(e, world);
    return sum;
  }

  maxHp(e: Entity): number {
    return e.type === "belt" ? BELT_HP : BUILDING_HP;
  }

  update(world: World) {
    const attacks = !world.peaceful && world.tier >= ATTACK_TIER;
    if (!attacks && this.creatures.length) this.creatures = [];

    if (world.tick % TICKS_PER_SECOND === 0) {
      this.spreadPollution(world);
      this.repair();
      if (attacks) this.angerNests(world);
    }
    if (attacks || this.creatures.length) this.moveCreatures(world);
    this.fireTurrets(world, attacks);
  }

  // ------------------------------------------------------------ Smog

  private spreadPollution(world: World) {
    const src = this.pollution;
    for (const e of world.entities.values()) {
      const amount = emissionOf(e, world);
      if (amount <= 0) continue;
      const [cx, cy] = chunkOf(e.x, e.y);
      const k = chunkKey(cx, cy);
      src.set(k, (src.get(k) ?? 0) + amount);
    }
    const next = new Map<string, number>();
    const add = (k: string, v: number) => next.set(k, (next.get(k) ?? 0) + v);
    for (const [k, v] of src) {
      const [cx, cy] = k.split(",").map(Number);
      const out = v * SPREAD;
      add(k, v - 4 * out);
      add(chunkKey(cx + 1, cy), out);
      add(chunkKey(cx - 1, cy), out);
      add(chunkKey(cx, cy + 1), out);
      add(chunkKey(cx, cy - 1), out);
    }
    for (const [k, v] of next) {
      const left = v * (1 - DECAY) - ABSORB;
      if (left < MIN_POLLUTION) next.delete(k);
      else next.set(k, left);
    }
    this.pollution = next;
    this.version++;
  }

  private repair() {
    for (const [id, d] of this.damage) {
      if (d <= REPAIR) this.damage.delete(id);
      else this.damage.set(id, d - REPAIR);
    }
  }

  // ------------------------------------------------------------ Nester und Kreaturen

  private angerNests(world: World) {
    const night = isNight(world.tick);
    for (const n of this.nests.values()) {
      const [cx, cy] = chunkOf(n.x, n.y);
      n.anger = Math.min(3 * WAVE_ANGER, n.anger + (this.pollution.get(chunkKey(cx, cy)) ?? 0));
      if (!night || n.anger < WAVE_ANGER || this.creatures.length >= MAX_CREATURES) continue;
      n.anger -= WAVE_ANGER;
      const size = Math.min(MAX_CREATURES - this.creatures.length, 3 + Math.floor(world.tier / 2));
      for (let i = 0; i < size; i++) this.spawn(n, i);
      this.waves++;
      this.lastWave = { x: n.x, y: n.y };
    }
  }

  private spawn(n: Nest, i: number) {
    const a = (i / 6) * Math.PI * 2 + n.anger;
    this.addCreature(n.x + 0.5 + Math.cos(a) * 1.2, n.y + 0.5 + Math.sin(a) * 1.2, CREATURE_HP, n.id, false);
  }

  addCreature(x: number, y: number, hp: number, nest: string, fleeing: boolean) {
    this.creatures.push({ id: this.nextCreature++, x, y, px: x, py: y, hp, nest, target: null, fleeing });
  }

  private moveCreatures(world: World) {
    const day = !isNight(world.tick);
    const retarget = world.tick % TICKS_PER_SECOND === 0;
    const survivors: Creature[] = [];
    for (const c of this.creatures) {
      c.px = c.x;
      c.py = c.y;
      if (c.hp <= 0) continue;
      if (day) c.fleeing = true;
      const nest = this.nests.get(c.nest);
      if (c.fleeing) {
        // Zurueck ins Nest (oder einfach weg, wenn es zerstoert ist).
        if (!nest || this.step(c, nest.x + 0.5, nest.y + 0.5) < 0.6) continue;
        survivors.push(c);
        continue;
      }
      let target = c.target === null ? undefined : world.entities.get(c.target);
      if (!target || retarget) {
        target = nearestTarget(world, c.x, c.y);
        c.target = target?.id ?? null;
      }
      if (!target) {
        c.fleeing = true;
        survivors.push(c);
        continue;
      }
      const d = this.step(c, target.x + 0.5, target.y + 0.5, 0.75);
      if (d <= 0.75) this.hurt(world, target, CREATURE_DPS / TICKS_PER_SECOND);
      survivors.push(c);
    }
    this.creatures = survivors;
  }

  /** Bewegt die Kreatur auf (tx, ty) zu, hoechstens bis `stop` davor. Gibt den Abstand zurueck. */
  private step(c: Creature, tx: number, ty: number, stop = 0): number {
    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d <= stop) return d;
    const s = Math.min(CREATURE_SPEED, d - stop);
    c.x += (dx / d) * s;
    c.y += (dy / d) * s;
    return d - s;
  }

  /** Schaden an einem Gebaeude; bei 0 Lebenspunkten ist es zerstoert (ohne Rueckerstattung). */
  hurt(world: World, e: Entity, amount: number) {
    const d = (this.damage.get(e.id) ?? 0) + amount;
    if (d < this.maxHp(e)) {
      this.damage.set(e.id, d);
      return;
    }
    this.damage.delete(e.id);
    world.remove(e.x, e.y);
    this.destroyed++;
  }

  private fireTurrets(world: World, attacks: boolean) {
    for (const e of world.entities.values()) {
      if (!(e instanceof Turret)) continue;
      e.reload = Math.max(0, e.reload - world.powerFactor);
      if (!attacks || e.reload > 0) continue;
      const cx = e.x + 0.5;
      const cy = e.y + 0.5;
      let best: Creature | null = null;
      let bestD = TURRET.range;
      for (const c of this.creatures) {
        if (c.hp <= 0) continue;
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (d <= bestD) {
          best = c;
          bestD = d;
        }
      }
      if (best) {
        best.hp -= TURRET.damage;
        e.shoot(Math.atan2(best.y - cy, best.x - cx), world.tick, TURRET.reload);
        continue;
      }
      // Kein Gegner in Reichweite: Nester in Reichweite beschiessen.
      for (const n of this.nests.values()) {
        const d = Math.hypot(n.x + 0.5 - cx, n.y + 0.5 - cy);
        if (d > TURRET.range) continue;
        n.hp -= TURRET.damage;
        e.shoot(Math.atan2(n.y + 0.5 - cy, n.x + 0.5 - cx), world.tick, TURRET.reload);
        if (n.hp <= 0) {
          this.nests.delete(n.id);
          this.nestsCleared++;
        }
        break;
      }
    }
  }
}

/** Smog pro Sekunde, den ein Gebaeude gerade ausstoesst. */
export function emissionOf(e: Entity, world: World): number {
  const base = POLLUTION[e.type];
  if (!base) return 0;
  if (e instanceof Machine) return e.crafting ? base * world.powerFactor : 0;
  if (e instanceof Extractor) return e.working ? base * world.powerFactor : 0;
  if (e instanceof Generator) return e.burning && world.powerLoad > 0 ? base * world.powerLoad : 0;
  return base;
}

/** Ziel einer Kreatur: das naechste Gebaeude, das Smog macht, sonst das naechste ueberhaupt (nie Hub oder Wrack). */
function nearestTarget(world: World, x: number, y: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of world.entities.values()) {
    // Hub und Wracks greifen sie nicht an.
    if (e.type === "hub" || e.type === "wreck") continue;
    // Bevorzugt Verschmutzer und Tuerme: Baender zaehlen erst ab doppelter Entfernung.
    const weight = POLLUTION[e.type] || e.type === "turret" ? 1 : 2;
    const d = Math.hypot(e.x + 0.5 - x, e.y + 0.5 - y) * weight;
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

let sites: { id: string; x: number; y: number }[] | null = null;

/** Deterministische Lage aller Nester (wie das Erz: gleich in jedem Spiel). */
export function nestSites(): readonly { id: string; x: number; y: number }[] {
  return (sites ??= findNestSites());
}

function findNestSites(): { id: string; x: number; y: number }[] {
  const out: { id: string; x: number; y: number }[] = [];
  const r = Math.ceil(NEST_RANGE / NEST_CELL);
  for (let cy = -r; cy <= r; cy++) {
    for (let cx = -r; cx <= r; cx++) {
      if (hash(cx, cy, 71) > NEST_CHANCE) continue;
      const x = cx * NEST_CELL + Math.floor(hash(cx, cy, 72) * (NEST_CELL - 4)) + 2;
      const y = cy * NEST_CELL + Math.floor(hash(cx, cy, 73) * (NEST_CELL - 4)) + 2;
      const d = Math.hypot(x, y);
      if (d < NEST_MIN_DIST || d > NEST_RANGE) continue;
      // Weder auf Hindernissen noch auf Erz, auch nicht in Welten von alten Spielstaenden.
      if (BIOME_GEN.obstacleAt(x, y) || BIOME_GEN.oreAt(x, y) || LEGACY_GEN.obstacleAt(x, y) || LEGACY_GEN.oreAt(x, y)) continue;
      out.push({ id: chunkKey(cx, cy), x, y });
    }
  }
  return out;
}

/** Nest-Id je Feld "x,y" (fuer nestAt). */
const NEST_TILES = new Map(nestSites().map((n) => [`${n.x},${n.y}`, n.id]));

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
