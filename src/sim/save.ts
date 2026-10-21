import type { Dir } from "./dir";
import type { Belt, Entity, EntityType } from "./entities";
import { ITEM_ORDER, type ItemId } from "./items";
import { recipeById } from "./recipes";
import { World } from "./world";

/**
 * Versioniertes Spielstand-Format. Bei Aenderungen SAVE_VERSION erhoehen und
 * in `migrate` einen Schritt von der alten auf die neue Version ergaenzen.
 */
export const SAVE_VERSION = 1;

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
  /** Extractor */
  timer?: number;
  buffer?: ItemId | null;
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
  delivered: Stacks;
  entities: SavedEntity[];
}

export function serialize(world: World): SaveData {
  const entities = [...world.entities.values()].sort((a, b) => a.id - b.id).map(saveEntity);
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    tick: world.tick,
    delivered: [...world.delivered],
    entities,
  };
}

function saveEntity(e: Entity): SavedEntity {
  const base: SavedEntity = { type: e.type, x: e.x, y: e.y, dir: e.dir };
  switch (e.type) {
    case "belt":
      return { ...base, items: e.items.map((i) => ({ item: i.item, progress: i.progress, entry: i.entry })) };
    case "extractor":
      return { ...base, timer: e.timer, buffer: e.buffer };
    case "smelter":
    case "assembler":
      return {
        ...base,
        recipe: e.recipe?.id ?? null,
        input: [...e.input],
        output: [...e.output],
        progress: e.progress,
        crafting: e.crafting,
      };
    case "hub":
      return base;
  }
}

/** Baut eine Welt aus einem Spielstand. Wirft bei ungueltigen Daten. */
export function deserialize(raw: unknown): World {
  const data = migrate(raw);
  const w = new World();
  w.tick = data.tick;
  for (const [item, n] of data.delivered) {
    if (isItem(item) && n > 0) w.delivered.set(item, n);
  }

  for (const s of data.entities) {
    if (!isType(s.type) || !isDir(s.dir) || !Number.isInteger(s.x) || !Number.isInteger(s.y)) continue;
    const recipe = s.recipe ? (recipeById(s.recipe) ?? null) : null;
    const e = w.place(s.type, s.x, s.y, s.dir, recipe);
    if (!e) continue; // z. B. Bohrer ohne Erz darunter: still ueberspringen
    restoreState(e, s, w.tick);
  }
  return w;
}

function restoreState(e: Entity, s: SavedEntity, tick: number) {
  switch (e.type) {
    case "belt":
      restoreBelt(e, s.items ?? [], tick);
      break;
    case "extractor":
      e.timer = num(s.timer);
      e.buffer = s.buffer && isItem(s.buffer) ? s.buffer : null;
      break;
    case "smelter":
    case "assembler":
      for (const [item, n] of s.input ?? []) if (isItem(item) && n > 0) e.input.set(item, n);
      for (const [item, n] of s.output ?? []) if (isItem(item) && n > 0) e.output.set(item, n);
      e.progress = num(s.progress);
      e.crafting = !!s.crafting && !!e.recipe;
      break;
    case "hub":
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
  // Hier kuenftig: if (data.version === 1) { ...; data.version = 2; }
  if (!Array.isArray(data.entities) || !Array.isArray(data.delivered)) {
    throw new Error("Spielstand ist unvollständig");
  }
  return { savedAt: 0, tick: 0, ...data } as SaveData;
}

const ITEMS = new Set<string>(ITEM_ORDER);
const TYPES = new Set<string>(["belt", "extractor", "smelter", "assembler", "hub"]);
const isType = (v: unknown): v is EntityType => typeof v === "string" && TYPES.has(v);
const isItem = (v: unknown): v is ItemId => typeof v === "string" && ITEMS.has(v);
const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const CODE_PREFIX = "AUTO1:";

/** Spielstand als kopierbarer Text: komprimiertes JSON in Base64. */
export async function encodeSave(data: SaveData): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  const packed = await pipe(json, new CompressionStream("deflate-raw"));
  return CODE_PREFIX + toBase64(packed);
}

export async function decodeSave(code: string): Promise<unknown> {
  const text = code.replace(/\s+/g, "");
  if (!text.startsWith(CODE_PREFIX)) throw new Error("Das ist kein Spielstand-Code");
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(text.slice(CODE_PREFIX.length));
  } catch {
    throw new Error("Spielstand-Code ist beschädigt");
  }
  try {
    const json = await pipe(bytes, new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error("Spielstand-Code ist beschädigt");
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
