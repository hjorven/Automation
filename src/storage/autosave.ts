import type { SaveData } from "../sim/save";

const DB_NAME = "automation";
const STORE = "saves";
const AUTOSAVE_KEY = "autosave";
/**
 * Notfall-Kopie in localStorage: Beim Schliessen/Neuladen bleibt keine Zeit
 * fuer das asynchrone IndexedDB, localStorage schreibt dagegen sofort.
 */
const EMERGENCY_KEY = "automation-autosave";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function request<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Neuester vorhandener Stand aus IndexedDB oder der Notfall-Kopie. */
export async function loadAutosave(): Promise<unknown> {
  let fromDb: unknown = null;
  try {
    fromDb = await request("readonly", (s) => s.get(AUTOSAVE_KEY));
  } catch (err) {
    console.warn("IndexedDB nicht verfügbar", err);
  }
  let fromLs: unknown = null;
  try {
    const text = localStorage.getItem(EMERGENCY_KEY);
    if (text) fromLs = JSON.parse(text);
  } catch {
    // kaputte Notfall-Kopie ignorieren
  }
  return savedAt(fromLs) > savedAt(fromDb) ? fromLs : fromDb;
}

export async function writeAutosave(data: SaveData): Promise<void> {
  await request("readwrite", (s) => s.put(data, AUTOSAVE_KEY));
  removeEmergency();
}

/** Synchron speichern, z. B. in `pagehide`. */
export function writeEmergency(data: SaveData) {
  try {
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Notfall-Speichern fehlgeschlagen", err);
  }
}

export async function clearAutosave(): Promise<void> {
  removeEmergency();
  await request("readwrite", (s) => s.delete(AUTOSAVE_KEY));
}

function removeEmergency() {
  try {
    localStorage.removeItem(EMERGENCY_KEY);
  } catch {
    // ignorieren
  }
}

function savedAt(v: unknown): number {
  const t = (v as { savedAt?: unknown } | null)?.savedAt;
  return typeof t === "number" ? t : -1;
}
