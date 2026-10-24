import { DX, DY, opposite, rotateCCW, rotateCW, tileKey, type Dir } from "./dir";
import { TUNNEL_RANGE } from "./constants";
import { TICKS_PER_SECOND } from "./constants";
import { isNight, sunlight } from "./daycycle";
import {
  Accumulator,
  Belt,
  Extractor,
  Generator,
  Hub,
  Machine,
  Merger,
  Solar,
  Sorter,
  Splitter,
  Storage,
  Tunnel,
  type Entity,
  type EntityType,
  type Host,
} from "./entities";
import type { ItemId } from "./items";
import {
  ACCUMULATOR,
  BELT_LEVEL,
  HUB_POWER,
  NIGHT_DEMAND,
  SOLAR_POWER,
  MAX_TIER,
  POWER_TIER,
  TIERS,
  buildCost,
  canAfford,
  hubBuildingTier,
  hubRecipeTier,
  powerUse,
  type BuildId,
} from "./progression";
import { ALT_RECIPES, recipeById, recipesFor, type ItemStack, type Recipe } from "./recipes";
import { RESEARCH, researchById, researchForRecipe, totalBonus, type Bonus } from "./research";
import { ORDER_SLOTS, makeOrder, type Order } from "./orders";
import { DEFAULT_GEN, type WorldGen } from "./terrain";

/** Warum ein Bauauftrag nicht klappt (fuer Hinweise in der UI). */
export type BuildError =
  | "blocked" // Feld belegt
  | "ore" // Bohrer/Pumpe ohne passenden Rohstoff darunter
  | "water" // Feld liegt im Wasser
  | "lava" // Feld liegt in Lava (Vulkan)
  | "cliff" // Fels (Berge)
  | "locked"
  | "cost";

/** Warum ein Forschungsknoten (noch) nicht erforscht werden kann. */
export type ResearchError = "unknown" | "done" | "tier" | "requires" | "cost";

export class World implements Host {
  tick = 0;
  /** Weltgenerator: Erz, Hindernisse, Biome und Reinheit je Feld. */
  gen: WorldGen = DEFAULT_GEN;
  /** Steigt bei jeder Aenderung am Gebaeudebestand (fuer das Neuzeichnen). */
  version = 0;
  /** Hub-Stufe (Index in TIERS). */
  tier = 0;
  /** Lager aller Hubs: Abgeliefertes minus Ausgegebenes. */
  readonly storage = new Map<ItemId, number>();
  /** Steigt bei jeder Aenderung an Lager oder Stufe (fuer die UI). */
  storageVersion = 0;
  /** Insgesamt Abgeliefertes, sinkt nie (fuer Statistiken). */
  readonly delivered = new Map<ItemId, number>();

  /** Erforschte Knoten aus dem Forschungsbaum (Ids aus RESEARCH). */
  readonly research = new Set<string>();
  /** Einzeln freigeschaltete Rezepte (Auftraege, Fundstuecke). */
  readonly extraRecipes = new Set<string>();
  /** Summe der Forschungsboni. */
  bonus: Bonus = totalBonus([]);
  /** Angebotene Auftraege. */
  orders: Order[] = [];
  /** Laufende Nummer des naechsten Auftrags (bestimmt seinen Inhalt). */
  orderSeq = 0;
  /** Erledigte Auftraege. */
  ordersDone = 0;

  /**
   * Strom in MW, jeden Tick neu berechnet. `factor` bremst Verbraucher bei Mangel.
   * `supply` ist die Erzeugung (Hub, Sonne, brennende Kraftwerke), `battery` die
   * Leistung der Speicher (positiv = sie entladen, negativ = sie laden),
   * `stored`/`capacity` ihr Fuellstand in MJ.
   */
  readonly power = { supply: 0, demand: 0, factor: 1, solar: 0, battery: 0, stored: 0, capacity: 0, night: false };
  powerFactor = 1;
  powerLoad = 0;

  readonly entities = new Map<number, Entity>();
  private readonly grid = new Map<string, Entity>();
  private nextId = 1;

  static createDefault(gen: WorldGen = DEFAULT_GEN): World {
    const w = new World();
    w.gen = gen;
    w.place("hub", 0, 0, 0);
    w.fillOrders();
    return w;
  }

  entityAt(x: number, y: number): Entity | undefined {
    return this.grid.get(tileKey(x, y));
  }

  deliver(item: ItemId) {
    this.storage.set(item, (this.storage.get(item) ?? 0) + 1);
    this.delivered.set(item, (this.delivered.get(item) ?? 0) + 1);
    this.storageVersion++;
  }

  recipeUnlocked(r: Recipe): boolean {
    return this.isRecipeUnlocked(r);
  }

  /** Bohrtempo-Faktor aus der Forschung. */
  get extractBoost(): number {
    return 1 + this.bonus.extractSpeed;
  }

  /** Strom zaehlt erst ab der Energie-Stufe. */
  get powerActive(): boolean {
    return this.tier >= POWER_TIER;
  }

  canPlace(type: EntityType, x: number, y: number): boolean {
    if (this.grid.has(tileKey(x, y))) return false;
    const ore = this.gen.oreAt(x, y);
    if (type === "pump") return ore === "crude_oil";
    if (type === "extractor" || type === "extractor_mk2" || type === "extractor_mk3") {
      return !!ore && ore !== "crude_oil";
    }
    return true;
  }

  isUnlocked(id: BuildId): boolean {
    if (hubBuildingTier(id) <= this.tier) return true;
    return RESEARCH.some((n) => n.buildings.includes(id) && this.research.has(n.id));
  }

  isRecipeUnlocked(r: Recipe): boolean {
    if (hubRecipeTier(r.id) <= this.tier || this.extraRecipes.has(r.id)) return true;
    const n = researchForRecipe(r.id);
    return !!n && this.research.has(n.id);
  }

  /**
   * Einzelnes Rezept freischalten, z. B. als Belohnung fuer einen Auftrag oder
   * ein Fundstueck. Liefert true, wenn es vorher gesperrt war.
   */
  unlockRecipe(id: string): boolean {
    const r = recipeById(id);
    if (!r || this.isRecipeUnlocked(r)) return false;
    this.extraRecipes.add(id);
    this.replaceKnownRecipeOrders();
    this.storageVersion++;
    this.version++;
    return true;
  }

  /** Warum `doResearch(id)` scheitern wuerde, sonst null. */
  researchError(id: string): ResearchError | null {
    const n = researchById(id);
    if (!n) return "unknown";
    if (this.research.has(id)) return "done";
    if (n.tier > this.tier) return "tier";
    if (!n.requires.every((r) => this.research.has(r))) return "requires";
    if (!this.canAfford(n.cost)) return "cost";
    return null;
  }

  /** Forschungsknoten bezahlen und freischalten. */
  doResearch(id: string): boolean {
    if (this.researchError(id)) return false;
    this.pay(researchById(id)!.cost);
    this.grantResearch(id);
    return true;
  }

  /** Knoten ohne Kosten freischalten (Spielstaende, Tests). */
  grantResearch(id: string) {
    if (!researchById(id) || this.research.has(id)) return;
    this.research.add(id);
    this.bonus = totalBonus(this.research);
    this.replaceKnownRecipeOrders();
    this.storageVersion++;
    this.version++;
  }

  /**
   * Alles freischalten (fuer Tests): letzte Stufe, alle Gebaeude und Rezepte.
   * Boni bleiben aus, damit Raten und Strom wie ohne Forschung rechnen.
   */
  unlockAll() {
    this.tier = MAX_TIER;
    for (const n of RESEARCH) if (!n.bonus) this.grantResearch(n.id);
    for (const r of ALT_RECIPES) this.unlockRecipe(r.id);
  }

  /** Auftragsliste auf ORDER_SLOTS auffuellen. */
  fillOrders() {
    while (this.orders.length < ORDER_SLOTS) this.orders.push(this.nextOrder());
  }

  private nextOrder(): Order {
    const known = (id: string) => {
      const r = recipeById(id);
      return !r || this.isRecipeUnlocked(r) || this.orders.some((o) => o.recipe === id);
    };
    return makeOrder(this.orderSeq++, this.tier, known);
  }

  /** Auftraege, deren Rezept inzwischen anders freigeschaltet wurde, ersetzen. */
  private replaceKnownRecipeOrders() {
    this.orders.forEach((o, i) => {
      const r = o.recipe ? recipeById(o.recipe) : undefined;
      if (r && this.isRecipeUnlocked(r)) this.orders[i] = this.nextOrder();
    });
  }

  /** Auftrag aus dem Hub-Lager bedienen; gibt die Belohnung und ersetzt ihn. */
  fulfillOrder(index: number): boolean {
    const o = this.orders[index];
    if (!o || !this.canAfford([{ item: o.item, count: o.count }])) return false;
    this.pay([{ item: o.item, count: o.count }]);
    this.refund(o.reward);
    this.ordersDone++;
    this.orders[index] = this.nextOrder();
    if (o.recipe) this.unlockRecipe(o.recipe);
    this.storageVersion++;
    return true;
  }

  /** Auftrag ablehnen und gegen einen neuen tauschen. */
  discardOrder(index: number): boolean {
    if (!this.orders[index]) return false;
    this.orders[index] = this.nextOrder();
    this.storageVersion++;
    return true;
  }

  canAfford(cost: readonly ItemStack[]): boolean {
    return canAfford(this.storage, cost);
  }

  /** Warum `build` an dieser Stelle scheitern wuerde, sonst null. */
  buildError(id: BuildId, x: number, y: number): BuildError | null {
    if (!this.isUnlocked(id)) return "locked";
    const type = entityTypeOf(id);
    if (!this.canPlace(type, x, y)) return this.grid.has(tileKey(x, y)) ? "blocked" : "ore";
    // Nur fuer den Spieler: alte Spielstaende mit Gebaeuden auf heutigen Seen laden weiter.
    const obstacle = this.gen.obstacleAt(x, y);
    if (obstacle) return obstacle;
    if (!this.canAfford(buildCost(id))) return "cost";
    return null;
  }

  /** Bauen wie der Spieler: nur Freigeschaltetes, bezahlt aus dem Hub-Lager. */
  build(id: BuildId, x: number, y: number, dir: Dir, recipe: Recipe | null = null): Entity | null {
    if (this.buildError(id, x, y)) return null;
    if (recipe && !this.isRecipeUnlocked(recipe)) recipe = null;
    const e = this.place(entityTypeOf(id), x, y, dir, recipe);
    if (!e) return null;
    if (e instanceof Belt) e.level = BELT_LEVEL[id] ?? 1;
    this.pay(buildCost(id));
    return e;
  }

  /** Abreissen wie der Spieler: Baukosten gehen zurueck ins Lager. */
  demolish(x: number, y: number): Entity | undefined {
    const e = this.remove(x, y);
    if (e) this.refund(buildCost(buildIdOf(e)));
    return e;
  }

  /** Band auf eine hoehere Stufe bringen (zahlt die Differenz, gibt das alte zurueck). */
  upgradeBelt(e: Entity, id: BuildId): boolean {
    const level = BELT_LEVEL[id];
    if (!(e instanceof Belt) || !level || e.level >= level || !this.isUnlocked(id)) return false;
    const cost = buildCost(id);
    if (!this.canAfford(cost)) return false;
    this.refund(buildCost(buildIdOf(e)));
    this.pay(cost);
    e.level = level;
    this.version++;
    return true;
  }

  /** Bohrer gegen einen schnelleren tauschen (Richtung bleibt). */
  upgradeExtractor(e: Entity, to: "extractor_mk2" | "extractor_mk3" = "extractor_mk2"): Entity | null {
    const rank = { extractor: 1, extractor_mk2: 2, extractor_mk3: 3 } as Record<string, number>;
    if (!(e instanceof Extractor) || !rank[e.type] || rank[e.type] >= rank[to] || !this.isUnlocked(to)) return null;
    const cost = buildCost(to);
    if (!this.canAfford(cost)) return null;
    this.demolish(e.x, e.y);
    const up = this.place(to, e.x, e.y, e.dir);
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
    this.fillOrders();
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
      case "extractor_mk3":
      case "pump":
        e = new Extractor(id, x, y, dir, this.gen.oreAt(x, y)!, type, this.gen.purityAt(x, y));
        break;
      case "smelter":
      case "assembler":
      case "foundry":
      case "refinery":
      case "manufacturer": {
        // Maschinen mit nur einem freigeschalteten Rezept stellen sich gleich darauf ein.
        const only = recipesFor(type).filter((r) => this.isRecipeUnlocked(r));
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
      case "storage":
        e = new Storage(id, x, y, dir);
        break;
      case "sorter":
        e = new Sorter(id, x, y, dir);
        break;
      case "generator_coal":
      case "generator_fuel":
        e = new Generator(id, x, y, dir, type);
        break;
      case "solar":
        e = new Solar(id, x, y, dir);
        break;
      case "accumulator":
        e = new Accumulator(id, x, y, dir);
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
    this.updatePower();
    for (const e of this.entities.values()) e.update(this);
  }

  /**
   * Strombilanz aus dem Stand vor diesem Tick; setzt Leistungsfaktor und Auslastung.
   * Reihenfolge: Hub und Sonne zuerst, dann Kraftwerke, zuletzt die Speicher.
   * Ueberschuss (auch aus Kraftwerken) laedt die Speicher.
   */
  private updatePower() {
    let demand = 0;
    let fixed = 0;
    let solar = 0;
    let gen = 0;
    let hub = false;
    const batteries: Accumulator[] = [];
    for (const e of this.entities.values()) {
      demand += powerUse(e.type);
      if (e instanceof Generator) {
        if (e.burning) gen += e.spec.power;
      } else if (e instanceof Solar) solar += SOLAR_POWER;
      else if (e instanceof Accumulator) batteries.push(e);
      else if (e.type === "hub") hub = true;
    }
    const p = this.power;
    p.night = isNight(this.tick);
    if (p.night) demand *= NIGHT_DEMAND;
    solar *= sunlight(this.tick);
    if (hub) fixed += HUB_POWER + this.bonus.hubPower;
    const renewable = fixed + solar;

    p.demand = demand;
    p.supply = renewable + gen;
    p.solar = solar;
    p.capacity = batteries.length * ACCUMULATOR.capacity;
    p.battery = 0;
    if (!this.powerActive) {
      p.factor = 1;
      p.stored = batteries.reduce((n, b) => n + b.stored, 0);
      this.powerFactor = 1;
      this.powerLoad = 0;
      return;
    }

    const dt = 1 / TICKS_PER_SECOND;
    // Was die Speicher in diesem Tick hoechstens aufnehmen bzw. abgeben koennen (MW).
    let room = 0;
    let avail = 0;
    for (const b of batteries) {
      room += Math.min(ACCUMULATOR.rate, (ACCUMULATOR.capacity - b.stored) / dt);
      avail += Math.min(ACCUMULATOR.rate, b.stored / dt);
    }
    const need = demand - renewable;
    // Kraftwerke decken den Rest und laden mit, was die Speicher noch fassen.
    const genUsed = Math.min(gen, Math.max(0, need) + room);
    const surplus = renewable + genUsed - demand;
    if (surplus >= 0) {
      p.battery = -Math.min(surplus, room);
      p.factor = 1;
    } else {
      p.battery = Math.min(-surplus, avail);
      p.factor = demand > 0 ? (renewable + genUsed + p.battery) / demand : 1;
      if (p.factor > 1 - 1e-9) p.factor = 1;
    }
    this.share(batteries, p.battery * dt, p.battery > 0 ? avail : room);
    p.stored = batteries.reduce((n, b) => n + b.stored, 0);
    this.powerFactor = p.factor;
    this.powerLoad = gen > 0 ? genUsed / gen : 0;
  }

  /** Energie (MJ, positiv = entnehmen) anteilig nach Lade-/Entladeleistung auf die Speicher verteilen. */
  private share(batteries: Accumulator[], energy: number, total: number) {
    if (!energy || total <= 0) return;
    const dt = 1 / TICKS_PER_SECOND;
    for (const b of batteries) {
      const limit = energy > 0 ? Math.min(ACCUMULATOR.rate, b.stored / dt) : Math.min(ACCUMULATOR.rate, (ACCUMULATOR.capacity - b.stored) / dt);
      b.stored = Math.min(ACCUMULATOR.capacity, Math.max(0, b.stored - (energy * limit) / total));
    }
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

/** Entity-Typ, den eine Bau-Id erzeugt (schnelle Baender sind Baender). */
export function entityTypeOf(id: BuildId): EntityType {
  return BELT_LEVEL[id] ? "belt" : (id as EntityType);
}

/** Bau-Id eines vorhandenen Gebaeudes (fuer Kosten beim Abreissen). */
export function buildIdOf(e: Entity): BuildId {
  if (e instanceof Belt) return e.level === 3 ? "belt_mk3" : e.level === 2 ? "belt_mk2" : "belt";
  return e.type;
}
