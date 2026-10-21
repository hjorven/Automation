import type { Editor, Tool } from "../game/editor";
import { ITEM_COLORS, cssHex } from "../render3d/palette";
import { renderThumbnails, type ThumbnailId } from "../render3d/thumbnails";
import type { Entity } from "../sim/entities";
import { ITEM_NAMES, ITEM_ORDER, type ItemId } from "../sim/items";
import { MAX_TIER, TIERS, buildCost } from "../sim/progression";
import { recipeById, recipesFor, type ItemStack, type Recipe } from "../sim/recipes";
import type { World } from "../sim/world";

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "hand", label: "Hand", key: "1" },
  { tool: "belt", label: "Band", key: "2" },
  { tool: "extractor", label: "Bohrer", key: "3" },
  { tool: "smelter", label: "Schmelze", key: "4" },
  { tool: "assembler", label: "Montage", key: "5" },
  { tool: "hub", label: "Hub", key: "6" },
  { tool: "splitter", label: "Verteiler", key: "7" },
  { tool: "merger", label: "Zusammenführer", key: "8" },
  { tool: "tunnel", label: "Tunnel", key: "9" },
  { tool: "foundry", label: "Gießerei", key: "0" },
  { tool: "extractor_mk2", label: "Bohrer Mk2", key: "b" },
  { tool: "delete", label: "Abriss", key: "x" },
];

/** Wie lange Hinweise im HUD stehen bleiben. */
const NOTICE_MS = 2500;
const TIER_NOTICE_MS = 6000;

const ENTITY_NAMES: Record<Entity["type"], string> = {
  belt: "Förderband",
  extractor: "Bohrer",
  smelter: "Schmelze",
  assembler: "Montierer",
  hub: "Hub",
  splitter: "Verteiler",
  merger: "Zusammenführer",
  tunnel: "Tunnel",
  foundry: "Gießerei",
  extractor_mk2: "Bohrer Mk2",
};

/** HTML-Overlay: Werkzeugleiste, Auftrag/Lager (HUD) und Info-Panel. */
export class Ui {
  private readonly toolbar = byId("toolbar");
  private readonly hud = byId("hud");
  private readonly panel = byId("panel");
  private hudKey = "";
  private tier: number;
  private tierReachedAt = -Infinity;
  /** Einmal gerenderte Bilder der Modelle fuer die Werkzeugleiste. */
  private readonly thumbs = renderThumbnails();

  constructor(
    private readonly editor: Editor,
    private readonly onMenu: () => void,
  ) {
    this.buildToolbar();
    this.panel.addEventListener("click", this.onPanelClick);
    window.addEventListener("keydown", this.onKey);
    this.tier = editor.world.tier;
    editor.onChange(() => this.refresh());
    this.refresh();
  }

  /** Regelmaessig aufrufen (einige Male pro Sekunde) fuer Zaehler und Fortschritt. */
  tick() {
    const w = this.editor.world;
    if (w.tier !== this.tier) {
      this.tier = w.tier;
      this.tierReachedAt = performance.now();
      this.refresh();
    }
    const now = performance.now();
    const err = this.editor.lastError;
    const showErr = !!err && now - err.at < NOTICE_MS;
    const showTier = now - this.tierReachedAt < TIER_NOTICE_MS;
    const key = `${w.storageVersion}|${w.tier}|${this.editor.tool}|${showErr && err!.at}|${showTier}`;
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.renderHud(showErr, showTier);
    }
    const stats = this.panel.querySelector<HTMLElement>("[data-stats]");
    const e = this.editor.selected;
    if (stats && e) stats.innerHTML = entityStats(e, w);
    if (e?.type === "hub") this.updateHubProgress();
  }

  private refresh() {
    const w = this.editor.world;
    for (const btn of this.toolbar.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      btn.classList.toggle("active", btn.dataset.tool === this.editor.tool);
      const tool = btn.dataset.tool as Tool;
      btn.hidden = tool !== "hand" && tool !== "delete" && !w.isUnlocked(tool);
    }
    // Pfeil zeigt die Baurichtung (je Richtung ein eigenes Bild).
    const arrow = this.thumbs[`rotate${this.editor.rotation}` as ThumbnailId];
    const img = document.getElementById("rotate-arrow");
    if (arrow && img instanceof HTMLImageElement) img.src = arrow;
    this.renderPanel();
  }

  private buildToolbar() {
    const thumbs = this.thumbs;
    const icon = (id: ThumbnailId, attrs = "") =>
      thumbs[id]
        ? `<img class="thumb" ${attrs} src="${thumbs[id]}" alt="" draggable="false">`
        : `<span class="thumb" ${attrs}></span>`;
    const html = TOOLS.map(
      (t) => `<button data-tool="${t.tool}" title="${t.label} (${t.key})">${icon(t.tool)}${t.label}</button>`,
    ).join("");
    this.toolbar.innerHTML =
      html +
      `<button data-action="rotate" title="Drehen (R)">${icon("rotate0", 'id="rotate-arrow"')}Drehen</button>` +
      `<button data-action="menu" title="Spiel speichern/laden">${icon("menu")}Menü</button>`;
    this.toolbar.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest("button");
      if (!btn) return;
      if (btn.dataset.tool) this.editor.setTool(btn.dataset.tool as Tool);
      else if (btn.dataset.action === "rotate") this.editor.rotate();
      else if (btn.dataset.action === "menu") this.onMenu();
    });
  }

  private renderHud(showError: boolean, showTier: boolean) {
    const w = this.editor.world;
    const storage = w.storage;
    const tier = TIERS[w.tier];
    const next = TIERS[w.tier + 1];

    let html = `<div class="goal">Hub-Stufe <b>${w.tier}/${MAX_TIER}</b>: ${tier.name}</div>`;
    if (showTier && w.tier > 0) {
      html += `<div class="notice">Stufe ${w.tier} erreicht! Neu: ${unlockText(w.tier)}</div>`;
    }
    if (next) {
      const parts = next.cost
        .map((c) => `${itemLabel(c.item)} <b>${Math.min(storage.get(c.item) ?? 0, c.count)}/${c.count}</b>`)
        .join(" &nbsp; ");
      html += `<div class="next">Nächste Stufe ${next.name}: ${parts}</div>`;
      if (w.canAfford(next.cost)) html += `<div class="notice">Upgrade bereit: Hub mit der Hand antippen.</div>`;
    } else {
      html += `<div class="notice">Alle Stufen erreicht, die Fabrik ist komplett!</div>`;
    }

    const tool = this.editor.tool;
    if (tool !== "hand" && tool !== "delete") {
      const cost = buildCost(tool);
      if (cost.length) {
        const cls = w.canAfford(cost) ? "cost" : "cost missing";
        html += `<div class="${cls}">Kosten ${ENTITY_NAMES[tool]}: ${costText(cost)}</div>`;
      }
    }
    if (showError) {
      const msg = this.editor.lastError!.error === "locked" ? "Noch nicht freigeschaltet." : "Nicht genug im Hub-Lager.";
      html += `<div class="cost missing">${msg}</div>`;
    }

    const stock = ITEM_ORDER.filter((i) => storage.has(i))
      .map((i) => `<span class="stock">${dot(i)}${storage.get(i)}</span>`)
      .join("");
    html += stock
      ? `<div class="stocks">${stock}</div>`
      : `<div class="hint">Bohrer auf Erz setzen und per Band zum Hub führen.<br>Zwei Finger: bewegen, zoomen und drehen.</div>`;
    this.hud.innerHTML = html;
  }

  /** Hub-Panel: Fortschrittsbalken und Upgrade-Knopf an Ort und Stelle aktualisieren. */
  private updateHubProgress() {
    const w = this.editor.world;
    const next = TIERS[w.tier + 1];
    if (!next) return;
    for (const c of next.cost) {
      const have = Math.min(w.storage.get(c.item) ?? 0, c.count);
      const row = this.panel.querySelector<HTMLElement>(`[data-cost="${c.item}"]`);
      if (!row) continue;
      row.querySelector("b")!.textContent = `${have}/${c.count}`;
      row.querySelector<HTMLElement>(".fill")!.style.width = `${(100 * have) / c.count}%`;
    }
    const btn = this.panel.querySelector<HTMLButtonElement>("[data-action=upgrade]");
    if (btn) btn.disabled = !w.canAfford(next.cost);
  }

  private renderPanel() {
    const e = this.editor.selected;
    this.panel.hidden = !e;
    if (!e) return;

    const w = this.editor.world;
    let body = "";
    if (e.type === "assembler" || e.type === "foundry") {
      body =
        `<div class="label">Rezept wählen</div><div class="recipes">` +
        recipesFor(e.type)
          .filter((r) => w.isRecipeUnlocked(r))
          .map(
            (r) =>
              `<button data-recipe="${r.id}" class="${e.recipe?.id === r.id ? "active" : ""}">${recipeLabel(r)}</button>`,
          )
          .join("") +
        `</div>`;
    } else if (e.type === "smelter") {
      body = `<div class="label">Stellt sich automatisch auf das angelieferte Erz ein.</div>`;
    } else if (e.type === "extractor" || e.type === "extractor_mk2") {
      body = `<div class="label">Fördert ${itemLabel(e.ore)}${e.type === "extractor_mk2" ? ", doppelt so schnell" : ""}</div>`;
    } else if (e.type === "splitter") {
      body = `<div class="label">Verteilt Items von hinten abwechselnd nach vorne, links und rechts.</div>`;
    } else if (e.type === "merger") {
      body = `<div class="label">Führt Items von hinten, links und rechts nach vorne zusammen.</div>`;
    } else if (e.type === "tunnel") {
      body =
        `<div class="label">${e.exit ? "Ausgang" : "Eingang"}. Ein Eingang schickt Items unter bis zu ` +
        `4 Feldern hindurch zum nächsten Ausgang in gleicher Richtung.</div>`;
    } else if (e.type === "hub") {
      body = hubBody(w);
    }

    const mk2 = e.type === "extractor" && w.isUnlocked("extractor_mk2");
    const actions =
      (e.type !== "hub" ? `<button data-action="rotate">Drehen</button>` : "") +
      (e.type === "tunnel" ? `<button data-action="toggle-tunnel">${e.exit ? "Zum Eingang" : "Zum Ausgang"}</button>` : "") +
      (mk2 ? `<button data-action="mk2">Mk2 (${costText(buildCost("extractor_mk2"))})</button>` : "") +
      `<button data-action="delete" class="danger">Abreißen</button>` +
      `<button data-action="close">Schließen</button>`;

    this.panel.innerHTML =
      `<div class="title">${ENTITY_NAMES[e.type]}</div>${body}` +
      `<div data-stats>${entityStats(e, w)}</div>` +
      `<div class="actions">${actions}</div>`;
  }

  private onPanelClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn) return;
    if (btn.dataset.recipe) this.editor.setSelectedRecipe(recipeById(btn.dataset.recipe) ?? null);
    else if (btn.dataset.action === "rotate") this.editor.rotateSelected();
    else if (btn.dataset.action === "delete") this.editor.deleteSelected();
    else if (btn.dataset.action === "close") this.editor.clearSelection();
    else if (btn.dataset.action === "upgrade") this.editor.upgradeHub();
    else if (btn.dataset.action === "toggle-tunnel") this.editor.toggleSelectedTunnel();
    else if (btn.dataset.action === "mk2") this.editor.upgradeSelectedExtractor();
  };

  private onKey = (ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.target as HTMLElement).closest("textarea, input")) return;
    const t = TOOLS.find((x) => x.key === ev.key.toLowerCase());
    if (t) this.editor.setTool(t.tool);
    else if (ev.key === "r" || ev.key === "R") this.editor.rotate();
    else if (ev.key === "Escape") {
      this.editor.setTool("hand");
      this.editor.clearSelection();
    }
  };
}

function entityStats(e: Entity, w: World): string {
  switch (e.type) {
    case "smelter":
    case "assembler":
    case "foundry":
      return (
        (e.recipe && e.type !== "assembler" ? `<div>Rezept: ${recipeLabel(e.recipe)}</div>` : "") +
        `<div>Eingang: ${stacks(e.input)}</div><div>Ausgang: ${stacks(e.output)}</div>`
      );
    case "belt":
      return `<div>Items: ${e.items.length}</div>`;
    case "hub":
      return `<div class="label">Lager: ${stacks(w.storage)}</div>`;
    case "tunnel":
      if (e.exit) return "";
      return e.partner(w) ? `<div>Unterwegs: ${e.transit.length}</div>` : `<div>Kein Ausgang in Reichweite.</div>`;
    case "extractor":
    case "extractor_mk2":
    case "splitter":
    case "merger":
      return "";
  }
}

/** Inhalt des Hub-Panels: aktuelle Stufe, Kosten der naechsten mit Balken. */
function hubBody(w: World): string {
  const next = TIERS[w.tier + 1];
  let html = `<div class="label">Stufe ${w.tier}/${MAX_TIER}: ${TIERS[w.tier].name}</div>`;
  if (!next) return html + `<div class="label">Alle Stufen erreicht.</div>`;
  html += `<div class="label">Nächste Stufe: <b>${next.name}</b></div><div class="costs">`;
  for (const c of next.cost) {
    const have = Math.min(w.storage.get(c.item) ?? 0, c.count);
    html +=
      `<div class="cost-row" data-cost="${c.item}"><span>${itemLabel(c.item)}</span><b>${have}/${c.count}</b>` +
      `<div class="bar"><div class="fill" style="width:${(100 * have) / c.count}%"></div></div></div>`;
  }
  html += `</div><div class="label">Schaltet frei: ${unlockText(w.tier + 1)}</div>`;
  html += `<button data-action="upgrade" class="upgrade"${w.canAfford(next.cost) ? "" : " disabled"}>Upgrade auf Stufe ${w.tier + 1}</button>`;
  return html;
}

/** Was Stufe `tier` freischaltet, als Text. */
function unlockText(tier: number): string {
  const t = TIERS[tier];
  const parts = [
    ...t.buildings.map((b) => ENTITY_NAMES[b]),
    ...t.recipes.map((id) => {
      const r = recipeById(id);
      return r ? `Rezept ${ITEM_NAMES[r.outputs[0].item]}` : id;
    }),
  ];
  return parts.length ? parts.join(", ") : "Fabrik komplett";
}

function costText(cost: readonly ItemStack[]): string {
  return cost.map((c) => `${c.count}× ${ITEM_NAMES[c.item]}`).join(", ");
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
  return `<span class="dot" style="background:${cssHex(ITEM_COLORS[i])}"></span>`;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt in index.html`);
  return el;
}
