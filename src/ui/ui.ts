import "./style.css";
import type { Editor, Tool } from "../game/editor";
import { renderThumbnails } from "../render3d/thumbnails";
import { ITEM_NAMES } from "../sim/items";
import { TIERS } from "../sim/progression";
import { recipeById } from "../sim/recipes";
import { TOOL_KEYS, toolName } from "./catalog";
import { dot } from "./dom";
import { Hud, Toasts, showTierBanner } from "./hud";
import { Overview, type OverviewTab } from "./overview";
import { Panel } from "./panel";
import { DeliveryStats } from "./stats";
import { Toolbar } from "./toolbar";
import { Tutorial } from "./tutorial";

const ERROR_TEXT: Record<string, string> = {
  locked: "Noch nicht freigeschaltet",
  cost: "Nicht genug im Hub-Lager",
  blocked: "Feld ist belegt",
  water: "Nicht auf Wasser",
};

/**
 * HTML-Oberflaeche ueber dem 3D-Bild. Verteilt die Arbeit auf HUD,
 * Werkzeugleiste, Info-Panel, Uebersicht und Tutorial.
 */
export class Ui {
  private readonly thumbs = renderThumbnails();
  private readonly toolbar: Toolbar;
  private readonly hud: Hud;
  private readonly panel: Panel;
  private readonly overview: Overview;
  private readonly tutorial: Tutorial;
  private readonly toasts = new Toasts();
  private tier: number;
  private errorAt = 0;
  private storageVersion = -1;
  /** Letzte Fingerposition auf dem Spielfeld (fuer Hinweise am Finger). */
  private pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  constructor(
    private readonly editor: Editor,
    onMenu: () => void,
  ) {
    const stats = new DeliveryStats(editor.world);
    const unlocks = (tier: number) => this.unlocksHtml(tier);
    this.toolbar = new Toolbar(editor, this.thumbs, onMenu);
    this.hud = new Hud(editor, (tab) => this.openOverview(tab));
    this.panel = new Panel(editor, this.thumbs, unlocks, () => this.openOverview("tiers"));
    this.overview = new Overview(editor, stats, unlocks);
    this.tutorial = new Tutorial(editor, (t) => this.toolbar.buttonFor(t));
    this.tier = editor.world.tier;

    window.addEventListener("keydown", this.onKey);
    const track = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName === "CANVAS") this.pointer = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("pointermove", track, true);

    editor.onChange(() => this.onEditorChange());
    this.onEditorChange();
  }

  openOverview(tab?: OverviewTab) {
    this.overview.open(tab);
  }

  restartTutorial() {
    this.tutorial.restart();
  }

  /** Regelmaessig aufrufen (einige Male pro Sekunde) fuer Zaehler und Fortschritt. */
  tick() {
    const w = this.editor.world;
    if (w.tier !== this.tier) this.onTierChange();
    if (w.storageVersion !== this.storageVersion) {
      this.storageVersion = w.storageVersion;
      this.toolbar.refresh();
    }
    this.hud.update();
    this.panel.update();
    this.overview.update();
    this.tutorial.update();
  }

  private onEditorChange() {
    const err = this.editor.lastError;
    if (err && err.at !== this.errorAt) {
      this.errorAt = err.at;
      this.toasts.float(ERROR_TEXT[err.error] ?? "Geht hier nicht", this.pointer.x, this.pointer.y);
    }
    this.toolbar.refresh();
    this.panel.render();
    this.hud.update();
    this.tutorial.update();
  }

  private onTierChange() {
    const w = this.editor.world;
    const gained = w.tier > this.tier;
    this.tier = w.tier;
    if (!gained) return;
    showTierBanner(w.tier, this.unlocksHtml(w.tier));
    this.toolbar.markFresh(TIERS[w.tier].buildings as Tool[]);
    this.toasts.show(`Stufe ${w.tier} erreicht: ${TIERS[w.tier].name}`, "ok", 4000);
    this.toolbar.refresh();
    this.panel.render();
  }

  /** Was Stufe `tier` freischaltet, als Chips mit Modellbildern. */
  private unlocksHtml(tier: number): string {
    const t = TIERS[tier];
    if (!t) return "";
    const buildings = t.buildings.map((b) => {
      const img = this.thumbs[b];
      return `<span class="unlock">${img ? `<img src="${img}" alt="">` : ""}${toolName(b)}</span>`;
    });
    const recipes = t.recipes.map((id) => {
      const out = recipeById(id)?.outputs[0]?.item;
      return `<span class="unlock recipe">${out ? `${dot(out)}${ITEM_NAMES[out]}` : id}</span>`;
    });
    return [...buildings, ...recipes].join("");
  }

  private onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.target as HTMLElement).closest("textarea, input")) return;
    const k = ev.key.toLowerCase();
    const tool = Object.keys(TOOL_KEYS).find((t) => TOOL_KEYS[t] === k) as Tool | undefined;
    if (tool) this.editor.setTool(tool);
    else if (k === "r") this.editor.rotate();
    else if (k === "i") this.overview.isOpen ? this.overview.close() : this.openOverview();
    else if (ev.key === "Escape") {
      if (this.overview.isOpen) this.overview.close();
      else {
        this.editor.setTool("hand");
        this.editor.clearSelection();
      }
    }
  };
}
