import type { Editor } from "../game/editor";
import { ITEM_ORDER } from "../sim/items";
import { TIERS } from "../sim/progression";
import { toolName } from "./catalog";
import { byId, costChips, dot, fmt, itemName } from "./dom";
import { tierTrack } from "./panel";
import { BUCKETS, type DeliveryStats } from "./stats";

export type OverviewTab = "tiers" | "inventory" | "stats";

const TABS: { id: OverviewTab; label: string }[] = [
  { id: "tiers", label: "Stufen" },
  { id: "inventory", label: "Lager" },
  { id: "stats", label: "Statistik" },
];

/** Grosser Bildschirm mit Reitern: alle Stufen, Hub-Lager, Lieferstatistik. */
export class Overview {
  private readonly el = byId("screen");
  private readonly scrim = byId("scrim");
  private tab: OverviewTab = "tiers";
  private bodyKey = "";

  constructor(
    private readonly editor: Editor,
    private readonly stats: DeliveryStats,
    private readonly unlocksHtml: (tier: number) => string,
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
    const key = `${this.tab}|${w.storageVersion}|${w.tier}|${this.tab === "stats" ? Math.floor(performance.now() / 1000) : ""}`;
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    const scroll = body.scrollTop;
    body.innerHTML = this.tab === "tiers" ? this.tiersHtml() : this.tab === "inventory" ? this.inventoryHtml() : this.statsHtml();
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
      html += unlocks ? `<div class="row">${unlocks}</div>` : `<div class="row muted">Ziel: Fabrik vollenden</div>`;
      if (i === w.tier + 1) {
        html += `<button class="primary upgrade" data-action="upgrade"${w.canAfford(t.cost) ? "" : " disabled"}>Upgrade kaufen</button>`;
      }
      html += `</div>`;
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
    let html =
      `<div class="stat-summary">` +
      `<div class="tile"><div class="n">${fmt(rate)}</div><div class="caps">Items / min</div></div>` +
      `<div class="tile"><div class="n">${fmt(total)}</div><div class="caps">Geliefert</div></div>` +
      `<div class="tile"><div class="n">${fmt(mins, mins < 10 ? 1 : 0)}</div><div class="caps">Minuten gemessen</div></div>` +
      `</div>`;
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
    return html + `</tbody></table><div class="muted" style="margin-top:10px;font-size:12px">Gezählt seit dem Laden der Seite.</div>`;
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("button");
    if (!btn) return;
    if (btn.dataset.tab) {
      this.tab = btn.dataset.tab as OverviewTab;
      this.bodyKey = "";
      this.update();
    } else if (btn.dataset.action === "close") this.close();
    else if (btn.dataset.action === "upgrade") this.editor.upgradeHub();
  };
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
