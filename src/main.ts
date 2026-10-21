import { Application } from "pixi.js";
import { COLORS } from "./config";
import { Camera } from "./render/camera";
import { GridRenderer } from "./render/grid";
import { CameraControls } from "./input/controls";

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

  const camera = new Camera(app.renderer.width, app.renderer.height);
  const grid = new GridRenderer();
  app.stage.addChild(grid.gfx);

  new CameraControls(app.canvas, camera);

  app.renderer.on("resize", (w: number, h: number) => camera.resize(w, h));

  // Render-Loop (60 FPS). Hier wird spaeter die Simulation-Interpolation ergaenzt.
  app.ticker.add(() => {
    grid.draw(camera);
  });
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="color:#f88;padding:16px">${String(err)}</pre>`,
  );
});
