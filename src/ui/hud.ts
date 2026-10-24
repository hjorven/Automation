import type { Editor } from "../game/editor";
import { ITEM_ORDER, type ItemId } from "../sim/items";
import { MAX_TIER, TIERS, buildCost } from "../sim/progression";
import { toolName } from "./catalog";
import { byId, costChips, dot, fmt, itemName } from "./dom";
import type { OverviewTab } from "./overview";

const RING_R = 19;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * HUD oben links: Stufe mit Fortschrittsring, Kosten der naechsten Stufe,
 * Lagerchips und Baukosten des gewaehlten Werkzeugs.
 */
export class Hud {
  private readonly el = byId("hud");
  private layoutKey = "";
  private readonly lastCounts = new Map<ItemId, number>();
  private buildHtml = "";

  constructor(
    private readonly editor: Editor,
    private readonly onOverview: (tab: OverviewTab) => void,
  ) {
    this.el.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-open]");
      if (btn) this.onOverview(btn.dataset.open as OverviewTab);
    });
  }

  /** Haeufig aufrufen; baut nur neu, wenn sich Stufe, Werkzeug oder Itemsorten aendern. */
  update() {
    const w = this.editor.world;
    const items = ITEM_ORDER.filter((i) => w.storage.has(i));
    const tool = this.editor.tool;
    const key = `${w.tier}|${w.powerActive}|${tool}|${items.join(",")}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.render(items);
    }
    this.updateValues(items);
  }

  private render(items: ItemId[]) {
    const w = this.editor.world;
    const next = TIERS[w.tier + 1];
    let html =
      `<div class="head" data-open="tiers">` +
      `<div class="ring"><svg viewBox="0 0 46 46"><circle class="track" cx="23" cy="23" r="${RING_R}" fill="none" stroke-width="4"/>` +
      `<circle class="arc" cx="23" cy="23" r="${RING_R}" fill="none" stroke-width="4" stroke-linecap="round" ` +
      `stroke-dasharray="${RING_LEN}" stroke-dashoffset="${RING_LEN}"/></svg><b>${w.tier}</b></div>` +
      `<div><div class="caps">Hub-Stufe ${w.tier} von ${MAX_TIER}</div>` +
      `<div class="tier-name">${TIERS[w.tier].name}</div></div></div>`;

    if (next) {
      html += `<div class="next" data-open="tiers"><div class="caps">Nächste: ${next.name}</div>`;
      for (const c of next.cost) {
        html +=
          `<div class="cost-line" data-cost="${c.item}"><span>${dot(c.item)}${itemName(c.item)}</span>` +
          `<span class="num"></span><div class="bar"><div class="fill"></div></div></div>`;
      }
      html += `</div><div class="ready-hint" hidden>Upgrade bereit: Hub antippen</div>`;
    } else {
      html += `<div class="ready-hint">Alle Stufen erreicht. Die Fabrik ist komplett!</div>`;
    }

    if (w.powerActive) {
      html +=
        `<div class="power" data-power><span class="caps">Strom</span><div class="bar"><div class="fill"></div></div>` +
        `<span class="num"></span><span class="power-note" hidden></span></div>`;
    }

    const tool = this.editor.tool;
    if (tool !== "hand" && tool !== "delete") {
      html += `<div class="build-cost" data-build><span class="caps">${toolName(tool)}</span></div>`;
    }

    html += items.length
      ? `<div class="stocks">${items
          .map((i) => `<span class="chip" data-stock="${i}" title="${itemName(i)}">${dot(i)}<span class="num"></span></span>`)
          .join("")}</div>`
      : `<div class="hint">Bohrer auf Erz setzen und per Band zum Hub führen. Zwei Finger: bewegen, zoomen, drehen.</div>`;

    html +=
      `<div class="foot"><button data-open="tiers">Stufen</button><button data-open="research">Forschung</button>` +
      `<button data-open="orders">Aufträge</button><button data-open="inventory">Lager</button></div>`;
    this.el.innerHTML = html;
    this.lastCounts.clear();
    this.buildHtml = "";
  }

  private updateValues(items: ItemId[]) {
    const w = this.editor.world;
    const next = TIERS[w.tier + 1];
    if (next) {
      let have = 0;
      let need = 0;
      for (const c of next.cost) {
        const n = Math.min(w.storage.get(c.item) ?? 0, c.count);
        have += n;
        need += c.count;
        const row = this.el.querySelector<HTMLElement>(`[data-cost="${c.item}"]`);
        if (!row) continue;
        row.querySelector(".num")!.textContent = `${n}/${c.count}`;
        row.querySelector<HTMLElement>(".fill")!.style.width = `${(100 * n) / c.count}%`;
        row.querySelector(".bar")!.classList.toggle("done", n >= c.count);
      }
      const ready = w.canAfford(next.cost);
      const frac = need ? have / need : 1;
      this.el.querySelector<SVGCircleElement>(".arc")?.setAttribute("stroke-dashoffset", String(RING_LEN * (1 - frac)));
      this.el.querySelector(".ring")?.classList.toggle("ready", ready);
      const hint = this.el.querySelector<HTMLElement>(".ready-hint");
      if (hint) hint.hidden = !ready;
    } else {
      this.el.querySelector<SVGCircleElement>(".arc")?.setAttribute("stroke-dashoffset", "0");
    }

    const power = this.el.querySelector<HTMLElement>("[data-power]");
    if (power) {
      const p = w.power;
      const low = p.factor < 1;
      power.classList.toggle("low", low);
      power.querySelector<HTMLElement>(".fill")!.style.width = `${p.supply > 0 ? Math.min(100, (100 * p.demand) / p.supply) : 100}%`;
      power.querySelector(".num")!.textContent = `${fmt(p.demand)}/${fmt(p.supply)} MW`;
      const note = power.querySelector<HTMLElement>(".power-note")!;
      note.hidden = !low;
      if (low) note.textContent = `Zu wenig Strom: Maschinen laufen mit ${fmt(100 * p.factor)} %`;
    }

    const build = this.el.querySelector<HTMLElement>("[data-build]");
    const tool = this.editor.tool;
    if (build && tool !== "hand" && tool !== "delete") {
      const cost = buildCost(tool);
      const html = `<span class="caps">${toolName(tool)}</span>` + (cost.length ? costChips(cost, w.storage) : `<span class="chip have">kostenlos</span>`);
      // Nur bei Aenderung schreiben, sonst flackert es bei jedem Tick.
      if (this.buildHtml !== html) {
        this.buildHtml = html;
        build.innerHTML = html;
      }
    }

    for (const i of items) {
      const n = w.storage.get(i) ?? 0;
      const chip = this.el.querySelector<HTMLElement>(`[data-stock="${i}"]`);
      if (!chip) continue;
      chip.querySelector(".num")!.textContent = String(n);
      const prev = this.lastCounts.get(i);
      if (prev !== undefined && n > prev) {
        // Animation neu starten
        chip.classList.remove("bump");
        void chip.offsetWidth;
        chip.classList.add("bump");
      }
      this.lastCounts.set(i, n);
    }
  }
}

/** Kurze Meldungen oben in der Mitte. */
export class Toasts {
  private readonly el = byId("toasts");
  private last = "";
  private lastAt = 0;

  show(text: string, kind: "info" | "ok" | "bad" = "info", ms = 2600) {
    // Dieselbe Meldung nicht stapeln (z. B. beim Ziehen ueber viele Felder).
    const now = performance.now();
    if (text === this.last && now - this.lastAt < ms) return;
    this.last = text;
    this.lastAt = now;
    const t = document.createElement("div");
    t.className = `toast overlay ${kind}`;
    t.textContent = text;
    this.el.appendChild(t);
    while (this.el.children.length > 3) this.el.firstElementChild!.remove();
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  /** Hinweis direkt am Finger. */
  float(text: string, x: number, y: number) {
    const f = document.createElement("div");
    f.className = "float-msg";
    f.textContent = text;
    f.style.left = `${Math.max(60, Math.min(window.innerWidth - 60, x))}px`;
    f.style.top = `${Math.max(40, y - 24)}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }
}

/** Grosse Einblendung beim Erreichen einer Stufe. */
export function showTierBanner(tier: number, unlocksHtml: string) {
  const el = byId("banner");
  el.innerHTML =
    `<div class="b-tier">STUFE ${tier} ERREICHT</div><div class="b-name">${TIERS[tier].name}</div>` +
    (unlocksHtml ? `<div class="caps">Neu freigeschaltet</div><div class="unlocks" style="margin-top:6px">${unlocksHtml}</div>` : "");
  el.classList.remove("out");
  el.hidden = false;
  // Animation neu starten, falls die letzte noch laeuft.
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(
    setTimeout(() => {
      el.classList.add("out");
      el.dataset.timer = String(setTimeout(() => (el.hidden = true), 600));
    }, 4500),
  );
}
