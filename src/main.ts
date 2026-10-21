import { Application } from "pixi.js";
import { COLORS } from "./config";
import { Editor } from "./game/editor";
import { Controls } from "./input/controls";
import { Camera } from "./render/camera";
import { WorldView } from "./render/world-view";
import { TICK_MS } from "./sim/constants";
import { World } from "./sim/world";
import { Ui } from "./ui/ui";

/** Maximal so viele Ticks pro Frame nachholen (z. B. nach Tab-Wechsel). */
const MAX_CATCH_UP = 5;
const UI_INTERVAL_MS = 250;

async function main() {
  const host = document.getElementById("app")!;

  const app = new Application();
  await app.init({
    background: COLORS.background,
    resizeTo: host,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: "webgl",
  });
  host.appendChild(app.canvas);

  const world = World.createDefault();
  const editor = new Editor(world);
  const camera = new Camera(app.screen.width, app.screen.height);
  camera.pos = { x: 0.5, y: 0.5 }; // Hub in die Bildmitte
  const view = new WorldView();
  app.stage.addChild(view.container);

  new Controls(app.canvas, camera, editor);
  const ui = new Ui(editor);

  app.renderer.on("resize", (w: number, h: number) => camera.resize(w, h));

  // Simulation im festen Takt, Darstellung so oft wie der Bildschirm kann.
  let acc = 0;
  let uiTimer = 0;
  app.ticker.add((t) => {
    acc += t.deltaMS;
    let steps = 0;
    while (acc >= TICK_MS && steps < MAX_CATCH_UP) {
      world.step();
      acc -= TICK_MS;
      steps++;
    }
    if (steps === MAX_CATCH_UP) acc = 0;

    view.render(world, camera, acc / TICK_MS, editor.selectedId);

    uiTimer += t.deltaMS;
    if (uiTimer >= UI_INTERVAL_MS) {
      uiTimer = 0;
      ui.tick();
    }
  });
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend", `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
});
