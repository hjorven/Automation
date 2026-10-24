import { NeutralToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";
import { Editor } from "./game/editor";
import { Controls } from "./input/controls";
import { CameraRig } from "./render3d/camera-rig";
import { BlueprintView } from "./render3d/blueprint-view";
import { SceneView } from "./render3d/scene-view";
import { TICK_MS } from "./sim/constants";
import { deserialize, serialize, type SaveData } from "./sim/save";
import { World } from "./sim/world";
import { clearAutosave, loadAutosave, writeAutosave, writeEmergency } from "./storage/autosave";
import { Menu } from "./ui/menu";
import { Ui } from "./ui/ui";

/** Maximal so viele Ticks pro Frame nachholen (z. B. nach Tab-Wechsel). */
const MAX_CATCH_UP = 5;
const UI_INTERVAL_MS = 250;
const AUTOSAVE_INTERVAL_MS = 15_000;
/** Kameradrehung pro Tastendruck (Q/E). */
const KEY_TURN = Math.PI / 8;

async function main() {
  const host = document.getElementById("app")!;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = NeutralToneMapping;
  host.appendChild(renderer.domElement);

  const world = await loadWorld();
  const editor = new Editor(world);
  const rig = new CameraRig(host.clientWidth, host.clientHeight);
  const view = new SceneView();
  const blueprintView = new BlueprintView();
  view.scene.add(blueprintView.group);

  const resize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    rig.resize(host.clientWidth, host.clientHeight);
  };
  resize();
  window.addEventListener("resize", resize);

  new Controls(renderer.domElement, rig, editor);
  // Fuer Tests und Screenshots im Dev-Server.
  if (import.meta.env.DEV) Object.assign(window, { game: { world, editor, rig } });

  // Speichern: regelmaessig und sobald Safari die Seite in den Hintergrund legt.
  let lastSavedAt: number | null = null;
  let saving = true;
  const save = async () => {
    if (!saving) return;
    try {
      const data = serialize(world);
      await writeAutosave(data);
      lastSavedAt = data.savedAt;
    } catch (err) {
      console.warn("Autosave fehlgeschlagen", err);
    }
  };
  const saveNow = () => {
    if (saving) writeEmergency(serialize(world));
    void save();
  };
  setInterval(save, AUTOSAVE_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });
  window.addEventListener("pagehide", saveNow);

  const menu = new Menu({
    snapshot: () => serialize(world),
    lastSavedAt: () => lastSavedAt,
    restartTutorial: () => ui.restartTutorial(),
    peaceful: () => world.peaceful,
    setPeaceful(on: boolean) {
      world.peaceful = on;
      void save();
    },
    async replace(data: SaveData | null) {
      // Autosave anhalten, damit der alte Stand den neuen nicht ueberschreibt.
      saving = false;
      if (data) await writeAutosave({ ...data, savedAt: Date.now() });
      else await clearAutosave();
      location.reload();
    },
  });
  const ui = new Ui(
    editor,
    () => (menu.isOpen ? menu.close() : menu.open()),
    (x, y) => {
      rig.target.set(x + 0.5, 0, y + 0.5);
      rig.update();
    },
  );

  window.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.target as HTMLElement).closest("textarea, input")) return;
    const cx = host.clientWidth / 2;
    const cy = host.clientHeight / 2;
    if (ev.key === "q" || ev.key === "Q") rig.rotateAt(-KEY_TURN, cx, cy);
    else if (ev.key === "e" || ev.key === "E") rig.rotateAt(KEY_TURN, cx, cy);
  });

  // Simulation im festen Takt, Darstellung so oft wie der Bildschirm kann.
  let acc = 0;
  let uiTimer = 0;
  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const deltaMS = Math.min(250, now - last);
    last = now;
    acc += deltaMS;
    let steps = 0;
    while (acc >= TICK_MS && steps < MAX_CATCH_UP) {
      world.step();
      acc -= TICK_MS;
      steps++;
    }
    if (steps === MAX_CATCH_UP) acc = 0;

    view.render(world, rig, acc / TICK_MS, deltaMS / 1000, editor.selectedId);
    blueprintView.update(world, editor.tool === "blueprint", editor.bp, now / 1000);
    renderer.render(view.scene, rig.camera);

    uiTimer += deltaMS;
    if (uiTimer >= UI_INTERVAL_MS) {
      uiTimer = 0;
      ui.tick();
      // Der Drehen-Pfeil zeigt die Baurichtung so, wie sie gerade auf dem Bildschirm liegt.
      const arrow = document.getElementById("rotate-arrow");
      if (arrow) arrow.style.transform = `rotate(${rig.yaw}rad)`;
    }
  });
}

/** Letzten Autosave laden; bei Fehlern mit neuer Welt starten. */
async function loadWorld(): Promise<World> {
  try {
    const raw = await loadAutosave();
    if (raw) return deserialize(raw);
  } catch (err) {
    console.warn("Autosave konnte nicht geladen werden", err);
  }
  return World.createDefault();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend", `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
});
