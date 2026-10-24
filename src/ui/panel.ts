import type { Editor } from "../game/editor";
import { Extractor, Generator, Machine, Storage, type Entity } from "../sim/entities";
import { EXTRACT_TICKS, TICKS_PER_SECOND } from "../sim/constants";
import { BIOME_NAMES, PURITY_NAMES, PURITY_RATE } from "../sim/terrain";
import { ITEM_ORDER, type ItemId } from "../sim/items";
import { ACCUMULATOR, MAX_TIER, SOLAR_POWER, TIERS, buildCost, powerUse } from "../sim/progression";
import { sunlight } from "../sim/daycycle";
import { recipeById, recipesFor } from "../sim/recipes";
import { TOOL_INFO, toolName } from "./catalog";
import { byId, costChips, dot, fmt, itemLabel, itemName, recipeHtml, stackChips } from "./dom";
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
    private readonly onOverview: (tab?: "tiers" | "research" | "orders") => void,
  ) {
    this.el.addEventListener("click", this.onClick);
  }

  render() {
    const e = this.editor.selected;
    const tile = this.editor.inspected;
    this.el.hidden = !e && !tile;
    if (!e) {
      if (tile) this.el.innerHTML = this.tileBody(tile.x, tile.y);
      return;
    }
    const w = this.editor.world;

    const thumb = this.thumbs[e.type];
    const title = e.type === "belt" && e.level > 1 ? `Förderband Mk${e.level}` : toolName(e.type);
    let html =
      `<div class="p-head">${thumb ? `<img src="${thumb}" alt="">` : `<span class="ph"></span>`}` +
      `<div><div class="p-title">${title}</div><div data-status></div></div>` +
      `<button class="p-close" data-action="close" aria-label="Schließen">&#x2715;</button></div>`;

    if (e.type === "hub") {
      html += this.hubBody();
    } else {
      html += `<div class="p-text">${this.describe(e)}</div>`;
      const recipes = e instanceof Machine ? recipesFor(e.type) : [];
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
      } else if (e instanceof Machine && e.recipe) {
        html += `<div class="section"><div class="caps">Rezept</div><div class="recipe-card">${recipeHtml(e.recipe)}</div></div>`;
      }
      if (e.type === "sorter") html += this.filterPicker(e.filter);
      html += `<div class="section" data-live></div>`;
    }

    const mk2 = e.type === "extractor" && w.isUnlocked("extractor_mk2");
    html +=
      `<div class="actions">` +
      (e.type !== "hub" ? `<button data-action="rotate">Drehen</button>` : "") +
      (e.type === "tunnel" ? `<button data-action="toggle-tunnel">${e.exit ? "Zum Eingang" : "Zum Ausgang"}</button>` : "") +
      (mk2 ? `<button data-action="mk2">Auf Mk2 aufrüsten</button>` : "") +
      (e.type === "hub"
        ? `<button data-action="overview">Alle Stufen</button><button data-action="research">Forschung</button>` +
          `<button data-action="orders">Aufträge</button>`
        : "") +
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
    if (live) live.innerHTML = liveBody(e, w);

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
    if (e instanceof Extractor) {
      const speed = e.type === "extractor_mk2" ? ", doppelt so schnell" : e.type === "extractor_mk3" ? ", viermal so schnell" : "";
      const purity = e.purity === "pure" ? " Reines Vorkommen: doppeltes Tempo." : e.purity === "impure" ? " Unreines Vorkommen: halbes Tempo." : "";
      return `Fördert ${itemLabel(e.ore)}${speed}.${purity}`;
    }
    if (e.type === "tunnel") return `${e.exit ? "Ausgang" : "Eingang"}. ${TOOL_INFO.tunnel}`;
    return TOOL_INFO[e.type] ?? "";
  }

  /** Freies Rohstofffeld: Erz, Reinheit und Biom, damit sich Suchen lohnt. */
  private tileBody(x: number, y: number): string {
    const gen = this.editor.world.gen;
    const ore = gen.oreAt(x, y);
    if (!ore) return "";
    const purity = gen.purityAt(x, y);
    const cls = purity === "pure" ? "ok" : purity === "impure" ? "bad" : "";
    const perMin = (60 * TICKS_PER_SECOND * PURITY_RATE[purity]) / EXTRACT_TICKS;
    const biome = gen.version === 1 ? "" : `Biom: <b>${BIOME_NAMES[gen.biomeAt(x, y)]}</b>. `;
    const tool = ore === "crude_oil" ? "Eine Ölpumpe" : "Ein Bohrer";
    return (
      `<div class="p-head"><span class="ph"></span><div><div class="p-title">${itemName(ore)}</div>` +
      `<div><span class="pill ${cls}">Vorkommen ${PURITY_NAMES[purity]}</span></div></div>` +
      `<button class="p-close" data-action="close" aria-label="Schließen">&#x2715;</button></div>` +
      `<div class="p-text">${biome}${tool} fördert hier ${fmt(perMin)} pro Minute.` +
      (purity === "normal" ? "" : purity === "pure" ? " Reine Vorkommen fördern doppelt so schnell." : " Unreine Vorkommen fördern nur halb so schnell.") +
      `</div>`
    );
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

  /** Item-Auswahl fuer den Sortierer: erst bekannte Items, der Rest ausgegraut. */
  private filterPicker(current: ItemId | null): string {
    const w = this.editor.world;
    const known = (i: ItemId) => w.storage.has(i) || w.delivered.has(i);
    const items = [...ITEM_ORDER].sort((a, b) => Number(known(b)) - Number(known(a)));
    return (
      `<div class="section"><div class="caps">Filter</div><div class="filter-grid">` +
      `<button data-filter="" class="${current === null ? "active" : ""}">Keiner</button>` +
      items
        .map(
          (i) =>
            `<button data-filter="${i}" class="${current === i ? "active" : ""}${known(i) ? "" : " unknown"}" title="${itemName(i)}">` +
            `${dot(i)}<span>${itemName(i)}</span></button>`,
        )
        .join("") +
      `</div></div>`
    );
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn) return;
    const ed = this.editor;
    if (btn.dataset.recipe) ed.setSelectedRecipe(recipeById(btn.dataset.recipe) ?? null);
    else if (btn.dataset.filter !== undefined) ed.setSelectedFilter((btn.dataset.filter || null) as ItemId | null);
    else if (btn.dataset.action === "rotate") ed.rotateSelected();
    else if (btn.dataset.action === "delete") ed.deleteSelected();
    else if (btn.dataset.action === "close") ed.clearSelection();
    else if (btn.dataset.action === "upgrade") ed.upgradeHub();
    else if (btn.dataset.action === "toggle-tunnel") ed.toggleSelectedTunnel();
    else if (btn.dataset.action === "mk2") ed.upgradeSelectedExtractor();
    else if (btn.dataset.action === "overview") this.onOverview("tiers");
    else if (btn.dataset.action === "research") this.onOverview("research");
    else if (btn.dataset.action === "orders") this.onOverview("orders");
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
  const slow = w.powerActive && powerUse(e.type) > 0 && w.power.factor < 1;
  if (e instanceof Machine) {
    if (!e.recipe) return { text: e.type === "smelter" ? "Wartet auf Erz" : "Kein Rezept", cls: "warn" };
    if (e.crafting) return slow ? { text: "Zu wenig Strom", cls: "warn" } : { text: "Arbeitet", cls: "ok" };
    const full = e.recipe.outputs.some((s) => (e.output.get(s.item) ?? 0) > s.count);
    if (full) return { text: "Ausgang blockiert", cls: "bad" };
    return { text: "Wartet auf Material", cls: "warn" };
  }
  if (e instanceof Extractor) {
    if (e.buffer !== null) return { text: "Ausgang blockiert", cls: "bad" };
    return slow ? { text: "Zu wenig Strom", cls: "warn" } : { text: "Fördert", cls: "ok" };
  }
  if (e instanceof Generator) {
    if (!e.burning) return { text: `Kein ${itemName(e.spec.fuel)}`, cls: "bad" };
    return { text: `${e.spec.power} MW`, cls: "ok" };
  }
  switch (e.type) {
    case "tunnel":
      if (e.exit) return { text: "Ausgang", cls: "" };
      return e.partner(w) ? { text: "Verbunden", cls: "ok" } : { text: "Kein Ausgang in Reichweite", cls: "bad" };
    case "belt":
      return e.items.length ? { text: `${e.items.length} Items`, cls: "ok" } : { text: "Leer", cls: "" };
    case "storage":
      return e.queue.length >= Storage.CAPACITY ? { text: "Voll", cls: "warn" } : e.queue.length ? { text: "Puffert", cls: "ok" } : { text: "Leer", cls: "" };
    case "sorter":
      return e.filter ? { text: `Filter: ${itemName(e.filter)}`, cls: "ok" } : { text: "Kein Filter", cls: "warn" };
    case "splitter":
    case "merger":
      return e.buffer !== null ? { text: "In Betrieb", cls: "ok" } : { text: "Leer", cls: "" };
    case "hub":
      return { text: `Stufe ${w.tier}`, cls: "ok" };
    case "solar": {
      const mw = SOLAR_POWER * sunlight(w.tick);
      return mw > 0 ? { text: `${fmt(mw)} MW`, cls: "ok" } : { text: "Nacht: kein Strom", cls: "warn" };
    }
    case "turret": {
      if (w.peaceful) return { text: "Friedlicher Modus", cls: "" };
      if (w.tick - e.lastShot < 20) return { text: "Feuert", cls: "warn" };
      return { text: "Wache", cls: "ok" };
    }
    case "accumulator": {
      const b = w.power.battery;
      if (!w.powerActive) return { text: "Ab Stufe Energie aktiv", cls: "" };
      if (b > 0.01) return { text: "Entlädt", cls: "warn" };
      if (b < -0.01) return { text: "Lädt", cls: "ok" };
      return e.stored >= ACCUMULATOR.capacity - 1e-6 ? { text: "Voll", cls: "ok" } : e.stored > 0 ? { text: "Bereit", cls: "" } : { text: "Leer", cls: "warn" };
    }
    default:
      return { text: "", cls: "" };
  }
}

function liveBody(e: Entity, w: Editor["world"]): string {
  const dmg = w.hazards.damage.get(e.id) ?? 0;
  const hurt = dmg > 0 ? `<div class="io"><span class="caps">Schaden</span><span class="num">${fmt((100 * dmg) / w.hazards.maxHp(e))} %, repariert sich</span></div>` : "";
  return hurt + liveBodyOf(e, w);
}

function liveBodyOf(e: Entity, w: Editor["world"]): string {
  const bar = (pct: number) => `<div class="bar work"><div class="fill" style="width:${pct}%;transition:none"></div></div>`;
  const use = w.powerActive ? powerUse(e.type) : 0;
  const power = use ? `<span class="caps">Strom</span><span class="num">${use} MW</span>` : "";
  if (e instanceof Machine) {
    const pct = e.recipe && e.crafting ? (100 * e.progress) / e.recipe.ticks : 0;
    return (
      `<div class="io"><span class="caps">Eingang</span><span class="chips">${stackChips(e.input)}</span>` +
      `<span class="caps">Ausgang</span><span class="chips">${stackChips(e.output)}</span>${power}</div>` +
      bar(pct)
    );
  }
  if (e instanceof Extractor) {
    const pct = e.buffer !== null ? 100 : (100 * e.timer) / e.interval;
    const perMin = (60 * TICKS_PER_SECOND) / e.interval;
    return `<div class="io"><span class="caps">Rate</span><span class="num">${fmt(perMin)} / min</span>${power}</div>` + bar(pct);
  }
  if (e instanceof Generator) {
    return (
      `<div class="io"><span class="caps">Brennstoff</span><span class="chips">${dot(e.spec.fuel)}<span class="num">${e.fuel}/${Generator.FUEL_CAPACITY}</span></span>` +
      `<span class="caps">Leistung</span><span class="num">${e.spec.power} MW</span></div>` +
      bar((100 * e.fuel) / Generator.FUEL_CAPACITY)
    );
  }
  switch (e.type) {
    case "tunnel":
      return e.exit ? "" : `<div class="io"><span class="caps">Unterwegs</span><span class="num">${e.transit.length}</span></div>`;
    case "storage": {
      const counts = new Map<ItemId, number>();
      for (const i of e.queue) counts.set(i, (counts.get(i) ?? 0) + 1);
      return (
        `<div class="io"><span class="caps">Inhalt</span><span class="chips">${stackChips(counts)}</span>` +
        `<span class="caps">Belegt</span><span class="num">${e.queue.length}/${Storage.CAPACITY}</span></div>` +
        bar((100 * e.queue.length) / Storage.CAPACITY)
      );
    }
    case "solar":
      return (
        `<div class="io"><span class="caps">Sonne</span><span class="num">${fmt(100 * sunlight(w.tick))} %</span>` +
        `<span class="caps">Spitze</span><span class="num">${SOLAR_POWER} MW</span></div>` +
        bar(100 * sunlight(w.tick))
      );
    case "accumulator":
      return (
        `<div class="io"><span class="caps">Ladung</span><span class="num">${fmt(e.stored)}/${ACCUMULATOR.capacity} MJ</span>` +
        `<span class="caps">Leistung</span><span class="num">bis ${ACCUMULATOR.rate} MW</span></div>` +
        bar((100 * e.stored) / ACCUMULATOR.capacity)
      );
    case "belt":
      return `<div class="io"><span class="caps">Stufe</span><span>Mk${e.level}, ${fmt(2 * (e.level === 3 ? 4 : e.level))} Felder/s</span></div>`;
    default:
      return "";
  }
}
