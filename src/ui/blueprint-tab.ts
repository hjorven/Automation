import type { Editor } from "../game/editor";
import { blueprintCost } from "../sim/blueprint";
import { decodeBlueprint, encodeBlueprint, type BlueprintLibrary } from "../storage/blueprints";
import { escapeHtml } from "./blueprint-bar";
import { costChips } from "./dom";

/**
 * Reiter "Blaupausen" in der Uebersicht: gespeicherte Blaupausen laden,
 * umbenennen, loeschen und als Code weitergeben oder importieren.
 */
export class BlueprintTab {
  /** Steigt bei Aenderungen an der Liste (Reiter nur dann neu bauen, sonst geht Getipptes verloren). */
  version = 0;
  private note = "";

  constructor(
    private readonly editor: Editor,
    private readonly library: BlueprintLibrary,
    private readonly close: () => void,
    private readonly refresh: () => void,
  ) {}

  key(): string {
    return `${this.version}|${this.library.all.length}|${this.note}`;
  }

  html(): string {
    const list = this.library.all;
    let html =
      `<div class="muted" style="margin-bottom:10px">Blaupausen kopieren ganze Fabrikteile. ` +
      `Erstellen: Werkzeug „Blaupause“ (Taste C), Bereich aufziehen, Kopieren, Speichern.</div>`;
    if (!list.length) html += `<div class="empty-note">Noch keine Blaupausen gespeichert.</div>`;
    html += `<div class="bp-list">`;
    list.forEach((bp, i) => {
      html +=
        `<div class="bp-card"><div class="bp-name">${escapeHtml(bp.name)}</div>` +
        `<div class="muted">${bp.w} &times; ${bp.h} Felder &middot; ${bp.entries.length} Gebäude</div>` +
        `<div class="row">${costChips(blueprintCost(bp)) || `<span class="muted">kostenlos</span>`}</div>` +
        `<div class="bp-actions">` +
        `<button class="primary" data-bplib="use" data-i="${i}">Einfügen</button>` +
        `<button data-bplib="code" data-i="${i}">Code kopieren</button>` +
        `<button data-bplib="rename" data-i="${i}">Umbenennen</button>` +
        `<button class="danger" data-bplib="delete" data-i="${i}">Löschen</button></div></div>`;
    });
    html +=
      `</div><div class="caps" style="margin:18px 0 8px">Blaupause importieren</div>` +
      `<textarea id="bp-code" spellcheck="false" placeholder="Blaupausen-Code (BP1:...) hier einfügen"></textarea>` +
      `<div class="bp-actions" style="margin-top:8px"><button data-bplib="import">Importieren</button></div>` +
      (this.note ? `<div class="muted" style="margin-top:8px">${escapeHtml(this.note)}</div>` : "");
    return html;
  }

  /** true, wenn der Knopf zu diesem Reiter gehoerte. */
  onClick(btn: HTMLElement): boolean {
    const action = btn.dataset.bplib;
    if (!action) return false;
    const i = Number(btn.dataset.i);
    const bp = this.library.all[i];
    switch (action) {
      case "use":
        if (bp) {
          this.editor.bpLoad(bp);
          this.close();
        }
        break;
      case "rename":
        if (bp) {
          const name = window.prompt("Neuer Name", bp.name);
          if (name !== null) this.library.rename(i, name);
          this.changed();
        }
        break;
      case "delete":
        if (bp && window.confirm(`„${bp.name}“ löschen?`)) {
          this.library.remove(i);
          this.changed();
        }
        break;
      case "code":
        if (bp) void this.copyCode(bp, btn);
        break;
      case "import":
        void this.importCode();
        break;
    }
    return true;
  }

  private changed(note = "") {
    this.note = note;
    this.version++;
    this.refresh();
  }

  private async copyCode(bp: (typeof this.library.all)[number], btn: HTMLElement) {
    const code = await encodeBlueprint(bp);
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = "Kopiert";
    } catch {
      // Ohne Zugriff auf die Zwischenablage: Code ins Textfeld zum Markieren.
      const ta = document.getElementById("bp-code") as HTMLTextAreaElement | null;
      if (ta) {
        ta.value = code;
        ta.select();
      }
      btn.textContent = "Code steht unten";
    }
  }

  private async importCode() {
    const ta = document.getElementById("bp-code") as HTMLTextAreaElement | null;
    const text = ta?.value.trim() ?? "";
    if (!text) return;
    try {
      const bp = await decodeBlueprint(text);
      this.library.add(bp);
      this.changed(`„${bp.name}“ importiert.`);
    } catch (err) {
      this.changed(err instanceof Error ? err.message : "Import fehlgeschlagen");
    }
  }
}
