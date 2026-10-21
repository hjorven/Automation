import { Container, Graphics } from "pixi.js";
import type { World } from "../sim/world";
import { drawBuildings } from "./buildings";
import type { Camera } from "./camera";
import { drawDynamic } from "./dynamic";
import { TerrainLayer } from "./terrain";

/**
 * Alle Weltebenen in einem Container, dessen Transformation der Kamera folgt.
 * Gezeichnet wird in Weltpixeln (1 Feld = TILE_SIZE).
 */
export class WorldView {
  readonly container = new Container();
  private readonly terrain = new TerrainLayer();
  private readonly buildings = new Graphics();
  private readonly dynamic = new Graphics();
  private drawnVersion = -1;
  private cameraKey = "";

  constructor() {
    this.container.addChild(this.terrain.container, this.buildings, this.dynamic);
  }

  render(world: World, camera: Camera, alpha: number, selectedId: number | null) {
    const origin = camera.worldToScreen(0, 0);
    this.container.position.set(origin.x, origin.y);
    this.container.scale.set(camera.zoom);

    const key = camera.key();
    if (key !== this.cameraKey) {
      this.cameraKey = key;
      this.terrain.update(camera);
    }

    if (world.version !== this.drawnVersion) {
      this.drawnVersion = world.version;
      drawBuildings(this.buildings, world);
    }

    drawDynamic(this.dynamic, world, alpha, camera.visibleTileBounds(), selectedId);
  }
}
