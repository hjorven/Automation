import type { Editor } from "../game/editor";
import { ITEM_ORDER } from "../sim/items";
import { MAX_TIER, TIERS } from "../sim/progression";
import { recipeById } from "../sim/recipes";
import { RESEARCH, researchById, type ResearchNode } from "../sim/research";
import { TICKS_PER_SECOND } from "../sim/constants";
import { UPGRADES, upgradeCost, upgradeFactor, type UpgradeId } from "../sim/upgrades";
import { RANKS, factoryScore, rankFor } from "../sim/value";
import { toolName } from "./catalog";
import { byId, costChips, dot, fmt, itemName, recipeHtml } from "./dom";
import { WHY_TEXT, type Efficiency } from "./efficiency";
import { tierTrack } from "./panel";
import { BUCKETS, type DeliveryStats } from "./stats";
import type { BlueprintTab } from "./blueprint-tab";

export type OverviewTab = "tiers" | "research" | "orders" | "upgrades" | "inventory" | "stats" | "blueprints";

const TABS: { id: OverviewTab; label: string }[] = [
  { id: "tiers", label: "Stufen" },
  { id: "research", label: "Forschung" },
  { id: "orders", label: "Aufträge" },
  { id: "upgrades", label: "Upgrades" },
  { id: "inventory", label: "Lager" },
  { id: "stats", label: "Statistik" },
  { id: "blueprints", label: "Blaupausen" },
];

/** Grosser Bildschirm mit Reitern: alle Stufen, Hub-Lager, Lieferstatistik. */
export class Overview {
  private readonly el = byId("screen");
  private readonly scrim = byId("scrim");
  private tab: OverviewTab = "tiers";
  private bodyKey = "";
  /** Reiter "Blaupausen" (eigene Datei, wird nach dem Bau gesetzt). */
  blueprints: BlueprintTab | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly stats: DeliveryStats,
    private readonly unlocksHtml: (tier: number) => string,
    private readonly contentHtml: (buildings: readonly string[], recipes: readonly string[]) => string,
    private readonly efficiency: Efficiency,
    private readonly focus: (x: number, y: number) => void,
  ) {
    this.el.addEventListener("click", this.onClick);
    this.scrim.addEventListener("click", () => this.close());
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(tab: OverviewTab = this.tab) {
    this.tab = tab;
    this.el.innerHTML =
      `<div class="s-head"><div class="s-title">Fabrik</div>` +
      `<button class="close" data-action="close" aria-label="Schließen">&#x2715;</button></div>` +
      `<div class="tabs">${TABS.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join("")}</div>` +
      `<div class="s-body"></div>`;
    this.el.hidden = false;
    this.scrim.hidden = false;
    this.bodyKey = "";
    this.update();
  }

  close() {
    this.el.hidden = true;
    this.scrim.hidden = true;
  }

  /** Einige Male pro Sekunde, solange offen. */
  update() {
    if (!this.isOpen) return;
    for (const b of this.el.querySelectorAll<HTMLElement>("[data-tab]")) b.classList.toggle("active", b.dataset.tab === this.tab);
    const w = this.editor.world;
    const body = this.el.querySelector<HTMLElement>(".s-body")!;
    // Stufen-Reiter enthaelt Knoepfe: nur neu bauen, wenn sich etwas aendert.
    const key =
      this.tab === "blueprints"
        ? `bp|${this.blueprints?.key()}`
        : `${this.tab}|${w.storageVersion}|${w.tier}|${this.tab === "stats" ? Math.floor(performance.now() / 1000) : ""}`;
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    const scroll = body.scrollTop;
    body.innerHTML =
      this.tab === "blueprints"
        ? (this.blueprints?.html() ?? "")
        : this.tab === "tiers"
        ? this.tiersHtml()
        : this.tab === "research"
          ? this.researchHtml()
          : this.tab === "orders"
            ? this.ordersHtml()
            : this.tab === "upgrades"
              ? this.upgradesHtml()
              : this.tab === "inventory"
                ? this.inventoryHtml()
                : this.statsHtml();
    body.scrollTop = scroll;
  }

  private tiersHtml(): string {
    const w = this.editor.world;
    let html = tierTrack(w.tier) + `<div class="tier-list" style="margin-top:10px">`;
    TIERS.forEach((t, i) => {
      const cls = i <= w.tier ? "done" : i === w.tier + 1 ? "next" : "later";
      const unlocks = this.unlocksHtml(i);
      html += `<div class="tier-card ${cls}"><div class="t-num">${i}</div>`;
      html += `<div class="t-name">${t.name}${i === w.tier ? `<span class="pill ok">aktuell</span>` : ""}</div>`;
      if (i === w.tier + 1) {
        html += `<div class="costs">`;
        for (const c of t.cost) {
          const have = Math.min(w.storage.get(c.item) ?? 0, c.count);
          html +=
            `<div class="cost-row"><span>${dot(c.item)}${itemName(c.item)}</span><span class="num">${have}/${c.count}</span>` +
            `<div class="bar${have >= c.count ? " done" : ""}"><div class="fill" style="width:${(100 * have) / c.count}%"></div></div></div>`;
        }
        html += `</div>`;
      } else if (t.cost.length) {
        html += `<div class="row">${costChips(t.cost)}</div>`;
      } else {
        html += `<div class="row muted">Startausstattung</div>`;
      }
      html += unlocks
        ? `<div class="row">${unlocks}</div>`
        : i === MAX_TIER
          ? `<div class="row muted">Schaltet die Endlos-Upgrades frei</div>`
          : `<div class="row muted">Ziel: Fabrik vollenden</div>`;
      if (i === w.tier + 1) {
        html += `<button class="primary upgrade" data-action="upgrade"${w.canAfford(t.cost) ? "" : " disabled"}>Upgrade kaufen</button>`;
      }
      html += `</div>`;
    });
    if (w.upgradesUnlocked) {
      html += `<button class="primary upgrade" data-tab="upgrades" style="justify-self:start">Weiter mit Endlos-Upgrades</button>`;
    }
    return html + `</div>`;
  }

  private upgradesHtml(): string {
    const w = this.editor.world;
    const open = w.upgradesUnlocked;
    let html = open
      ? `<div class="muted" style="margin-bottom:10px">Die Fabrik ist komplett. Jede Upgrade-Stufe macht sie dauerhaft besser und kostet mehr als die vorige.</div>`
      : `<div class="empty-note">Endlos-Upgrades gibt es ab Stufe ${MAX_TIER} (${TIERS[MAX_TIER].name}).</div>`;
    html += `<div class="tier-list">`;
    for (const u of UPGRADES) {
      const level = w.upgradeLevel(u.id);
      const cost = upgradeCost(u, level);
      const now = upgradeFactor(u, level);
      const next = upgradeFactor(u, level + 1);
      html +=
        `<div class="tier-card${open ? " next" : " later"}"><div class="t-num">${level}</div>` +
        `<div class="t-name">${u.name}<span class="pill${level ? " ok" : ""}">${fmtPct(now)}</span></div>` +
        `<div class="row muted">${u.text} Nächste Stufe: ${fmtPct(next)}.</div>` +
        `<div class="row">${costChips(cost, open ? w.storage : undefined)}</div>`;
      if (open) {
        html += `<button class="primary upgrade" data-upgrade="${u.id}"${w.canAfford(cost) ? "" : " disabled"}>Stufe ${level + 1} kaufen</button>`;
      }
      html += `</div>`;
    }
    return html + `</div>`;
  }

  /** Forschungsbaum nach Stufen; zwei Stufen voraus sichtbar, der Rest als Ausblick. */
  private researchHtml(): string {
    const w = this.editor.world;
    const done = RESEARCH.filter((n) => w.research.has(n.id)).length;
    let html =
      `<div class="muted" style="margin-bottom:10px;font-size:13px">Frei wählbar: Was du zuerst erforschst, entscheidest du. ` +
      `Neue Knoten kommen mit jeder Hub-Stufe dazu. Erforscht: ${done}/${RESEARCH.length}.</div>`;
    const horizon = Math.min(MAX_TIER, w.tier + 2);
    for (let t = 0; t <= horizon; t++) {
      const nodes = RESEARCH.filter((n) => n.tier === t);
      if (!nodes.length) continue;
      html += `<div class="caps r-tier${t > w.tier ? " later" : ""}">Ab Stufe ${t}: ${TIERS[t].name}</div><div class="r-grid">`;
      html += nodes.map((n) => this.nodeHtml(n)).join("");
      html += `</div>`;
    }
    const later = RESEARCH.filter((n) => n.tier > horizon).length;
    if (later) html += `<div class="empty-note">${later} weitere Knoten in späteren Stufen.</div>`;
    return html;
  }

  private nodeHtml(n: ResearchNode): string {
    const w = this.editor.world;
    const err = w.researchError(n.id);
    const missing = n.requires.filter((r) => !w.research.has(r)).map((r) => researchById(r)?.name ?? r);
    const state =
      err === "done"
        ? `<span class="pill ok">erforscht</span>`
        : err === "tier"
          ? `<span class="pill">ab Stufe ${n.tier}</span>`
          : err === "requires"
            ? `<span class="pill warn">braucht ${missing.join(", ")}</span>`
            : `<span class="pill ok">verfügbar</span>`;
    const recipes = n.recipes
      .map((id) => recipeById(id))
      .filter((r) => !!r)
      .map((r) => `<div class="recipe-card">${recipeHtml(r)}</div>`)
      .join("");
    let html = `<div class="r-node ${err === "done" ? "done" : err === null || err === "cost" ? "open" : "locked"}">`;
    html += `<div class="r-name">${n.name}${state}</div>`;
    if (n.text) html += `<div class="muted">${n.text}</div>`;
    if (n.buildings.length) html += `<div class="row">${this.contentHtml(n.buildings, [])}</div>`;
    html += recipes;
    if (err !== "done") {
      html += `<div class="row">${costChips(n.cost, w.storage)}</div>`;
      if (err === null || err === "cost") {
        html += `<button class="primary" data-research="${n.id}"${err ? " disabled" : ""}>Erforschen</button>`;
      }
    }
    return html + `</div>`;
  }

  private ordersHtml(): string {
    const w = this.editor.world;
    let html =
      `<div class="muted" style="margin-bottom:10px;font-size:13px">Aufträge tauschen Items aus dem Hub-Lager gegen ` +
      `Wertvolleres, manchmal gegen ein alternatives Rezept. Erledigt: ${w.ordersDone}.</div><div class="r-grid">`;
    w.orders.forEach((o, i) => {
      const have = Math.min(w.storage.get(o.item) ?? 0, o.count);
      const recipe = o.recipe ? recipeById(o.recipe) : undefined;
      html +=
        `<div class="r-node open"><div class="r-name">Auftrag ${i + 1}</div>` +
        `<div class="cost-row"><span>${dot(o.item)}${itemName(o.item)}</span><span class="num">${have}/${o.count}</span>` +
        `<div class="bar${have >= o.count ? " done" : ""}"><div class="fill" style="width:${(100 * have) / o.count}%"></div></div></div>` +
        `<div class="caps">Belohnung</div>` +
        (recipe ? `<div class="recipe-card">${recipeHtml(recipe)}</div>` : `<div class="row">${costChips(o.reward)}</div>`) +
        `<div class="row"><button class="primary" data-order="${i}"${have >= o.count ? "" : " disabled"}>Liefern</button>` +
        `<button data-discard="${i}">Ablehnen</button></div></div>`;
    });
    return html + `</div>`;
  }

  private inventoryHtml(): string {
    const w = this.editor.world;
    // Vorhandenes zuerst, der Rest bleibt als Ausblick sichtbar.
    const order = [...ITEM_ORDER].sort((a, b) => Number(w.storage.has(b)) - Number(w.storage.has(a)));
    const cards = order.map((i) => {
      const n = w.storage.get(i) ?? 0;
      const rate = this.stats.perMinute(i);
      return (
        `<div class="inv-card${n ? "" : " empty"}">${dot(i, "lg")}<span class="n">${fmt(n)}</span>` +
        `<span class="l">${itemName(i)}${rate > 0 ? ` &middot; +${fmt(rate)}/min` : ""}</span></div>`
      );
    }).join("");
    const counts = new Map<string, number>();
    for (const e of w.entities.values()) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    const buildings = [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `<div class="tile"><div class="n">${n}</div><div class="caps">${toolName(t)}</div></div>`)
      .join("");
    return (
      `<div class="caps" style="margin-bottom:8px">Hub-Lager</div><div class="inv-grid">${cards}</div>` +
      `<div class="caps" style="margin:18px 0 8px">Gebäude</div><div class="stat-summary">${buildings}</div>`
    );
  }

  private statsHtml(): string {
    const items = ITEM_ORDER.filter((i) => this.stats.total.has(i));
    const mins = this.stats.minutes;
    let total = 0;
    let rate = 0;
    for (const i of items) {
      total += this.stats.total.get(i) ?? 0;
      rate += this.stats.perMinute(i);
    }
    const w = this.editor.world;
    const score = factoryScore(items.map((i) => [i, this.stats.perMinute(i)]));
    const rank = rankFor(score);
    const best = rankFor(w.bestScore);
    let allTime = 0;
    for (const n of w.delivered.values()) allTime += n;
    const hours = w.tick / TICKS_PER_SECOND / 3600;
    let html =
      `<div class="stat-summary">` +
      `<div class="tile"><div class="n">${fmt(score)}</div><div class="caps">Fabrikwert / min</div></div>` +
      `<div class="tile"><div class="n">${fmt(100 * this.efficiency.overall())}&thinsp;%</div><div class="caps">Auslastung</div></div>` +
      `<div class="tile"><div class="n">${fmt(rate)}</div><div class="caps">Items / min</div></div>` +
      `<div class="tile"><div class="n">${fmt(allTime)}</div><div class="caps">Geliefert insgesamt</div></div>` +
      `<div class="tile"><div class="n">${fmt(hours, 1)}&thinsp;h</div><div class="caps">Spielzeit</div></div>` +
      `</div>`;
    html += this.rankHtml(rank.index, best.index, score);
    html += this.efficiencyHtml();
    html +=
      `<div class="caps" style="margin:18px 0 8px">Lieferungen dieser Sitzung &middot; ${fmt(total)} in ${fmt(mins, mins < 10 ? 1 : 0)} min</div>`;
    if (!items.length) {
      return html + `<div class="empty-note">Noch keine Lieferungen in dieser Sitzung. Führe ein Band zum Hub.</div>`;
    }
    html +=
      `<table class="stat-table"><thead><tr><th>Item</th><th class="r">pro Minute</th><th class="r">gesamt</th>` +
      `<th>Verlauf (10 min)</th></tr></thead><tbody>`;
    for (const i of items) {
      html +=
        `<tr><td>${dot(i)}${itemName(i)}</td><td class="r num">${fmt(this.stats.perMinute(i), 1)}</td>` +
        `<td class="r num">${fmt(this.stats.total.get(i) ?? 0)}</td><td>${sparkline(this.stats.series(i))}</td></tr>`;
    }
    return (
      html +
      `</tbody></table><div class="muted" style="margin-top:10px;font-size:12px">Raten seit dem Laden der Seite. ` +
      `Der Fabrikwert gewichtet jedes Item mit den Rohstoffen, die in ihm stecken.</div>`
    );
  }

  /** Rangleiter nach Fabrikwert: aktueller Rang und persoenlicher Bestwert. */
  private rankHtml(current: number, best: number, score: number): string {
    const w = this.editor.world;
    const next = RANKS[current + 1];
    let html = `<div class="caps" style="margin-bottom:8px">Rang</div><div class="rank-ladder">`;
    RANKS.forEach((r, i) => {
      const cls = i === current ? "now" : i <= best ? "done" : "";
      html += `<div class="rank ${cls}" title="ab ${fmt(r.min)} / min"><span class="n">${i + 1}</span><span class="l">${r.name}</span></div>`;
    });
    html += `</div><div class="muted" style="margin:6px 0 16px;font-size:12px">`;
    html += next ? `Nächster Rang ${next.name} ab ${fmt(next.min)} Fabrikwert / min (jetzt ${fmt(score)}). ` : `Höchster Rang erreicht. `;
    html += `Bestwert: ${fmt(w.bestScore)} / min (${RANKS[best].name}).</div>`;
    return html;
  }

  /** Effizienz-Ranking je Gebaeudeart und die groessten Engpaesse. */
  private efficiencyHtml(): string {
    const types = this.efficiency.byType();
    if (!types.length) return "";
    let html =
      `<div class="caps" style="margin-bottom:8px">Effizienz-Ranking</div>` +
      `<table class="stat-table"><thead><tr><th>#</th><th>Gebäude</th><th class="r">Anzahl</th><th>Auslastung</th></tr></thead><tbody>`;
    types.forEach((t, k) => {
      html +=
        `<tr><td class="num">${k + 1}</td><td>${toolName(t.type)}</td><td class="r num">${t.count}</td>` +
        `<td>${loadBar(t.load)}</td></tr>`;
    });
    html += `</tbody></table>`;
    const worst = this.efficiency.bottlenecks();
    if (worst.length) {
      html += `<div class="caps" style="margin:16px 0 8px">Engpässe</div><div class="bottlenecks">`;
      for (const u of worst) {
        html +=
          `<button class="bottleneck" data-focus="${u.x},${u.y}"><span>${toolName(u.type)}</span>` +
          `<span class="muted">${WHY_TEXT[u.why]}</span>${loadBar(u.load)}<span class="go">Zeigen</span></button>`;
      }
      html += `</div>`;
    }
    return html;
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("button");
    if (!btn) return;
    if (this.blueprints?.onClick(btn)) return;
    if (btn.dataset.upgrade) {
      this.editor.buyUpgrade(btn.dataset.upgrade as UpgradeId);
      this.bodyKey = "";
      this.update();
    } else if (btn.dataset.focus) {
      const [x, y] = btn.dataset.focus.split(",").map(Number);
      this.close();
      this.focus(x, y);
    } else if (btn.dataset.tab) {
      this.tab = btn.dataset.tab as OverviewTab;
      this.bodyKey = "";
      this.update();
    } else if (btn.dataset.action === "close") this.close();
    else if (btn.dataset.action === "upgrade") this.editor.upgradeHub();
    else if (btn.dataset.research) this.editor.research(btn.dataset.research);
    else if (btn.dataset.order) this.editor.fulfillOrder(Number(btn.dataset.order));
    else if (btn.dataset.discard) this.editor.discardOrder(Number(btn.dataset.discard));
  };
}

function fmtPct(f: number): string {
  return `${f >= 1 ? "+" : ""}${fmt(100 * (f - 1))} %`;
}

function loadBar(load: number): string {
  const pct = Math.round(100 * load);
  const cls = pct >= 80 ? "done" : pct < 40 ? "low" : "";
  return `<span class="load"><span class="bar ${cls}"><span class="fill" style="width:${pct}%"></span></span><span class="num">${pct}&thinsp;%</span></span>`;
}

function sparkline(values: number[]): string {
  const max = Math.max(1, ...values);
  const step = 120 / (BUCKETS - 1);
  const pts = values.map((v, k) => `${(k * step).toFixed(1)},${(24 - (22 * v) / max).toFixed(1)}`).join(" ");
  return (
    `<svg viewBox="0 0 120 26" preserveAspectRatio="none"><polygon class="spark-area" points="0,26 ${pts} 120,26"/>` +
    `<polyline class="spark-line" points="${pts}"/></svg>`
  );
}
