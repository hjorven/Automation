import { describe, expect, it } from "vitest";
import { World } from "../sim/world";
import { Editor } from "./editor";

describe("Editor: Blaupausen-Werkzeug", () => {
  it("Bereich ziehen, kopieren, Vorschau verschieben, drehen und einfuegen", () => {
    const w = World.createDefault();
    w.unlockAll();
    w.fog = false;
    w.storage.set("iron_plate", 1000);
    w.storage.set("copper_plate", 1000);
    w.build("belt", 40, 40, 0);
    w.build("belt", 41, 40, 0);
    w.build("assembler", 42, 40, 0);
    const ed = new Editor(w);
    ed.setTool("blueprint");
    expect(ed.bp.mode).toBe("select");

    // Ziehen von (39,39) nach (43,41) markiert den Bereich.
    ed.strokeBegin(39, 39, false);
    ed.strokeMove(43, 41);
    ed.strokeEnd();
    expect(ed.bp.rect).toEqual({ x0: 39, y0: 39, x1: 43, y1: 41 });

    expect(ed.bpCopy()).toBe(true);
    expect(ed.bp.mode).toBe("paste");
    expect(ed.bp.clip?.entries).toHaveLength(3);

    // Antippen setzt die Mitte der Vorschau unter den Finger.
    ed.strokeBegin(61, 50, true);
    ed.strokeEnd();
    expect(ed.bp.at).toEqual({ x: 60, y: 50 });

    // R dreht die Kopie statt der Baurichtung.
    ed.rotate();
    expect(ed.bp.clip?.w).toBe(1);
    expect(ed.rotation).toBe(0);

    ed.bpPaste();
    expect(ed.bp.last).toMatchObject({ built: 3, skipped: 0 });
    expect(w.entities.size).toBe(7);
  });

  it("baut beim Ziehen nichts und ist vor der Freischaltung gesperrt", () => {
    const w = World.createDefault();
    const ed = new Editor(w);
    ed.setTool("blueprint");
    expect(ed.tool).toBe("hand");
    w.tier = 1;
    ed.setTool("blueprint");
    expect(ed.tool).toBe("blueprint");
    ed.strokeBegin(5, 5, false);
    ed.strokeMove(9, 9);
    ed.strokeEnd();
    expect(w.entities.size).toBe(1);
  });
});
