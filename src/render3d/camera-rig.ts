import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";

const MIN_DIST = 5;
const MAX_DIST = 55;
/** Neigung in Rad: nah flacher (mehr Perspektive), fern steiler (mehr Uebersicht). */
const PITCH_NEAR = 0.62;
const PITCH_FAR = 1.05;

/**
 * Orbit-Kamera ueber der Bodenebene (y = 0). Sim-Koordinate (x, y) liegt bei
 * Welt (x, 0, y); eine Gitterzelle ist eine Einheit gross.
 *
 * Bietet dieselbe Schnittstelle wie die 2D-Kamera, damit `Controls` beide bedienen kann.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(40, 1, 0.5, 400);
  readonly target = new Vector3(0.5, 0, 0.5);
  /** Drehung um die Hochachse. 0 = "Norden" (Sim -y) ist oben am Bildschirm. */
  yaw = 0;
  distance = 18;

  private width = 1;
  private height = 1;
  private readonly ray = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();

  constructor(width: number, height: number) {
    this.resize(width, height);
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.update();
  }

  get pitch(): number {
    const t = (this.distance - MIN_DIST) / (MAX_DIST - MIN_DIST);
    return PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * Math.sqrt(Math.max(0, t));
  }

  update() {
    const p = this.pitch;
    const flat = Math.cos(p) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      Math.sin(p) * this.distance,
      this.target.z + Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Bildschirmpunkt (CSS-Pixel) -> Punkt auf dem Boden in Sim-Koordinaten. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const p = this.groundAt(sx, sy);
    return { x: p.x, y: p.z };
  }

  private groundAt(sx: number, sy: number, out = new Vector3()): Vector3 {
    this.ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    if (!this.ray.ray.intersectPlane(this.ground, this.hit)) {
      // Strahl ueber dem Horizont: auf das Ziel zurueckfallen.
      return out.copy(this.target);
    }
    return out.copy(this.hit);
  }

  /** Verschieben, sodass der Boden dem Finger folgt. */
  panByPixels(dx: number, dy: number) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const a = this.groundAt(cx, cy);
    const b = this.groundAt(cx - dx, cy - dy);
    this.target.x += b.x - a.x;
    this.target.z += b.z - a.z;
    this.update();
  }

  /** Zoomen; der Bodenpunkt unter (sx, sy) bleibt dabei stehen. */
  zoomAt(factor: number, sx: number, sy: number) {
    this.keepAnchor(sx, sy, () => {
      this.distance = Math.min(MAX_DIST, Math.max(MIN_DIST, this.distance / factor));
    });
  }

  /** Um die Hochachse drehen (Rad); der Bodenpunkt unter (sx, sy) bleibt stehen. */
  rotateAt(angle: number, sx: number, sy: number) {
    this.keepAnchor(sx, sy, () => {
      this.yaw += angle;
    });
  }

  private keepAnchor(sx: number, sy: number, change: () => void) {
    const before = this.groundAt(sx, sy);
    change();
    this.update();
    const after = this.groundAt(sx, sy);
    this.target.x += before.x - after.x;
    this.target.z += before.z - after.z;
    this.update();
  }
}
