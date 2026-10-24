import { dirBetween, rotateCW, type Dir } from "../sim/dir";
import { Machine, type Entity } from "../sim/entities";
import type { ItemId } from "../sim/items";
import { BELT_LEVEL, type BuildId } from "../sim/progression";
import type { Recipe } from "../sim/recipes";
import { entityTypeOf, type BuildError, type World } from "../sim/world";

export type Tool = "hand" | "delete" | BuildId;

const isBeltTool = (t: Tool) => t !== "hand" && t !== "delete" && !!BELT_LEVEL[t];

interface Stroke {
  lastX: number;
  lastY: number;
  /** In diesem Zug neu gesetzte Gebaeude (nur die werden beim Ziehen umgedreht). */
  placed: Set<number>;
  tap: boolean;
}

/**
 * Bau-Logik zwischen Eingabe und Welt: Werkzeug, Drehung, Auswahl und
 * "Zuege" (Finger ziehen = Baender malen / mehrfach bauen / abreissen).
 */
export class Editor {
  tool: Tool = "hand";
  rotation: Dir = 0;
  selectedId: number | null = null;
  /** Neue Montierer uebernehmen das zuletzt gewaehlte Rezept. */
  assemblerRecipe: Recipe | null = null;
  /** Warum der letzte Bauversuch scheiterte (Hinweis in der UI). */
  lastError: { error: BuildError; at: number } | null = null;

  private stroke: Stroke | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(readonly world: World) {}

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  get selected(): Entity | undefined {
    return this.selectedId === null ? undefined : this.world.entities.get(this.selectedId);
  }

  setTool(tool: Tool) {
    if (tool !== "hand" && tool !== "delete" && !this.world.isUnlocked(tool)) return;
    this.tool = tool;
    if (tool !== "hand") this.selectedId = null;
    this.emit();
  }

  rotate() {
    this.rotation = rotateCW(this.rotation);
    this.emit();
  }

  /** Antippen mit der Hand: Gebaeude auswaehlen bzw. Auswahl aufheben. */
  select(x: number, y: number) {
    this.selectedId = this.world.entityAt(x, y)?.id ?? null;
    this.emit();
  }

  clearSelection() {
    this.selectedId = null;
    this.emit();
  }

  rotateSelected() {
    const e = this.selected;
    if (e) this.world.setDir(e, rotateCW(e.dir));
    this.emit();
  }

  deleteSelected() {
    const e = this.selected;
    if (e) this.world.demolish(e.x, e.y);
    this.selectedId = null;
    this.emit();
  }

  setSelectedRecipe(recipe: Recipe | null) {
    const e = this.selected;
    if (!(e instanceof Machine) || e.type === "smelter") return;
    if (recipe && (recipe.machine !== e.type || !this.world.isRecipeUnlocked(recipe))) return;
    this.world.setRecipe(e, recipe);
    if (e.type === "assembler") this.assemblerRecipe = recipe;
    this.emit();
  }

  setSelectedFilter(item: ItemId | null) {
    const e = this.selected;
    if (e?.type === "sorter") e.filter = item;
    this.emit();
  }

  toggleSelectedTunnel() {
    const e = this.selected;
    if (e?.type === "tunnel") this.world.toggleTunnel(e);
    this.emit();
  }

  upgradeSelectedExtractor() {
    const e = this.selected;
    const up = e && this.world.upgradeExtractor(e);
    if (up) this.selectedId = up.id;
    this.emit();
  }

  upgradeHub() {
    this.world.upgradeHub();
    this.emit();
  }

  research(id: string) {
    if (this.world.doResearch(id)) this.emit();
  }

  fulfillOrder(index: number) {
    if (this.world.fulfillOrder(index)) this.emit();
  }

  discardOrder(index: number) {
    if (this.world.discardOrder(index)) this.emit();
  }

  /** `tap`: kurzes Antippen statt Ziehen (dreht ein vorhandenes gleiches Gebaeude). */
  strokeBegin(x: number, y: number, tap: boolean) {
    this.stroke = { lastX: x, lastY: y, placed: new Set(), tap };
    this.applyAt(x, y, null);
  }

  strokeMove(x: number, y: number) {
    const s = this.stroke;
    if (!s) return;
    // Feld fuer Feld laufen, damit bei schnellen Bewegungen keine Luecken entstehen.
    while (s.lastX !== x || s.lastY !== y) {
      const nx = s.lastX + Math.sign(x - s.lastX);
      const ny = nx === s.lastX ? s.lastY + Math.sign(y - s.lastY) : s.lastY;
      this.applyAt(nx, ny, dirBetween(s.lastX, s.lastY, nx, ny));
      s.lastX = nx;
      s.lastY = ny;
    }
  }

  strokeEnd() {
    this.stroke = null;
  }

  private applyAt(x: number, y: number, moveDir: Dir | null) {
    const w = this.world;
    const s = this.stroke!;
    const tool = this.tool;
    if (tool === "hand") return;

    if (tool === "delete") {
      const e = w.demolish(x, y);
      if (e && e.id === this.selectedId) this.selectedId = null;
      return;
    }

    const belt = isBeltTool(tool);
    if (belt && moveDir !== null) {
      // Beim Ziehen zeigt das vorige Band zum neuen Feld -> Kurven entstehen von selbst.
      const prev = w.entityAt(s.lastX, s.lastY);
      if (prev?.type === "belt" && s.placed.has(prev.id)) w.setDir(prev, moveDir);
      this.rotation = moveDir;
      this.emit();
    }

    const existing = w.entityAt(x, y);
    if (existing) {
      // Schnelleren Bohrer auf einen alten setzen tauscht ihn aus.
      if ((tool === "extractor_mk2" || tool === "extractor_mk3") && existing.type.startsWith("extractor")) {
        if (existing.type === tool) return;
        const up = w.upgradeExtractor(existing, tool);
        if (up) s.placed.add(up.id);
        else if (!w.isUnlocked(tool)) this.fail("locked");
        else if (existing.type !== "extractor_mk3") this.fail("cost");
        return;
      }
      if (existing.type !== entityTypeOf(tool)) return;
      // Schnelleres Band ueber alte Baender ziehen ruestet sie auf.
      if (belt && existing.type === "belt" && existing.level < BELT_LEVEL[tool as BuildId]!) {
        if (!w.upgradeBelt(existing, tool as BuildId)) this.fail(w.isUnlocked(tool as BuildId) ? "cost" : "locked");
      }
      // Antippen eines gleichen Gebaeudes dreht es; Ziehen ueber Baender richtet sie aus.
      if (moveDir === null && s.tap) w.setDir(existing, rotateCW(existing.dir));
      else if (moveDir !== null && belt) w.setDir(existing, moveDir);
      // Ein Zug, der auf einem Band beginnt, darf dessen Richtung mitnehmen.
      if (belt) s.placed.add(existing.id);
      return;
    }

    const recipe = tool === "assembler" ? this.assemblerRecipe : null;
    const error = w.buildError(tool, x, y);
    if (error) {
      // Belegte Felder sind normal; fehlendes Erz nur beim Antippen melden, nicht beim Ziehen.
      if (error !== "blocked" && (error !== "ore" || moveDir === null)) this.fail(error);
      return;
    }
    const e = w.build(tool, x, y, this.rotation, recipe);
    if (e) s.placed.add(e.id);
  }

  private fail(error: BuildError) {
    this.lastError = { error, at: performance.now() };
    this.emit();
  }
}
