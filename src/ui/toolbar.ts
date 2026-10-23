import type { Editor, Tool } from "../game/editor";
import type { ThumbnailId } from "../render3d/thumbnails";
import { TIERS, buildCost } from "../sim/progression";
import {
  GROUP_LABELS,
  TOOL_INFO,
  TOOL_KEYS,
  buildTools,
  toolGroup,
  toolName,
  toolShortName,
  toolTier,
  type ToolGroup,
} from "./catalog";
import { byId, costChips } from "./dom";

export type Thumbs = Partial<Record<string, string>>;

/** So lange gedrueckt halten, bis der Tooltip erscheint. */
const LONG_PRESS_MS = 450;
const HOVER_MS = 500;

const GROUP_ORDER: ToolGroup[] = ["transport", "mining", "production", "base"];

/**
 * Werkzeugleiste unten: nach Gruppen sortiert, mit Kosten-Warnung,
 * gesperrten Gebaeuden der naechsten Stufe als Vorschau und Tooltip bei
 * langem Druck (Maus: beim Drueberfahren).
 */
export class Toolbar {
  private readonly el = byId("toolbar");
  private readonly tip = byId("tooltip");
  private pressTimer = 0;
  private suppressClick = false;
  /** Frisch freigeschaltet, bis zum ersten Antippen hervorgehoben. */
  private readonly fresh = new Set<Tool>();

  constructor(
    private readonly editor: Editor,
    private readonly thumbs: Thumbs,
    private readonly onMenu: () => void,
  ) {
    this.build();
    this.el.addEventListener("click", this.onClick);
    this.el.addEventListener("pointerdown", this.onDown);
    this.el.addEventListener("pointerup", this.cancelPress);
    this.el.addEventListener("pointercancel", this.cancelPress);
    this.el.addEventListener("pointerleave", this.cancelPress);
    this.el.addEventListener("pointerover", this.onOver);
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    this.el.addEventListener("scroll", () => this.hideTip(), { passive: true });
  }

  icon(id: string, attrs = ""): string {
    const src = this.thumbs[id];
    return src ? `<img class="thumb" ${attrs} src="${src}" alt="" draggable="false">` : `<span class="thumb" ${attrs}></span>`;
  }

  private button(tool: Tool): string {
    const key = TOOL_KEYS[tool];
    return (
      `<button data-tool="${tool}">${key ? `<span class="key">${key.toUpperCase()}</span>` : ""}` +
      `${this.icon(tool)}<span class="name">${toolShortName(tool)}</span></button>`
    );
  }

  private build() {
    const groups = new Map<ToolGroup, Tool[]>();
    for (const t of buildTools()) {
      const g = toolGroup(t);
      groups.set(g, [...(groups.get(g) ?? []), t]);
    }
    let html =
      `<div class="group"><span class="group-label">Werkzeug</span><div class="group-btns">` +
      this.button("hand") +
      this.button("delete") +
      `<button data-action="rotate"><span class="key">R</span>${this.icon("rotate0", 'id="rotate-arrow"')}<span class="name">Drehen</span></button>` +
      `</div></div>`;
    for (const g of GROUP_ORDER) {
      const tools = groups.get(g);
      if (!tools) continue;
      html +=
        `<div class="group" data-group="${g}"><span class="group-label">${GROUP_LABELS[g]}</span>` +
        `<div class="group-btns">${tools.map((t) => this.button(t)).join("")}</div></div>`;
    }
    html +=
      `<div class="group"><span class="group-label">Spiel</span><div class="group-btns">` +
      `<button data-action="menu">${this.icon("menu")}<span class="name">Menü</span></button></div></div>`;
    this.el.innerHTML = html;
  }

  /** Neu freigeschaltete Werkzeuge hervorheben (nach einem Stufenaufstieg). */
  markFresh(tools: readonly Tool[]) {
    for (const t of tools) this.fresh.add(t);
  }

  refresh() {
    const w = this.editor.world;
    for (const btn of this.el.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      const tool = btn.dataset.tool as Tool;
      const tier = toolTier(tool);
      const unlocked = tier <= w.tier;
      btn.classList.toggle("active", tool === this.editor.tool);
      btn.classList.toggle("locked", !unlocked);
      // Gesperrtes nur fuer die naechste Stufe zeigen, alles Spaetere bleibt Ueberraschung.
      btn.hidden = !unlocked && tier > w.tier + 1;
      const cost = tool === "hand" || tool === "delete" ? [] : buildCost(tool);
      btn.classList.toggle("short", unlocked && cost.length > 0 && !w.canAfford(cost));
      btn.classList.toggle("new", this.fresh.has(tool));
    }
    for (const g of this.el.querySelectorAll<HTMLElement>("[data-group]")) {
      g.hidden = !g.querySelector("button:not([hidden])");
    }
    // Pfeil zeigt die Baurichtung (je Richtung ein eigenes Bild).
    const arrow = this.thumbs[`rotate${this.editor.rotation}` satisfies ThumbnailId];
    const img = document.getElementById("rotate-arrow");
    if (arrow && img instanceof HTMLImageElement) img.src = arrow;
  }

  /** Knopf eines Werkzeugs (fuer das Tutorial). */
  buttonFor(tool: Tool): HTMLElement | null {
    return this.el.querySelector(`[data-tool="${tool}"]`);
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn) return;
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.hideTip();
    const tool = btn.dataset.tool as Tool | undefined;
    if (tool) {
      if (btn.classList.contains("locked")) {
        this.showTip(btn, tool);
        clearTimeout(this.pressTimer);
        this.pressTimer = window.setTimeout(() => this.hideTip(), 2500);
        return;
      }
      this.fresh.delete(tool);
      // Nochmal antippen schaltet zurueck auf die Hand.
      this.editor.setTool(this.editor.tool === tool && tool !== "hand" ? "hand" : tool);
    } else if (btn.dataset.action === "rotate") this.editor.rotate();
    else if (btn.dataset.action === "menu") this.onMenu();
  };

  private onDown = (ev: PointerEvent) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-tool]");
    this.cancelPress();
    this.suppressClick = false;
    if (!btn || ev.pointerType === "mouse") return;
    this.pressTimer = window.setTimeout(() => {
      this.suppressClick = true;
      this.showTip(btn, btn.dataset.tool as Tool);
    }, LONG_PRESS_MS);
  };

  private cancelPress = (ev?: PointerEvent) => {
    clearTimeout(this.pressTimer);
    // Touch: Tooltip nach dem Loslassen noch kurz stehen lassen.
    if (ev && ev.type !== "pointerleave" && ev.pointerType !== "mouse" && !this.tip.hidden) {
      setTimeout(() => this.hideTip(), 1800);
    }
    if (ev?.type === "pointerleave" && ev.pointerType === "mouse") this.hideTip();
  };

  private onOver = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-tool]");
    clearTimeout(this.pressTimer);
    if (!btn) {
      this.hideTip();
      return;
    }
    this.pressTimer = window.setTimeout(() => this.showTip(btn, btn.dataset.tool as Tool), HOVER_MS);
  };

  private showTip(btn: HTMLElement, tool: Tool) {
    const w = this.editor.world;
    const tier = toolTier(tool);
    const key = TOOL_KEYS[tool];
    const cost = tool === "hand" || tool === "delete" ? [] : buildCost(tool);
    let html =
      `<div class="tt-title"><span>${toolName(tool)}</span>${key ? `<span class="num muted">${key.toUpperCase()}</span>` : ""}</div>` +
      `<div class="tt-text">${TOOL_INFO[tool] ?? ""}</div>`;
    if (tier > w.tier) {
      html += `<div class="tt-lock">Gesperrt: ab Stufe ${tier} (${TIERS[tier]?.name ?? "?"})</div>`;
    }
    html += cost.length
      ? `<div class="tt-cost">${costChips(cost, w.storage)}</div>`
      : tool !== "hand" && tool !== "delete"
        ? `<div class="tt-cost"><span class="chip have">kostenlos</span></div>`
        : "";
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const tw = this.tip.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${r.top - this.tip.offsetHeight - 10}px`;
  }

  hideTip() {
    this.tip.hidden = true;
  }
}
