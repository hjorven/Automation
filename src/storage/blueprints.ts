import { parseBlueprint, type Blueprint } from "../sim/blueprint";
import { decodeCode, encodeCode } from "../sim/save";

const KEY = "automation.blueprints";
const CODE_PREFIX = "BP1:";

/**
 * Gespeicherte Blaupausen. Liegen in localStorage, gehoeren also zum Geraet
 * und gelten fuer jeden Spielstand. Weitergeben geht ueber Text-Codes.
 */
export class BlueprintLibrary {
  private list: Blueprint[] = [];

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(raw)) {
        for (const b of raw) {
          try {
            this.list.push(parseBlueprint(b));
          } catch {
            // Kaputte Eintraege still verwerfen.
          }
        }
      }
    } catch {
      // Privates Fenster oder kaputte Daten: leer anfangen.
    }
  }

  get all(): readonly Blueprint[] {
    return this.list;
  }

  add(bp: Blueprint): void {
    this.list.unshift(bp);
    this.persist();
  }

  remove(index: number): void {
    this.list.splice(index, 1);
    this.persist();
  }

  rename(index: number, name: string): void {
    const bp = this.list[index];
    if (!bp) return;
    this.list[index] = { ...bp, name: name.trim().slice(0, 40) || bp.name };
    this.persist();
  }

  /** Vorschlag fuer den naechsten Namen ("Blaupause 3"). */
  nextName(): string {
    let n = this.list.length + 1;
    while (this.list.some((b) => b.name === `Blaupause ${n}`)) n++;
    return `Blaupause ${n}`;
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.list));
    } catch {
      // Speicher voll oder gesperrt: bleibt fuer diese Sitzung erhalten.
    }
  }
}

export function encodeBlueprint(bp: Blueprint): Promise<string> {
  return encodeCode(CODE_PREFIX, bp);
}

export async function decodeBlueprint(code: string): Promise<Blueprint> {
  return parseBlueprint(await decodeCode(CODE_PREFIX, code, "Blaupausen"));
}
