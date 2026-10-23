import type { Editor } from "../game/editor";
import type { Entity, Machine } from "../sim/entities";
import { TICKS_PER_SECOND } from "../sim/constants";
import { MAX_TIER, TIERS, buildCost } from "../sim/progression";
import { recipeById, recipesFor } from "../sim/recipes";
import { TOOL_INFO, toolName } from "./catalog";
import { byId, costChips, dot, itemLabel, itemName, recipeHtml, stackChips } from "./dom";
import type { Thumbs } from "./toolbar";

type Status = { text: string; cls: "ok" | "warn" | "bad" | "" };

/**
 * Info-Panel oben rechts fuer das ausgewaehlte Gebaeude. Der Kopf und die
 * Knoepfe werden bei Aenderungen neu gebaut, Status und Fortschritt laufend
 * an Ort und Stelle aktualisiert.
 */
export class Panel {
  private readonly el = byId("panel");

  constructor(
    private readonly editor: Editor,
    private readonly thumbs: Thumbs,
    private readonly unlocksHtml: (tier: number) => string,
    private readonly onOverview: () => void,
  ) {
    this.el.addEventListener("click", this.onClick);
  }

  render() {
    const e = this.editor.selected;
    this.el.hidden = !e;
    if (!e) return;
    const w = this.editor.world;

    const thumb = this.thumbs[e.type];
    let html =
      `<div class="p-head">${thumb ? `<img src="${thumb}" alt="">` : `<span class="ph"></span>`}` +
      `<div><div class="p-title">${toolName(e.type)}</div><div data-status></div></div>` +
      `<button class="p-close" data-action="close" aria-label="Schließen">&#x2715;</button></div>`;

    if (e.type === "hub") {
      html += this.hubBody();
    } else {
      html += `<div class="p-text">${this.describe(e)}</div>`;
      const recipes = e.type === "smelter" || e.type === "assembler" || e.type === "foundry" ? recipesFor(e.type) : [];
      if (recipes.length > 1 && e.type !== "smelter") {
        html +=
          `<div class="section"><div class="caps">Rezept</div><div class="recipes">` +
          recipes
            .filter((r) => w.isRecipeUnlocked(r))
            .map((r) => {
              const active = (e as Machine).recipe?.id === r.id;
              return `<button class="recipe-card${active ? " active" : ""}" data-recipe="${r.id}">${recipeHtml(r)}</button>`;
            })
            .join("") +
          `</div></div>`;
      } else if (e.type === "smelter" || e.type === "foundry") {
        const r = (e as Machine).recipe;
        if (r) html += `<div class="section"><div class="caps">Rezept</div><div class="recipe-card">${recipeHtml(r)}</div></div>`;
      }
      html += `<div class="section" data-live></div>`;
    }

    const mk2 = e.type === "extractor" && w.isUnlocked("extractor_mk2");
    html +=
      `<div class="actions">` +
      (e.type !== "hub" ? `<button data-action="rotate">Drehen</button>` : "") +
      (e.type === "tunnel" ? `<button data-action="toggle-tunnel">${e.exit ? "Zum Eingang" : "Zum Ausgang"}</button>` : "") +
      (mk2 ? `<button data-action="mk2">Auf Mk2 aufrüsten</button>` : "") +
      (e.type === "hub" ? `<button data-action="overview">Alle Stufen</button>` : "") +
      `<button data-action="delete" class="danger">Abreißen</button></div>`;
    if (mk2) html += `<div class="p-text" style="margin-top:6px">Mk2: ${costChips(buildCost("extractor_mk2"), w.storage)}</div>`;

    this.el.innerHTML = html;
    this.update();
  }

  /** Laufende Werte: Status, Fortschritt, Lagerbestand. */
  update() {
    const e = this.editor.selected;
    if (!e || this.el.hidden) return;
    const w = this.editor.world;
    const st = status(e, w);
    const s = this.el.querySelector<HTMLElement>("[data-status]");
    if (s) s.innerHTML = st.text ? `<span class="pill ${st.cls}">${st.text}</span>` : "";

    const live = this.el.querySelector<HTMLElement>("[data-live]");
    if (live) live.innerHTML = liveBody(e);

    if (e.type === "hub") {
      const next = TIERS[w.tier + 1];
      if (!next) return;
      for (const c of next.cost) {
        const have = Math.min(w.storage.get(c.item) ?? 0, c.count);
        const row = this.el.querySelector<HTMLElement>(`[data-cost="${c.item}"]`);
        if (!row) continue;
        row.querySelector(".num")!.textContent = `${have}/${c.count}`;
        row.querySelector<HTMLElement>(".fill")!.style.width = `${(100 * have) / c.count}%`;
        row.querySelector(".bar")!.classList.toggle("done", have >= c.count);
      }
      const btn = this.el.querySelector<HTMLButtonElement>("[data-action=upgrade]");
      if (btn) btn.disabled = !w.canAfford(next.cost);
      const stock = this.el.querySelector<HTMLElement>("[data-stock]");
      if (stock) stock.innerHTML = stackChips(w.storage);
    }
  }

  private describe(e: Entity): string {
    switch (e.type) {
      case "extractor":
      case "extractor_mk2":
        return `Fördert ${itemLabel(e.ore)}${e.type === "extractor_mk2" ? ", doppelt so schnell" : ""}.`;
      case "tunnel":
        return `${e.exit ? "Ausgang" : "Eingang"}. ${TOOL_INFO.tunnel}`;
      default:
        return TOOL_INFO[e.type] ?? "";
    }
  }

  private hubBody(): string {
    const w = this.editor.world;
    const next = TIERS[w.tier + 1];
    let html = tierTrack(w.tier) + `<div class="p-text">Stufe ${w.tier}/${MAX_TIER}: <b>${TIERS[w.tier].name}</b></div>`;
    if (next) {
      html += `<div class="section"><div class="caps">Nächste Stufe: ${next.name}</div><div class="costs">`;
      for (const c of next.cost) {
        html +=
          `<div class="cost-row" data-cost="${c.item}"><span>${dot(c.item)}${itemName(c.item)}</span>` +
          `<span class="num"></span><div class="bar"><div class="fill"></div></div></div>`;
      }
      html += `</div></div>`;
      const unlocks = this.unlocksHtml(w.tier + 1);
      if (unlocks) html += `<div class="section"><div class="caps">Schaltet frei</div><div class="unlocks">${unlocks}</div></div>`;
      html += `<button data-action="upgrade" class="primary upgrade">Upgrade auf Stufe ${w.tier + 1}</button>`;
    } else {
      html += `<div class="p-text">Alle Stufen erreicht.</div>`;
    }
    html += `<div class="section"><div class="caps">Lager</div><div class="unlocks" data-stock></div></div>`;
    return html;
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn) return;
    const ed = this.editor;
    if (btn.dataset.recipe) ed.setSelectedRecipe(recipeById(btn.dataset.recipe) ?? null);
    else if (btn.dataset.action === "rotate") ed.rotateSelected();
    else if (btn.dataset.action === "delete") ed.deleteSelected();
    else if (btn.dataset.action === "close") ed.clearSelection();
    else if (btn.dataset.action === "upgrade") ed.upgradeHub();
    else if (btn.dataset.action === "toggle-tunnel") ed.toggleSelectedTunnel();
    else if (btn.dataset.action === "mk2") ed.upgradeSelectedExtractor();
    else if (btn.dataset.action === "overview") this.onOverview();
  };
}

/** Leiste aller Stufen als Punkte. */
export function tierTrack(tier: number): string {
  return (
    `<div class="tier-track">` +
    TIERS.map((_, i) => {
      const cls = i <= tier ? "done" : i === tier + 1 ? "next" : "";
      return (i ? `<span class="link ${i <= tier ? "done" : ""}"></span>` : "") + `<span class="node ${cls}" title="Stufe ${i}"></span>`;
    }).join("") +
    `</div>`
  );
}

function status(e: Entity, w: Editor["world"]): Status {
  switch (e.type) {
    case "smelter":
    case "assembler":
    case "foundry": {
      if (!e.recipe) return { text: e.type === "smelter" ? "Wartet auf Erz" : "Kein Rezept", cls: "warn" };
      if (e.crafting) return { text: "Arbeitet", cls: "ok" };
      const full = e.recipe.outputs.some((s) => (e.output.get(s.item) ?? 0) > s.count);
      if (full) return { text: "Ausgang blockiert", cls: "bad" };
      return { text: "Wartet auf Material", cls: "warn" };
    }
    case "extractor":
    case "extractor_mk2":
      return e.buffer !== null ? { text: "Ausgang blockiert", cls: "bad" } : { text: "Fördert", cls: "ok" };
    case "tunnel":
      if (e.exit) return { text: "Ausgang", cls: "" };
      return e.partner(w) ? { text: "Verbunden", cls: "ok" } : { text: "Kein Ausgang in Reichweite", cls: "bad" };
    case "belt":
      return e.items.length ? { text: `${e.items.length} Items`, cls: "ok" } : { text: "Leer", cls: "" };
    case "splitter":
    case "merger":
      return e.buffer !== null ? { text: "In Betrieb", cls: "ok" } : { text: "Leer", cls: "" };
    case "hub":
      return { text: `Stufe ${w.tier}`, cls: "ok" };
  }
}

function liveBody(e: Entity): string {
  switch (e.type) {
    case "smelter":
    case "assembler":
    case "foundry": {
      const pct = e.recipe && e.crafting ? (100 * e.progress) / e.recipe.ticks : 0;
      return (
        `<div class="io"><span class="caps">Eingang</span><span class="chips">${stackChips(e.input)}</span>` +
        `<span class="caps">Ausgang</span><span class="chips">${stackChips(e.output)}</span></div>` +
        `<div class="bar work"><div class="fill" style="width:${pct}%;transition:none"></div></div>`
      );
    }
    case "extractor":
    case "extractor_mk2": {
      const pct = e.buffer !== null ? 100 : (100 * e.timer) / e.interval;
      const perMin = (60 * TICKS_PER_SECOND) / e.interval;
      return (
        `<div class="io"><span class="caps">Rate</span><span class="num">${perMin} / min</span></div>` +
        `<div class="bar work"><div class="fill" style="width:${pct}%;transition:none"></div></div>`
      );
    }
    case "tunnel":
      return e.exit ? "" : `<div class="io"><span class="caps">Unterwegs</span><span class="num">${e.transit.length}</span></div>`;
    default:
      return "";
  }
}
