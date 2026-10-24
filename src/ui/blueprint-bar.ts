import type { Editor } from "../game/editor";
import { blueprintCost, normRect } from "../sim/blueprint";
import type { BlueprintLibrary } from "../storage/blueprints";
import { byId, costChips } from "./dom";

/**
 * Leiste ueber der Werkzeugleiste, solange das Blaupausen-Werkzeug aktiv ist.
 * Alle Schritte gehen per Knopf, damit es mit einem Finger auf dem iPad klappt:
 * Bereich aufziehen, Kopieren, Vorschau antippen oder ziehen, Einfuegen.
 */
export class BlueprintBar {
  private readonly el = byId("bpbar");
  private key = "";
  /** Abreissen braucht einen zweiten Tipp zur Bestaetigung. */
  private confirmDemolish = false;

  constructor(
    private readonly editor: Editor,
    private readonly library: BlueprintLibrary,
    private readonly onLibrary: () => void,
    private readonly toast: (text: string, kind?: "info" | "ok" | "bad") => void,
  ) {
    this.el.addEventListener("click", this.onClick);
  }

  /** Bei Aenderungen am Editor und regelmaessig (Kosten) aufrufen. */
  update() {
    const ed = this.editor;
    const active = ed.tool === "blueprint";
    this.el.hidden = !active;
    if (!active) {
      this.confirmDemolish = false;
      return;
    }
    const bp = ed.bp;
    const w = ed.world;
    const r = bp.rect;
    const key = [
      bp.mode,
      r ? `${r.x0},${r.y0},${r.x1},${r.y1}` : "",
      bp.at ? "at" : "",
      bp.clip ? `${bp.clip.name}|${bp.clip.w}x${bp.clip.h}` : "",
      w.storageVersion,
      w.version,
      this.confirmDemolish,
    ].join("|");
    if (key === this.key) return;
    this.key = key;

    let info = "";
    let buttons = "";
    if (bp.mode === "select") {
      if (!r) {
        info = `<div class="bp-title">Bereich markieren</div><div class="muted">Mit dem Finger ein Rechteck über die Gebäude ziehen.</div>`;
      } else {
        const n = normRect(r);
        let count = 0;
        for (const e of w.entities.values()) {
          if (e.type !== "hub" && e.x >= n.x0 && e.x <= n.x1 && e.y >= n.y0 && e.y <= n.y1) count++;
        }
        info =
          `<div class="bp-title">${n.x1 - n.x0 + 1} &times; ${n.y1 - n.y0 + 1} Felder</div>` +
          `<div class="muted">${count === 1 ? "1 Gebäude" : `${count} Gebäude`} markiert</div>`;
        buttons +=
          `<button class="primary" data-bp="copy"${count ? "" : " disabled"}>Kopieren</button>` +
          `<button class="danger" data-bp="demolish"${count ? "" : " disabled"}>${this.confirmDemolish ? "Wirklich abreißen?" : "Abreißen"}</button>`;
      }
      if (bp.clip) buttons += `<button data-bp="back">Zur Kopie</button>`;
    } else if (bp.clip) {
      const clip = bp.clip;
      info = `<div class="bp-title">${escapeHtml(clip.name)} <span class="muted">${clip.w} &times; ${clip.h}</span></div>`;
      if (!bp.at) {
        info += `<div class="muted">Tippe auf die Stelle, an die die Kopie soll.</div>`;
      } else {
        const cost = blueprintCost(clip);
        info += cost.length ? `<div class="bp-cost">${costChips(cost, w.storage)}</div>` : `<div class="muted">kostenlos</div>`;
      }
      buttons +=
        `<button data-bp="rotate">Drehen</button>` +
        `<button class="primary" data-bp="paste"${bp.at ? "" : " disabled"}>Einfügen</button>` +
        `<button data-bp="save">Speichern</button>` +
        `<button data-bp="select">Neuer Bereich</button>`;
    }
    buttons += `<button data-bp="library">Bibliothek</button><button data-bp="done">Fertig</button>`;
    this.el.innerHTML = `<div class="bp-info">${info}</div><div class="bp-actions">${buttons}</div>`;
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-bp]");
    if (!btn || btn.disabled) return;
    const ed = this.editor;
    const action = btn.dataset.bp;
    if (action !== "demolish") this.confirmDemolish = false;
    switch (action) {
      case "copy":
        if (!ed.bpCopy()) this.toast("Im Bereich steht nichts zum Kopieren", "bad");
        break;
      case "demolish":
        if (!this.confirmDemolish) {
          this.confirmDemolish = true;
          this.key = "";
          this.update();
        } else {
          this.confirmDemolish = false;
          const n = ed.bpDemolish();
          this.toast(`${n} Gebäude abgerissen, Kosten zurück im Lager`, "ok");
        }
        break;
      case "back":
        ed.bp.mode = "paste";
        ed.bp.rect = null;
        this.key = "";
        this.update();
        break;
      case "rotate":
        ed.bpRotate();
        break;
      case "paste":
        ed.bpPaste();
        break;
      case "save": {
        const clip = ed.bp.clip;
        if (!clip) break;
        const name = window.prompt("Name der Blaupause", clip.name.startsWith("Blaupause") ? this.library.nextName() : clip.name);
        if (name === null) break;
        const saved = { ...clip, name: name.trim().slice(0, 40) || this.library.nextName() };
        ed.bp.clip = saved;
        this.library.add(saved);
        this.toast(`„${saved.name}“ gespeichert`, "ok");
        this.key = "";
        this.update();
        break;
      }
      case "select":
        ed.bpSelectMode();
        break;
      case "library":
        this.onLibrary();
        break;
      case "done":
        ed.setTool("hand");
        break;
    }
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
