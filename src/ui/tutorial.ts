import type { Editor, Tool } from "../game/editor";
import type { ItemId } from "../sim/items";
import { TIERS } from "../sim/progression";
import { byId, costChips, loadPref, savePref } from "./dom";

const PREF = "automation.tutorial";

interface Step {
  title: string;
  text: (ed: Editor) => string;
  /** Erledigt, sobald das zutrifft; ohne `done` gibt es einen Weiter-Knopf. */
  done?: (ed: Editor) => boolean;
  /** Werkzeugknopf, der hervorgehoben wird. */
  tool?: Tool;
}

const has = (ed: Editor, type: string) => [...ed.world.entities.values()].some((e) => e.type === type);
const delivered = (ed: Editor, items: ItemId[]) => items.some((i) => ed.world.storage.has(i));

const STEPS: Step[] = [
  {
    title: "Willkommen in deiner Fabrik",
    text: () =>
      "Baue Rohstoffe ab, verarbeite sie und liefere sie zum Hub in der Mitte. " +
      "Mit den Lieferungen kaufst du neue Stufen und schaltest Gebäude frei.",
  },
  {
    title: "Bohrer wählen",
    text: () => "Tippe unten in der Werkzeugleiste auf den Bohrer.",
    tool: "extractor",
    done: (ed) => ed.tool === "extractor" || has(ed, "extractor"),
  },
  {
    title: "Bohrer setzen",
    text: () => "Tippe auf ein Erzfeld nahe dem Hub: graue Steine sind Eisen, rötliche Kupfer.",
    tool: "extractor",
    done: (ed) => has(ed, "extractor"),
  },
  {
    title: "Förderband legen",
    text: () =>
      "Wähle das Band und zieh mit dem Finger vom Bohrer bis an den Hub. " +
      "Der Bohrer gibt in Pfeilrichtung aus; tippe ihn mit dem Bohrer-Werkzeug an, um ihn zu drehen.",
    tool: "belt",
    done: (ed) => delivered(ed, ["iron_ore", "copper_ore", "iron_plate", "copper_plate"]),
  },
  {
    title: "Erz einschmelzen",
    text: () => "Erz allein bringt wenig. Setze eine Schmelze zwischen Bohrer und Hub in die Bandstrecke.",
    tool: "smelter",
    done: (ed) => has(ed, "smelter"),
  },
  {
    title: "Platten liefern",
    text: () => "Sobald Platten im Hub ankommen, füllt sich der Ring oben links.",
    done: (ed) => delivered(ed, ["iron_plate", "copper_plate"]),
  },
  {
    title: "Kamera",
    text: () =>
      "Zwei Finger verschieben, zoomen und drehen die Ansicht. " +
      "Mit der Hand ein Gebäude antippen zeigt Status und Einstellungen. Lange auf ein Werkzeug drücken erklärt es.",
  },
  {
    title: "Erstes Upgrade",
    text: (ed) =>
      `Sammle ${costChips(TIERS[1]?.cost ?? [], ed.world.storage)}. ` +
      "Dann mit der Hand auf den Hub tippen und die Stufe kaufen.",
    tool: "hand",
    done: (ed) => ed.world.tier >= 1,
  },
  {
    title: "Geschafft",
    text: () =>
      "Neue Gebäude erscheinen jetzt in der Werkzeugleiste. " +
      "Unter Stufen, Lager und Statistik oben links behältst du den Überblick. Viel Spaß beim Ausbauen!",
  },
];

/** Gefuehrte Einfuehrung fuer neue Spieler. Fortschritt bleibt im Browser. */
export class Tutorial {
  private readonly el = byId("tutorial");
  private step: number;
  private shownStep = -1;
  private target: HTMLElement | null = null;
  private textKey = "";

  constructor(
    private readonly editor: Editor,
    private readonly buttonFor: (tool: Tool) => HTMLElement | null,
  ) {
    const saved = loadPref(PREF);
    const w = editor.world;
    // Wer schon gespielt hat, bekommt keine Einfuehrung aufgedraengt.
    const veteran = w.tier > 0 || w.entities.size > 3;
    this.step = saved === "done" ? STEPS.length : saved !== null ? Number(saved) || 0 : veteran ? STEPS.length : 0;
    this.el.addEventListener("click", this.onClick);
  }

  restart() {
    this.step = 0;
    this.shownStep = -1;
    savePref(PREF, "0");
    this.update();
  }

  update() {
    const ed = this.editor;
    // Erledigte Schritte ueberspringen (auch mehrere auf einmal).
    while (this.step < STEPS.length && STEPS[this.step].done?.(ed)) this.step++;
    if (this.step !== this.shownStep) {
      this.shownStep = this.step;
      savePref(PREF, this.step >= STEPS.length ? "done" : String(this.step));
      this.render();
    }
    const s = STEPS[this.step];
    if (s) {
      // Texte mit Lagerstand laufend auffrischen.
      const text = s.text(ed);
      if (text !== this.textKey) {
        this.textKey = text;
        const t = this.el.querySelector(".tu-text");
        if (t) t.innerHTML = text;
      }
      this.highlight(s.tool && s.tool !== ed.tool ? this.buttonFor(s.tool) : null);
    }
  }

  private render() {
    const s = STEPS[this.step];
    this.el.hidden = !s;
    if (!s) {
      this.highlight(null);
      return;
    }
    this.textKey = s.text(this.editor);
    const last = this.step === STEPS.length - 1;
    this.el.innerHTML =
      `<div class="tu-head"><span class="tu-step">SCHRITT ${this.step + 1} / ${STEPS.length}</span>` +
      (last ? "" : `<button class="tu-skip" data-action="skip">Einführung beenden</button>`) +
      `</div><div class="tu-title">${s.title}</div><div class="tu-text">${this.textKey}</div>` +
      (s.done ? "" : `<div class="tu-actions"><button class="primary" data-action="next">${last ? "Los geht's" : "Weiter"}</button></div>`);
  }

  private highlight(el: HTMLElement | null) {
    if (el === this.target) return;
    this.target?.classList.remove("tut-target");
    this.target = el;
    if (el) {
      el.classList.add("tut-target");
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }

  private onClick = (ev: MouseEvent) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("button");
    if (!btn) return;
    if (btn.dataset.action === "next") this.step++;
    else if (btn.dataset.action === "skip") this.step = STEPS.length;
    this.update();
  };
}
