import type { Dir } from "./dir";
import { Generator, Storage, type Belt, type Entity, type EntityType } from "./entities";
import { ITEM_ORDER, type ItemId } from "./items";
import { ACCUMULATOR, MAX_TIER } from "./progression";
import { recipeById } from "./recipes";
import { RESEARCH } from "./research";
import type { Order } from "./orders";
import { worldGen } from "./terrain";
import { World, cellKey, cellOf } from "./world";
import { upgradeById, type UpgradeId } from "./upgrades";

/**
 * Versioniertes Spielstand-Format. Bei Aenderungen SAVE_VERSION erhoehen und
 * in `migrate` einen Schritt von der alten auf die neue Version ergaenzen.
 */
export const SAVE_VERSION = 5;

type Stacks = [ItemId, number][];

interface SavedBeltItem {
  item: ItemId;
  progress: number;
  entry: Dir;
}

export interface SavedEntity {
  type: EntityType;
  x: number;
  y: number;
  dir: Dir;
  /** Belt */
  items?: SavedBeltItem[];
  /** Extractor, Splitter, Merger, Tunnel-Ausgang */
  timer?: number;
  buffer?: ItemId | null;
  /** Splitter */
  next?: number;
  /** Belt (seit v3) */
  level?: number;
  /** Lagerkiste */
  queue?: ItemId[];
  /** Sortierer */
  filter?: ItemId | null;
  /** Kraftwerk */
  fuel?: number;
  burnLeft?: number;
  /** Batteriespeicher: Ladung in MJ */
  stored?: number;
  /** Tunnel */
  exit?: boolean;
  transit?: [ItemId, number][];
  /** Machine */
  recipe?: string | null;
  input?: Stacks;
  output?: Stacks;
  progress?: number;
  crafting?: boolean;
}

export interface SaveData {
  version: number;
  savedAt: number;
  tick: number;
  /** Hub-Stufe (seit v2). */
  tier: number;
  /** Hub-Lager (seit v2; v1 hatte stattdessen `delivered`). */
  storage: Stacks;
  /** Insgesamt Abgeliefertes (seit v3). */
  delivered?: Stacks;
  /** Erforschte Knoten (seit v4). */
  research?: string[];
  /** Einzeln freigeschaltete Rezepte (seit v4). */
  extraRecipes?: string[];
  /** Auftraege (seit v4). */
  orders?: Order[];
  orderSeq?: number;
  ordersDone?: number;
  /** Weltgenerator (seit v5): 1 = alte Welt ohne Biome, 2 = Biome. */
  gen: number;
  /** Erkundete Nebel-Zellen als flache Liste [x0, y0, x1, y1, ...]; fehlt sie, zaehlt die Umgebung der Gebaeude. */
  explored?: number[];
  /** Geborgene Wracks. */
  salvaged?: number;
  /** Endlos-Upgrades: Id und Stufe (optional, fehlt in aelteren Staenden). */
  upgrades?: [string, number][];
  /** Bester Fabrikwert pro Minute (optional). */
  bestScore?: number;
  entities: SavedEntity[];
}

export function serialize(world: World): SaveData {
  const entities = [...world.entities.values()].sort((a, b) => a.id - b.id).map(saveEntity);
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    tick: world.tick,
    tier: world.tier,
    gen: world.gen.version,
    explored: [...world.explored].flatMap(cellOf),
    salvaged: world.salvaged,
    storage: [...world.storage],
    delivered: [...world.delivered],
    research: [...world.research],
    extraRecipes: [...world.extraRecipes],
    orders: world.orders.map((o) => ({ ...o, reward: o.reward.map((r) => ({ ...r })) })),
    orderSeq: world.orderSeq,
    ordersDone: world.ordersDone,
    upgrades: [...world.upgrades],
    bestScore: world.bestScore,
    entities,
  };
}

function saveEntity(e: Entity): SavedEntity {
  const base: SavedEntity = { type: e.type, x: e.x, y: e.y, dir: e.dir };
  switch (e.type) {
    case "belt":
      return {
        ...base,
        level: e.level,
        items: e.items.map((i) => ({ item: i.item, progress: i.progress, entry: i.entry })),
      };
    case "extractor":
    case "extractor_mk2":
    case "extractor_mk3":
    case "pump":
      return { ...base, timer: e.timer, buffer: e.buffer };
    case "storage":
      return { ...base, queue: [...e.queue] };
    case "sorter":
      return { ...base, filter: e.filter, buffer: e.buffer, next: e.next };
    case "generator_coal":
    case "generator_fuel":
      return { ...base, fuel: e.fuel, burnLeft: e.burnLeft };
    case "accumulator":
      return { ...base, stored: e.stored };
    case "solar":
      return base;
    case "splitter":
      return { ...base, buffer: e.buffer, next: e.next };
    case "merger":
      return { ...base, buffer: e.buffer };
    case "tunnel":
      return { ...base, exit: e.exit, buffer: e.buffer, transit: e.transit.map((t) => [t.item, t.left]) };
    case "smelter":
    case "assembler":
    case "foundry":
    case "refinery":
    case "manufacturer":
      return {
        ...base,
        recipe: e.recipe?.id ?? null,
        input: [...e.input],
        output: [...e.output],
        progress: e.progress,
        crafting: e.crafting,
      };
    case "hub":
    case "radar":
    case "wreck":
      return base;
  }
}

/** Baut eine Welt aus einem Spielstand. Wirft bei ungueltigen Daten. */
export function deserialize(raw: unknown): World {
  const data = migrate(raw);
  const w = new World();
  w.gen = worldGen(data.gen);
  // Erst alle Gebaeude setzen, dann Wracks im neu Gelichteten: sonst koennte
  // ein Wrack das Feld eines alten Gebaeudes besetzen.
  w.fog = false;
  w.salvaged = Math.max(0, Math.floor(num(data.salvaged)));
  w.tick = data.tick;
  w.tier = Math.min(MAX_TIER, Math.max(0, Math.floor(num(data.tier))));
  for (const [item, n] of data.storage) {
    if (isItem(item) && n > 0) w.storage.set(item, n);
  }
  for (const [item, n] of data.delivered ?? []) {
    if (isItem(item) && n > 0) w.delivered.set(item, n);
  }
  for (const id of data.research ?? []) if (typeof id === "string") w.grantResearch(id);
  for (const id of data.extraRecipes ?? []) if (typeof id === "string") w.unlockRecipe(id);
  w.orderSeq = Math.max(0, Math.floor(num(data.orderSeq)));
  w.ordersDone = Math.max(0, Math.floor(num(data.ordersDone)));
  for (const o of Array.isArray(data.orders) ? data.orders : []) {
    if (!o || !isItem(o.item) || !(num(o.count) > 0) || !Array.isArray(o.reward)) continue;
    const reward = o.reward.filter((r) => isItem(r?.item) && num(r.count) > 0).map((r) => ({ item: r.item, count: Math.floor(r.count) }));
    w.orders.push({ item: o.item, count: Math.floor(o.count), reward, ...(typeof o.recipe === "string" && recipeById(o.recipe) ? { recipe: o.recipe } : {}) });
  }
  w.fillOrders();
  const cells = Array.isArray(data.explored) ? data.explored : [];
  for (let i = 0; i + 1 < cells.length; i += 2) {
    if (Number.isInteger(cells[i]) && Number.isInteger(cells[i + 1])) w.explored.add(cellKey(cells[i], cells[i + 1]));
  }
  const savedCells = [...w.explored];
  for (const [id, level] of Array.isArray(data.upgrades) ? data.upgrades : []) {
    if (upgradeById(id)) w.setUpgradeLevel(id as UpgradeId, Math.max(0, Math.floor(num(level))));
  }
  w.bestScore = Math.max(0, num(data.bestScore));

  for (const s of data.entities) {
    if (!isType(s.type) || !isDir(s.dir) || !Number.isInteger(s.x) || !Number.isInteger(s.y)) continue;
    const recipe = s.recipe ? (recipeById(s.recipe) ?? null) : null;
    const e = w.place(s.type, s.x, s.y, s.dir, recipe);
    if (!e) continue; // z. B. Bohrer ohne Erz darunter: still ueberspringen
    restoreState(e, s, w.tick);
  }
  const before = new Set(savedCells);
  w.fog = true;
  w.spawnWrecks([...w.explored].filter((k) => !before.has(k)));
  return w;
}

function restoreState(e: Entity, s: SavedEntity, tick: number) {
  switch (e.type) {
    case "belt":
      e.level = s.level === 2 || s.level === 3 ? s.level : 1;
      restoreBelt(e, s.items ?? [], tick);
      break;
    case "extractor":
    case "extractor_mk2":
    case "extractor_mk3":
    case "pump":
      e.timer = num(s.timer);
      e.buffer = item(s.buffer);
      break;
    case "storage":
      for (const i of s.queue ?? []) if (isItem(i) && e.queue.length < Storage.CAPACITY) e.queue.push(i);
      break;
    case "sorter":
      e.filter = item(s.filter);
      e.buffer = item(s.buffer);
      e.next = Math.floor(num(s.next)) % 3;
      break;
    case "generator_coal":
    case "generator_fuel":
      e.fuel = Math.min(Generator.FUEL_CAPACITY, Math.max(0, Math.floor(num(s.fuel))));
      e.burnLeft = Math.max(0, num(s.burnLeft));
      break;
    case "accumulator":
      e.stored = Math.min(ACCUMULATOR.capacity, Math.max(0, num(s.stored)));
      break;
    case "solar":
      break;
    case "splitter":
      e.buffer = item(s.buffer);
      e.next = Math.floor(num(s.next)) % 3;
      break;
    case "merger":
      e.buffer = item(s.buffer);
      break;
    case "tunnel":
      e.exit = !!s.exit;
      e.buffer = e.exit ? item(s.buffer) : null;
      if (!e.exit) {
        for (const [i, left] of s.transit ?? []) if (isItem(i)) e.transit.push({ item: i, left: Math.max(0, num(left)) });
      }
      break;
    case "smelter":
    case "assembler":
    case "foundry":
    case "refinery":
    case "manufacturer":
      for (const [item, n] of s.input ?? []) if (isItem(item) && n > 0) e.input.set(item, n);
      for (const [item, n] of s.output ?? []) if (isItem(item) && n > 0) e.output.set(item, n);
      e.progress = num(s.progress);
      e.crafting = !!s.crafting && !!e.recipe;
      break;
    case "hub":
    case "radar":
    case "wreck":
      break;
  }
}

function restoreBelt(belt: Belt, items: SavedBeltItem[], tick: number) {
  for (const i of items) {
    if (!isItem(i.item) || !isDir(i.entry)) continue;
    const progress = Math.min(1, Math.max(0, num(i.progress)));
    belt.items.push({ item: i.item, progress, prev: progress, entry: i.entry, movedAt: tick - 1 });
  }
}

/** Bringt aeltere Spielstaende auf SAVE_VERSION. */
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") throw new Error("Kein gültiger Spielstand");
  const data = raw as Partial<SaveData>;
  if (typeof data.version !== "number") throw new Error("Spielstand ohne Version");
  if (data.version > SAVE_VERSION) {
    throw new Error(`Spielstand ist neuer (v${data.version}) als dieses Spiel (v${SAVE_VERSION})`);
  }
  if (data.version === 1) {
    // v1 -> v2: Hub-Stufen. Alles bisher Abgelieferte liegt nun im Lager,
    // die Stufen kauft man danach selbst.
    const v1 = data as Partial<SaveData> & { delivered?: Stacks };
    data.storage = v1.delivered;
    data.tier = 0;
    delete v1.delivered;
    data.version = 2;
  }
  if (data.version === 2) {
    // v2 -> v3: 12 statt 6 Hub-Stufen. Alte Stufe auf die neue mit gleichem
    // Inhalt abbilden (Stahl war 3, ist jetzt 4; Bohrer Mk2 war 4, ist jetzt 5).
    const map = [0, 1, 2, 4, 5, 6];
    data.tier = map[Math.min(map.length - 1, Math.max(0, Math.floor(num(data.tier))))];
    data.delivered = data.storage;
    data.version = 3;
  }
  if (data.version === 3) {
    // v3 -> v4: Forschungsbaum. Was frueher die erreichte Stufe freigeschaltet
    // hat, gilt als erforscht; Auftraege entstehen beim Laden neu.
    const tier = Math.floor(num(data.tier));
    data.research = RESEARCH.filter((n) => n.legacyTier !== undefined && n.legacyTier <= tier).map((n) => n.id);
    data.version = 4;
  }
  if (data.version === 4) {
    // v4 -> v5: Biome. Alte Welten behalten ihren Generator, damit jeder Bohrer
    // auf seinem Erz bleibt.
    data.gen = 1;
    data.version = 5;
  }
  if (!Array.isArray(data.entities) || !Array.isArray(data.storage)) {
    throw new Error("Spielstand ist unvollständig");
  }
  return { savedAt: 0, tick: 0, gen: 2, ...data } as SaveData;
}

const ITEMS = new Set<string>(ITEM_ORDER);
const TYPES = new Set<string>([
  "belt",
  "extractor",
  "extractor_mk2",
  "extractor_mk3",
  "pump",
  "smelter",
  "assembler",
  "foundry",
  "refinery",
  "manufacturer",
  "generator_coal",
  "generator_fuel",
  "hub",
  "splitter",
  "merger",
  "tunnel",
  "storage",
  "sorter",
  "solar",
  "accumulator",
  "radar",
  "wreck",
]);
const isType = (v: unknown): v is EntityType => typeof v === "string" && TYPES.has(v);
const isItem = (v: unknown): v is ItemId => typeof v === "string" && ITEMS.has(v);
const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;
const item = (v: unknown): ItemId | null => (isItem(v) ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const CODE_PREFIX = "AUTO1:";

/** Spielstand als kopierbarer Text: komprimiertes JSON in Base64. */
export function encodeSave(data: SaveData): Promise<string> {
  return encodeCode(CODE_PREFIX, data);
}

export function decodeSave(code: string): Promise<unknown> {
  return decodeCode(CODE_PREFIX, code, "Spielstand");
}

/** Beliebige Daten als Text-Code mit Kennung (auch fuer Blaupausen). */
export async function encodeCode(prefix: string, data: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  const packed = await pipe(json, new CompressionStream("deflate-raw"));
  return prefix + toBase64(packed);
}

export async function decodeCode(prefix: string, code: string, what: string): Promise<unknown> {
  const text = code.replace(/\s+/g, "");
  if (!text.startsWith(prefix)) throw new Error(`Das ist kein ${what}-Code`);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(text.slice(prefix.length));
  } catch {
    throw new Error(`${what}-Code ist beschädigt`);
  }
  try {
    const json = await pipe(bytes, new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error(`${what}-Code ist beschädigt`);
  }
}

async function pipe(input: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([input]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
