import type { Editor, Tool } from "../game/editor";
import { ITEM_STYLE } from "../render/item-style";
import type { Entity } from "../sim/entities";
import { GOALS, currentGoalIndex } from "../sim/goals";
import { ITEM_NAMES, ITEM_ORDER, type ItemId } from "../sim/items";
import { recipeById, recipesFor, type ItemStack, type Recipe } from "../sim/recipes";

const TOOLS: { tool: Tool; label: string; key: string; color: string }[] = [
  { tool: "hand", label: "Hand", key: "1", color: "#cfd8e3" },
  { tool: "belt", label: "Band", key: "2", color: "#3a4757" },
  { tool: "extractor", label: "Bohrer", key: "3", color: "#3d4f63" },
  { tool: "smelter", label: "Schmelze", key: "4", color: "#6b3f2a" },
  { tool: "assembler", label: "Montage", key: "5", color: "#2f4a6b" },
  { tool: "hub", label: "Hub", key: "6", color: "#6e5d22" },
  { tool: "delete", label: "Abriss", key: "7", color: "#8a3030" },
];

const ARROWS = ["→", "↓", "←", "↑"]; // rechts, unten, links, oben

const ENTITY_NAMES: Record<Entity["type"], string> = {
  belt: "Förderband",
  extractor: "Bohrer",
  smelter: "Schmelze",
  assembler: "Montierer",
  hub: "Hub",
};

/** HTML-Overlay: Werkzeugleiste, Auftrag/Lager (HUD) und Info-Panel. */
export class Ui {
  private readonly toolbar = byId("toolbar");
  private readonly hud = byId("hud");
  private readonly panel = byId("panel");
  private hudVersion = -1;

  constructor(
    private readonly editor: Editor,
    private readonly onMenu: () => void,
  ) {
    this.buildToolbar();
    this.panel.addEventListener("click", this.onPanelClick);
    window.addEventListener("keydown", this.onKey);
    editor.onChange(() => this.refresh());
    this.refresh();
  }

  /** Regelmaessig aufrufen (einige Male pro Sekunde) fuer Zaehler und Fortschritt. */
  tick() {
    const w = this.editor.world;
    if (w.deliveredVersion !== this.hudVersion) {
      this.hudVersion = w.deliveredVersion;
      this.renderHud();
    }
    const stats = this.panel.querySelector<HTMLElement>("[data-stats]");
    const e = this.editor.selected;
    if (stats && e) stats.innerHTML = entityStats(e, w.delivered);
  }

  private refresh() {
    for (const btn of this.toolbar.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      btn.classList.toggle("active", btn.dataset.tool === this.editor.tool);
    }
    byId("rotate-arrow").textContent = ARROWS[this.editor.rotation];
    this.renderPanel();
  }

  private buildToolbar() {
    const html = TOOLS.map(
      (t) =>
        `<button data-tool="${t.tool}" title="${t.label} (${t.key})">` +
        `<span class="swatch" style="background:${t.color}"></span>${t.label}</button>`,
    ).join("");
    this.toolbar.innerHTML =
      html + `<button data-action="rotate" title="Drehen (R)"><span id="rotate-arrow" class="arrow"></span>Drehen</button>` +
      `<button data-action="menu" title="Spiel speichern/laden"><span class="arrow">≡</span>Menü</button>`;
    this.toolbar.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest("button");
      if (!btn) return;
      if (btn.dataset.tool) this.editor.setTool(btn.dataset.tool as Tool);
      else if (btn.dataset.action === "rotate") this.editor.rotate();
      else if (btn.dataset.action === "menu") this.onMenu();
    });
  }

  private renderHud() {
    const delivered = this.editor.world.delivered;
    const gi = currentGoalIndex(delivered);
    const goal = GOALS[gi];
    const goalHtml = goal
      ? `<div class="goal">Auftrag ${gi + 1}/${GOALS.length}: ${itemLabel(goal.item)} ` +
        `<b>${Math.min(delivered.get(goal.item) ?? 0, goal.count)}/${goal.count}</b></div>`
      : `<div class="goal">Alle Aufträge erfüllt!</div>`;
    const stock = ITEM_ORDER.filter((i) => delivered.has(i))
      .map((i) => `<span class="stock">${dot(i)}${delivered.get(i)}</span>`)
      .join("");
    this.hud.innerHTML =
      goalHtml +
      (stock
        ? `<div class="stocks">${stock}</div>`
        : `<div class="hint">Bohrer auf Erz setzen und per Band zum Hub führen.<br>Zwei Finger: bewegen und zoomen.</div>`);
  }

  private renderPanel() {
    const e = this.editor.selected;
    this.panel.hidden = !e;
    if (!e) return;

    let body = "";
    if (e.type === "assembler") {
      body =
        `<div class="label">Rezept wählen</div><div class="recipes">` +
        recipesFor("assembler")
          .map(
            (r) =>
              `<button data-recipe="${r.id}" class="${e.recipe?.id === r.id ? "active" : ""}">${recipeLabel(r)}</button>`,
          )
          .join("") +
        `</div>`;
    } else if (e.type === "smelter") {
      body = `<div class="label">Stellt sich automatisch auf das angelieferte Erz ein.</div>`;
    } else if (e.type === "extractor") {
      body = `<div class="label">Fördert ${itemLabel(e.ore)}</div>`;
    }

    const actions =
      (e.type !== "hub" ? `<button data-action="rotate">Drehen</button>` : "") +
      `<button data-action="delete" class="danger">Abreißen</button>` +
      `<button data-action="close">Schließen</button>`;

    this.panel.innerHTML =
      `<div class="title">${ENTITY_NAMES[e.type]}</div>${body}` +
      `<div data-stats>${entityStats(e, this.editor.world.delivered)}</div>` +
      `<div class="actions">${actions}</div>`;
  }

  private onPanelClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn) return;
    if (btn.dataset.recipe) this.editor.setSelectedRecipe(recipeById(btn.dataset.recipe) ?? null);
    else if (btn.dataset.action === "rotate") this.editor.rotateSelected();
    else if (btn.dataset.action === "delete") this.editor.deleteSelected();
    else if (btn.dataset.action === "close") this.editor.clearSelection();
  };

  private onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.target as HTMLElement).closest("textarea, input")) return;
    const t = TOOLS.find((x) => x.key === ev.key);
    if (t) this.editor.setTool(t.tool);
    else if (ev.key === "r" || ev.key === "R") this.editor.rotate();
    else if (ev.key === "Escape") {
      this.editor.setTool("hand");
      this.editor.clearSelection();
    }
  };
}

function entityStats(e: Entity, delivered: ReadonlyMap<ItemId, number>): string {
  switch (e.type) {
    case "smelter":
    case "assembler":
      return (
        (e.recipe && e.type === "smelter" ? `<div>Rezept: ${recipeLabel(e.recipe)}</div>` : "") +
        `<div>Eingang: ${stacks(e.input)}</div><div>Ausgang: ${stacks(e.output)}</div>`
      );
    case "belt":
      return `<div>Items: ${e.items.length}</div>`;
    case "hub":
      return `<div>Lager: ${stacks(delivered)}</div>`;
    case "extractor":
      return "";
  }
}

function stacks(m: ReadonlyMap<ItemId, number>): string {
  if (m.size === 0) return "leer";
  return ITEM_ORDER.filter((i) => m.has(i))
    .map((i) => `${dot(i)}${m.get(i)}`)
    .join(" ");
}

function recipeLabel(r: Recipe): string {
  const side = (s: ItemStack[]) => s.map((x) => `${x.count}× ${itemLabel(x.item)}`).join(" + ");
  return `${side(r.inputs)} → ${side(r.outputs)}`;
}

function itemLabel(i: ItemId): string {
  return `${dot(i)}${ITEM_NAMES[i]}`;
}

function dot(i: ItemId): string {
  return `<span class="dot" style="background:#${ITEM_STYLE[i].color.toString(16).padStart(6, "0")}"></span>`;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt in index.html`);
  return el;
}
