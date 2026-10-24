import { DX, DY, opposite, rotateCCW, rotateCW, tileKey, type Dir } from "./dir";
import { TUNNEL_RANGE } from "./constants";
import { TICKS_PER_SECOND } from "./constants";
import { isNight, sunlight } from "./daycycle";
import {
  Accumulator,
  Belt,
  Conveyor,
  Extractor,
  Generator,
  Hub,
  Machine,
  Merger,
  Solar,
  Radar,
  Wreck,
  Ramp,
  Sorter,
  Splitter,
  Storage,
  Tunnel,
  Turret,
  type Entity,
  type EntityType,
  type Host,
} from "./entities";
import { DronePort } from "./drones";
import { FluidCarrier, FluidSystem } from "./fluids";
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
import { DEFAULT_GEN, hash, type WorldGen } from "./terrain";
import { WRECK_REGION, wreckLoot, wreckSite, type WreckLoot } from "./wrecks";
import { Hazards } from "./hazards";
import { UPGRADES, upgradeById, upgradeCost, upgradeFactor, type UpgradeId } from "./upgrades";

/** Warum ein Bauauftrag nicht klappt (fuer Hinweise in der UI). */
export type BuildError =
  | "blocked" // Feld belegt
  | "ore" // Bohrer/Pumpe ohne passenden Rohstoff darunter
  | "fog" // noch nicht erkundet
  | "water" // Feld liegt im Wasser
  | "lava" // Feld liegt in Lava (Vulkan)
  | "cliff" // Fels (Berge)
  | "dry" // Wasserpumpe nicht auf Wasser
  | "locked"
  | "cost";

/** Warum ein Forschungsknoten (noch) nicht erforscht werden kann. */
export type ResearchError = "unknown" | "done" | "tier" | "requires" | "cost";

export class World implements Host {
  tick = 0;
  /** Weltgenerator: Erz, Hindernisse, Biome und Reinheit je Feld. */
  gen: WorldGen = DEFAULT_GEN;
  /** Nebel des Krieges an? Eine nackte `new World()` (Tests) hat keinen. */
  fog = false;
  /** Erkundete Zellen (je FOG_CELL x FOG_CELL Felder), siehe `cellKey`. */
  readonly explored = new Set<number>();
  /** Steigt, sobald sich der Nebel lichtet (fuer das Neuzeichnen). */
  exploredVersion = 0;
  /** Geborgene Wracks (fuer Statistik und Hinweise). */
  salvaged = 0;
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

  /** Erreichte Stufe je Endlos-Upgrade (fehlt = 0). */
  readonly upgrades = new Map<UpgradeId, number>();
  miningSpeed = 1;
  craftingSpeed = 1;
  /** Bester je erreichter Fabrikwert pro Minute (fuer das Ranking). */
  bestScore = 0;
  /**
   * Friedlicher Modus: keine Kreaturen und Angriffe (Smog gibt es trotzdem).
   * Neue Spiele starten mit Kreaturen; alte Spielstaende laden friedlich.
   */
  peaceful = false;
  /** Smog, Nester, Kreaturen und Schaden an Gebaeuden. */
  hazards = new Hazards();

  readonly entities = new Map<number, Entity>();
  private readonly grid = new Map<string, Entity>();
  private nextId = 1;
  /** Rohrnetze (werden bei Bauaenderungen neu ermittelt). */
  readonly fluids = new FluidSystem(this);

  static createDefault(gen: WorldGen = DEFAULT_GEN): World {
    const w = new World();
    w.gen = gen;
    w.fog = true;
    w.place("hub", 0, 0, 0);
    w.fillOrders();
    return w;
  }

  entityAt(x: number, y: number, layer = 0): Entity | undefined {
    return this.grid.get(slotKey(x, y, layer));
  }

  /** Oberstes Gebaeude auf einem Feld (Bruecke vor Boden). */
  topAt(x: number, y: number): Entity | undefined {
    return this.entityAt(x, y, 1) ?? this.entityAt(x, y, 0);
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

  canPlace(type: EntityType, x: number, y: number, layer = 0): boolean {
    if (this.grid.has(slotKey(x, y, layer))) return false;
    // Auf der Bruecke gibt es nur Baender; Rampen brauchen beide Ebenen.
    if (layer === 1) return type === "belt";
    if (type === "ramp" && this.grid.has(slotKey(x, y, 1))) return false;
    if (type === "water_pump") return this.gen.obstacleAt(x, y) === "water";
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
    if (!this.isExplored(x, y)) return "fog";
    const type = entityTypeOf(id);
    const layer = layerOf(id);
    if (!this.canPlace(type, x, y, layer)) {
      if (this.grid.has(slotKey(x, y, layer)) || type === "ramp") return "blocked";
      return type === "water_pump" ? "dry" : "ore";
    }
    // Nester nur fuer den Spieler sperren (wie Wasser), damit alte Spielstaende weiter laden.
    if (this.hazards.nestAt(x, y)) return "blocked";
    // Nur fuer den Spieler: alte Spielstaende mit Gebaeuden auf heutigen Seen laden weiter.
    // Bruecken duerfen ueber Wasser und Lava fuehren, nicht durch Fels.
    const obstacle = this.gen.obstacleAt(x, y);
    const bridged = layer === 1 && obstacle !== "cliff";
    if (obstacle && !bridged && !(obstacle === "water" && type === "water_pump")) return obstacle;
    if (!this.canAfford(buildCost(id))) return "cost";
    return null;
  }

  /** Bauen wie der Spieler: nur Freigeschaltetes, bezahlt aus dem Hub-Lager. */
  build(id: BuildId, x: number, y: number, dir: Dir, recipe: Recipe | null = null): Entity | null {
    if (this.buildError(id, x, y)) return null;
    if (recipe && !this.isRecipeUnlocked(recipe)) recipe = null;
    const e = this.place(entityTypeOf(id), x, y, dir, recipe, layerOf(id));
    if (!e) return null;
    if (e instanceof Belt) e.level = id === "bridge" ? this.bestBeltLevel() : (BELT_LEVEL[id] ?? 1);
    this.pay(buildCost(id));
    return e;
  }

  /** Schnellste freigeschaltete Bandstufe (Hochbaender laufen so schnell). */
  bestBeltLevel(): 1 | 2 | 3 {
    return this.isUnlocked("belt_mk3") ? 3 : this.isUnlocked("belt_mk2") ? 2 : 1;
  }

  /** Abreissen wie der Spieler: Baukosten gehen zurueck ins Lager. */
  demolish(x: number, y: number, layer = 0): Entity | undefined {
    const wreck = this.entityAt(x, y, layer);
    if (wreck?.type === "wreck") {
      this.salvage(wreck);
      return wreck;
    }
    const e = this.remove(x, y, layer);
    if (e) this.refund(buildCost(buildIdOf(e)));
    return e;
  }

  /** Band auf eine hoehere Stufe bringen (zahlt die Differenz, gibt das alte zurueck). */
  upgradeBelt(e: Entity, id: BuildId): boolean {
    const level = BELT_LEVEL[id];
    if (!(e instanceof Belt) || e.layer !== 0 || !level || e.level >= level || !this.isUnlocked(id)) return false;
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

  upgradeLevel(id: UpgradeId): number {
    return this.upgrades.get(id) ?? 0;
  }

  /** Endlos-Upgrades gibt es erst nach der letzten Hub-Stufe. */
  get upgradesUnlocked(): boolean {
    return this.tier >= MAX_TIER;
  }

  /** Naechste Stufe eines Endlos-Upgrades kaufen. */
  buyUpgrade(id: UpgradeId): boolean {
    const u = upgradeById(id);
    if (!u || !this.upgradesUnlocked) return false;
    const cost = upgradeCost(u, this.upgradeLevel(id));
    if (!this.canAfford(cost)) return false;
    this.pay(cost);
    this.setUpgradeLevel(id, this.upgradeLevel(id) + 1);
    return true;
  }

  /** Stufe setzen und die Multiplikatoren neu berechnen (auch beim Laden). */
  setUpgradeLevel(id: UpgradeId, level: number) {
    if (level > 0) this.upgrades.set(id, level);
    else this.upgrades.delete(id);
    const f = (k: UpgradeId) => upgradeFactor(UPGRADES.find((u) => u.id === k)!, this.upgradeLevel(k));
    this.miningSpeed = f("mining");
    this.craftingSpeed = f("crafting");
    this.storageVersion++;
  }

  /** Strom-Multiplikator fuer Hub und Kraftwerke. */
  get powerBonus(): number {
    return upgradeFactor(UPGRADES.find((u) => u.id === "power")!, this.upgradeLevel("power"));
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

  isExplored(x: number, y: number): boolean {
    return !this.fog || this.explored.has(cellKey(Math.floor(x / FOG_CELL), Math.floor(y / FOG_CELL)));
  }

  /** Lichtet den Nebel im Kreis `r` um Feld (x, y). */
  reveal(x: number, y: number, r: number) {
    const c0x = Math.floor((x - r) / FOG_CELL);
    const c1x = Math.floor((x + r) / FOG_CELL);
    const c0y = Math.floor((y - r) / FOG_CELL);
    const c1y = Math.floor((y + r) / FOG_CELL);
    const cx = x + 0.5;
    const cy = y + 0.5;
    const fresh: [number, number][] = [];
    for (let gy = c0y; gy <= c1y; gy++) {
      for (let gx = c0x; gx <= c1x; gx++) {
        // Naechster Punkt der Zelle zum Mittelpunkt.
        const dx = Math.max(gx * FOG_CELL - cx, 0, cx - (gx + 1) * FOG_CELL);
        const dy = Math.max(gy * FOG_CELL - cy, 0, cy - (gy + 1) * FOG_CELL);
        if (dx * dx + dy * dy > r * r) continue;
        const key = cellKey(gx, gy);
        if (this.explored.has(key)) continue;
        this.explored.add(key);
        this.exploredVersion++;
        fresh.push([gx, gy]);
      }
    }
    if (this.fog) for (const [gx, gy] of fresh) this.spawnWreck(gx, gy);
  }

  /** Wracks in diesen (frisch erkundeten) Zellen auftauchen lassen. */
  spawnWrecks(cells: number[]) {
    for (const k of cells) this.spawnWreck(...cellOf(k));
  }

  /** Liegt in der frisch erkundeten Zelle ein Wrack, taucht es jetzt auf. */
  private spawnWreck(gx: number, gy: number) {
    const per = WRECK_REGION / FOG_CELL;
    const site = wreckSite(Math.floor(gx / per), Math.floor(gy / per), this.gen);
    if (!site || Math.floor(site.x / FOG_CELL) !== gx || Math.floor(site.y / FOG_CELL) !== gy) return;
    if (!this.entityAt(site.x, site.y)) this.place("wreck", site.x, site.y, Math.floor(hash(site.x, site.y, 7) * 4) as Dir);
  }

  /** Was im Wrack liegt (fuer die Vorschau im Panel). */
  wreckLoot(e: Entity): WreckLoot | null {
    return e.type === "wreck" ? wreckLoot(e.x, e.y, (id) => this.extraRecipes.has(id)) : null;
  }

  /** Wrack bergen: Teile ins Hub-Lager, Rezept freischalten, Wrack verschwindet. */
  salvage(e: Entity): WreckLoot | null {
    const loot = this.wreckLoot(e);
    if (!loot) return null;
    this.remove(e.x, e.y);
    this.refund(loot.items);
    if (loot.recipe) this.unlockRecipe(loot.recipe);
    this.salvaged++;
    return loot;
  }

  place(type: EntityType, x: number, y: number, dir: Dir, recipe: Recipe | null = null, layer: 0 | 1 = 0): Entity | null {
    if (!this.canPlace(type, x, y, layer)) return null;
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
      case "water_pump":
        e = new Extractor(id, x, y, dir, "water", type);
        break;
      case "pipe":
      case "pipe_pump":
      case "fluid_tank":
        e = new FluidCarrier(id, x, y, dir, type);
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
      case "radar":
        e = new Radar(id, x, y, dir);
        break;
      case "wreck":
        e = new Wreck(id, x, y, dir);
        break;
      case "generator_coal":
      case "generator_fuel":
      case "generator_steam":
        e = new Generator(id, x, y, dir, type);
        break;
      case "solar":
        e = new Solar(id, x, y, dir);
        break;
      case "accumulator":
        e = new Accumulator(id, x, y, dir);
        break;
      case "turret":
        e = new Turret(id, x, y, dir);
        break;
      case "tunnel": {
        const t = new Tunnel(id, x, y, dir);
        t.exit = this.tunnelWantsExit(x, y, dir);
        e = t;
        break;
      }
      case "drone_port": {
        // Ein Hafen ohne Ziel schickt kuenftig hierher (bequemes Verbinden beim Bauen).
        const p = new DronePort(id, x, y, dir);
        const open = [...this.entities.values()].find((o) => o instanceof DronePort && !o.target) as DronePort | undefined;
        if (open) open.target = { x, y };
        e = p;
        break;
      }
      case "ramp": {
        // Kommt von hinten ein Hochband an, fuehrt die Rampe hinunter.
        const r = new Ramp(id, x, y, dir);
        const back = this.entityAt(x - DX[dir], y - DY[dir], 1);
        r.up = !(back instanceof Conveyor && back.outputsTo(x, y, 1));
        e = r;
        break;
      }
    }
    e.layer = layer;
    this.entities.set(id, e);
    for (const l of slotsOf(e)) this.grid.set(slotKey(x, y, l), e);
    this.reveal(x, y, REVEAL_RADIUS[type] ?? REVEAL_DEFAULT);
    this.version++;
    return e;
  }

  remove(x: number, y: number, layer = 0): Entity | undefined {
    const e = this.entityAt(x, y, layer);
    if (!e) return undefined;
    this.entities.delete(e.id);
    for (const l of slotsOf(e)) this.grid.delete(slotKey(x, y, l));
    this.hazards.damage.delete(e.id);
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

  /** Rampe zwischen hinauf und hinunter umschalten. */
  toggleRamp(r: Ramp) {
    r.up = !r.up;
    this.version++;
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
    this.fluids.tick(this.powerFactor);
    for (const e of this.entities.values()) e.update(this);
    this.hazards.update(this);
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
    // Endlos-Upgrade Netzausbau verstaerkt alle Erzeuger.
    const boost = this.powerBonus;
    fixed *= boost;
    solar *= boost;
    gen *= boost;
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
      const n = this.entityAt(belt.x + DX[side], belt.y + DY[side], belt.layer);
      return !!n && n.outputsTo(belt.x, belt.y, belt.layer);
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

/** Kantenlaenge einer Nebel-Zelle in Feldern. */
export const FOG_CELL = 4;
/** So weit lichtet jedes Gebaeude den Nebel; Hub und Radar deutlich weiter. */
const REVEAL_DEFAULT = 6;
export const REVEAL_RADIUS: Partial<Record<EntityType, number>> = { hub: 24, radar: 44, wreck: 0 };

export const cellKey = (cx: number, cy: number) => (cx + 0x8000) * 0x10000 + (cy + 0x8000);
export const cellOf = (key: number): [number, number] => [Math.floor(key / 0x10000) - 0x8000, (key % 0x10000) - 0x8000];

/** Entity-Typ, den eine Bau-Id erzeugt (schnelle Baender und Hochbaender sind Baender). */
export function entityTypeOf(id: BuildId): EntityType {
  return BELT_LEVEL[id] || id === "bridge" ? "belt" : (id as EntityType);
}

/** Ebene, auf der eine Bau-Id entsteht. */
export function layerOf(id: BuildId): 0 | 1 {
  return id === "bridge" ? 1 : 0;
}

const slotKey = (x: number, y: number, layer: number) => (layer ? `${x},${y},${layer}` : tileKey(x, y));

/** Belegte Ebenen eines Gebaeudes: Rampen belegen beide. */
const slotsOf = (e: Entity): number[] => (e.type === "ramp" ? [0, 1] : [e.layer]);

/** Bau-Id eines vorhandenen Gebaeudes (fuer Kosten beim Abreissen). */
export function buildIdOf(e: Entity): BuildId {
  if (e instanceof Belt && e.layer === 1) return "bridge";
  if (e instanceof Belt) return e.level === 3 ? "belt_mk3" : e.level === 2 ? "belt_mk2" : "belt";
  return e.type;
}
