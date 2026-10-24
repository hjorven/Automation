import { ITEM_COLORS, cssHex } from "../render3d/palette";
import { ITEM_NAMES, ITEM_ORDER, type ItemId } from "../sim/items";
import type { ItemStack, Recipe } from "../sim/recipes";
import { TICKS_PER_SECOND } from "../sim/constants";

// Kleine HTML-Bausteine, die mehrere UI-Teile teilen.

export function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt in index.html`);
  return el;
}

export function itemName(i: ItemId): string {
  return ITEM_NAMES[i] ?? i;
}

export function dot(i: ItemId, cls = ""): string {
  const c = cssHex(ITEM_COLORS[i] ?? 0x888888);
  return `<span class="dot ${cls}" style="background:${c};color:${c}"></span>`;
}

export function itemLabel(i: ItemId): string {
  return `${dot(i)}${itemName(i)}`;
}

/** Kostenchips; mit `storage` rot/gruen je nachdem, ob genug da ist. */
export function costChips(cost: readonly ItemStack[], storage?: ReadonlyMap<ItemId, number>): string {
  return cost
    .map((c) => {
      const cls = storage ? ((storage.get(c.item) ?? 0) >= c.count ? "have" : "missing") : "";
      return `<span class="chip ${cls}">${dot(c.item)}<span class="num">${c.count}</span>&nbsp;${itemName(c.item)}</span>`;
    })
    .join("");
}

/** Inhalt eines Speichers als Chips ("leer", wenn nichts drin ist). */
export function stackChips(m: ReadonlyMap<ItemId, number>): string {
  if (m.size === 0) return `<span class="muted">leer</span>`;
  return ITEM_ORDER.filter((i) => m.has(i))
    .map((i) => `<span class="chip">${dot(i)}<span class="num">${m.get(i)}</span></span>`)
    .join("");
}

/** Rezept als Zeile: Eingaenge -> Ausgaenge, Dauer in Sekunden. */
export function recipeHtml(r: Recipe): string {
  const side = (s: ItemStack[]) =>
    s.map((x) => `<span class="chip">${dot(x.item)}<span class="num">${x.count}</span>&nbsp;${itemName(x.item)}</span>`).join("");
  const secs = (r.ticks / TICKS_PER_SECOND).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const alt = r.alt ? `<span class="alt-name">Alternative: ${r.name ?? r.id}</span>` : "";
  return `${alt}${side(r.inputs)}<span class="arrow">&#9654;</span>${side(r.outputs)}<span class="time">${secs} s</span>`;
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** localStorage kann in privaten Fenstern fehlen oder werfen. */
export function loadPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function savePref(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ohne Speicher geht es eben ohne
  }
}
