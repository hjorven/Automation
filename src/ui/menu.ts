import { decodeSave, deserialize, encodeSave, type SaveData } from "../sim/save";
import { byId } from "./dom";

export interface MenuActions {
  /** Aktueller Spielstand (fuer den Export). */
  snapshot(): SaveData;
  /** Ersetzt das laufende Spiel durch `data` bzw. ein neues Spiel (null). */
  replace(data: SaveData | null): Promise<void>;
  lastSavedAt(): number | null;
  restartTutorial(): void;
  /** Friedlicher Modus: keine Kreaturen und Angriffe. */
  peaceful(): boolean;
  setPeaceful(on: boolean): void;
}

/** Spiel-Menue: Export/Import als Text oder Datei, neues Spiel. */
export class Menu {
  private readonly el = byId("menu");
  private readonly scrim = byId("scrim");

  constructor(private readonly actions: MenuActions) {
    this.el.addEventListener("click", this.onClick);
    this.el.addEventListener("change", this.onFile);
    this.scrim.addEventListener("click", () => this.isOpen && this.close());
    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.isOpen) this.close();
    });
  }

  open() {
    const saved = this.actions.lastSavedAt();
    this.el.innerHTML =
      `<div class="title">Spiel</div>` +
      `<div class="label">Die Fabrik wird automatisch in diesem Browser gespeichert` +
      (saved ? ` (zuletzt ${new Date(saved).toLocaleTimeString("de-DE")}).` : ".") +
      `</div>` +
      `<div class="caps">Spielstand übertragen</div>` +
      `<div class="label">Exportieren sichert die Fabrik als Code, z. B. für ein anderes Gerät.</div>` +
      `<textarea id="save-code" spellcheck="false" placeholder="Spielstand-Code hier einfügen"></textarea>` +
      `<div id="menu-msg" class="msg"></div>` +
      `<div class="actions">` +
      `<button data-action="export">Code kopieren</button>` +
      `<button data-action="download">Als Datei</button>` +
      `</div><div class="actions">` +
      `<button data-action="import">Code laden</button>` +
      `<label class="file-btn">Datei laden<input type="file" accept=".txt,text/plain" hidden></label>` +
      `</div><div class="caps">Herausforderung</div>` +
      `<div class="label" id="peaceful-label">${this.peacefulText()}</div>` +
      `<div class="actions"><button data-action="peaceful" id="peaceful-btn">${this.actions.peaceful() ? "Kreaturen einschalten" : "Friedlich spielen"}</button></div>` +
      `<div class="caps">Hilfe</div><div class="actions">` +
      `<button data-action="tutorial">Einführung neu starten</button>` +
      `</div><div class="actions">` +
      `<button data-action="new" class="danger">Neues Spiel</button>` +
      `<button data-action="close">Schließen</button>` +
      `</div>`;
    this.el.hidden = false;
    this.scrim.hidden = false;
  }

  private peacefulText(): string {
    return this.actions.peaceful()
      ? "Friedlicher Modus: Smog gibt es weiterhin, aber keine Kreaturen und Angriffe."
      : "Kreaturen an: Smog weckt Nester, nachts greifen sie an. Abwehrtürme schützen die Fabrik.";
  }

  close() {
    this.el.hidden = true;
    this.scrim.hidden = true;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  private get textarea() {
    return this.el.querySelector<HTMLTextAreaElement>("#save-code")!;
  }

  private message(text: string, error = false) {
    const m = this.el.querySelector<HTMLElement>("#menu-msg");
    if (!m) return;
    m.textContent = text;
    m.classList.toggle("error", error);
  }

  private onClick = async (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn) return;
    try {
      switch (btn.dataset.action) {
        case "export":
          await this.exportCode();
          break;
        case "download":
          await this.download();
          break;
        case "import":
          await this.importCode(this.textarea.value);
          break;
        case "new":
          if (confirm("Neues Spiel starten? Die aktuelle Fabrik geht verloren, wenn du sie nicht exportiert hast.")) {
            await this.actions.replace(null);
          }
          break;
        case "peaceful": {
          this.actions.setPeaceful(!this.actions.peaceful());
          btn.textContent = this.actions.peaceful() ? "Kreaturen einschalten" : "Friedlich spielen";
          this.el.querySelector("#peaceful-label")!.textContent = this.peacefulText();
          break;
        }
        case "tutorial":
          this.actions.restartTutorial();
          this.close();
          break;
        case "close":
          this.close();
          break;
      }
    } catch (err) {
      this.message(err instanceof Error ? err.message : String(err), true);
    }
  };

  private onFile = async (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    if (input.type !== "file") return; // "change" der Textarea bubbelt ebenfalls hierher
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await this.importCode(await file.text());
    } catch (err) {
      this.message(err instanceof Error ? err.message : String(err), true);
    }
  };

  private async exportCode() {
    const code = await encodeSave(this.actions.snapshot());
    const ta = this.textarea;
    ta.value = code;
    ta.select();
    try {
      await navigator.clipboard.writeText(code);
      this.message(`Code kopiert (${code.length} Zeichen).`);
    } catch {
      this.message("Kopieren nicht erlaubt: Code oben markieren und selbst kopieren.");
    }
  }

  private async download() {
    const code = await encodeSave(this.actions.snapshot());
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `automation-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.message("Datei erstellt.");
  }

  private async importCode(code: string) {
    if (!code.trim()) throw new Error("Bitte zuerst einen Code einfügen.");
    const raw = await decodeSave(code);
    deserialize(raw); // prueft den Stand, bevor das laufende Spiel ersetzt wird
    if (!confirm("Spielstand laden? Die aktuelle Fabrik wird ersetzt.")) return;
    await this.actions.replace(raw as SaveData);
  }
}

