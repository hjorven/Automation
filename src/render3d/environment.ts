import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Points,
  PointsMaterial,
  Vector3,
  type Scene,
} from "three";
import { phaseAt, sunAngle } from "../sim/daycycle";
import { glowMat, terrainUniforms } from "./terrain";

// Licht, Nebel und Tag/Nacht-Zyklus. Die Tageszeit folgt der Spielzeit
// (world.tick), damit sie mit dem Spielstand gespeichert wird.

// Laenge von Tag und Nacht steht in der Simulation (Solarstrom, Angriffe).

interface Look {
  sky: Color;
  hemiGround: Color;
  light: Color;
}

const DAY: Look = { sky: new Color(0xa9c7d8), hemiGround: new Color(0x4a5a3c), light: new Color(0xfff4e0) };
const DUSK: Look = { sky: new Color(0xe3a98a), hemiGround: new Color(0x4a3f3c), light: new Color(0xffa865) };
const NIGHT: Look = { sky: new Color(0x1b2740), hemiGround: new Color(0x1c2433), light: new Color(0x9db8ff) };

const FIREFLIES = 90;
const FIREFLY_AREA = 26;

/**
 * Tageszeit fest einstellen: `?zeit=0.4` (0 = Sonnenaufgang, 0.375 = Mittag,
 * 0.75 = Sonnenuntergang, 0.875 = Mitternacht), `?zeit=tag` oder `?zeit=nacht`. Fuer Screenshots und zum Ausprobieren.
 */
function fixedPhaseFromUrl(): number | null {
  const v = new URLSearchParams(location.search).get("zeit");
  if (v === null) return null;
  if (v === "tag") return 0.2;
  if (v === "nacht") return 0.85;
  const n = Number(v);
  return Number.isFinite(n) ? ((n % 1) + 1) % 1 : null;
}

export class Environment {
  readonly light = new DirectionalLight(0xfff4e0, 2.4);
  private readonly hemi = new HemisphereLight(DAY.sky, DAY.hemiGround, 1.1);
  private readonly ambient = new AmbientLight(0xffffff, 0.25);
  private readonly fog = new Fog(DAY.sky, 30, 90);
  private readonly background = new Color();
  private readonly fireflies: Points;
  private readonly fireflyMat: PointsMaterial;
  private readonly seeds = new Float32Array(FIREFLIES * 3);
  private readonly dir = new Vector3();
  private readonly tmp = new Color();
  /** Tag/Nacht-Zyklus; null = laeuft mit der Spielzeit. */
  fixedPhase: number | null = fixedPhaseFromUrl();
  /** 0 = Tag, 1 = tiefe Nacht. */
  night = 0;

  constructor(scene: Scene) {
    scene.background = this.background;
    scene.fog = this.fog;
    scene.add(this.hemi, this.ambient);

    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0008;
    this.light.shadow.normalBias = 0.02;
    scene.add(this.light, this.light.target);

    for (let i = 0; i < this.seeds.length; i++) this.seeds[i] = Math.random();
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(FIREFLIES * 3), 3));
    this.fireflyMat = new PointsMaterial({
      color: 0xd8ff9a,
      size: 0.11,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.fireflies = new Points(geo, this.fireflyMat);
    this.fireflies.frustumCulled = false;
    scene.add(this.fireflies);
  }

  /** Phase 0..1: 0 Sonnenaufgang, 0.75 Sonnenuntergang, danach Nacht. */
  phase(gameSeconds: number): number {
    if (this.fixedPhase !== null) return this.fixedPhase;
    return phaseAt(gameSeconds);
  }

  /**
   * `target`/`distance` vom Kamera-Rig, `gameSeconds` aus world.tick,
   * `t` Echtzeit in Sekunden fuer Animationen, `tier` = Hub-Stufe.
   */
  update(target: Vector3, distance: number, gameSeconds: number, t: number, tier: number) {
    // Sonnenwinkel: 0..PI am Tag, PI..2PI in der (kuerzeren) Nacht.
    const theta = sunAngle(this.phase(gameSeconds));
    const e = Math.sin(theta);
    const dayF = smoothstep(-0.05, 0.25, e);
    const night = 1 - smoothstep(-0.25, 0.02, e);
    const dusk = Math.max(0, 1 - Math.abs(e) / 0.4) * (1 - night * 0.6);
    this.night = night;

    const sky = this.tmp.copy(NIGHT.sky).lerp(DAY.sky, dayF).lerp(DUSK.sky, dusk * 0.8);
    this.background.copy(sky);
    this.fog.color.copy(sky);
    terrainUniforms.uSkyColor.value.copy(sky);
    this.hemi.color.copy(sky).lerp(DAY.sky, 0.3 * (1 - night));
    this.hemi.groundColor.copy(NIGHT.hemiGround).lerp(DAY.hemiGround, dayF).lerp(DUSK.hemiGround, dusk * 0.5);
    this.hemi.intensity = 0.75 + 0.35 * dayF;
    this.ambient.intensity = 0.2 + 0.05 * dayF;
    this.ambient.color.setHex(0xffffff).lerp(NIGHT.light, night * 0.6);

    // Tags die Sonne, nachts der Mond; beim Wechsel sind beide fast aus.
    if (e >= 0) {
      this.dir.set(-Math.cos(theta) * 0.9, Math.max(0.28, e), 0.4);
      this.light.color.copy(DUSK.light).lerp(DAY.light, smoothstep(0.05, 0.45, e));
      this.light.intensity = 2.4 * smoothstep(0, 0.18, e);
    } else {
      const m = theta - Math.PI;
      this.dir.set(-Math.cos(m) * 0.6, 0.6 + Math.sin(m) * 0.4, -0.3);
      this.light.color.copy(NIGHT.light);
      this.light.intensity = 0.8 * smoothstep(0, 0.18, -e);
    }
    this.dir.normalize();

    // Schattenkamera wandert mit und deckt den sichtbaren Bereich ab.
    const r = Math.min(60, distance * 1.3 + 6);
    const cam = this.light.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 200;
    cam.updateProjectionMatrix();
    this.light.target.position.set(target.x, 0, target.z);
    this.light.position.copy(this.light.target.position).addScaledVector(this.dir, 80);

    // Leichter Dunst in der Ferne; der Rand des Gelaendes liegt ausserhalb des Bildes.
    this.fog.near = distance * 1.1;
    this.fog.far = distance * 2.2 + 20;

    terrainUniforms.uTime.value = t;
    terrainUniforms.uNight.value = night;
    terrainUniforms.uCloud.value = dayF;
    terrainUniforms.uBaseRadius.value = 18 + tier * 8;
    glowMat.color.setScalar(1 + 1.8 * night);

    this.updateFireflies(target, t, night);
  }

  private updateFireflies(target: Vector3, t: number, night: number) {
    this.fireflies.visible = night > 0.05;
    if (!this.fireflies.visible) return;
    this.fireflyMat.opacity = night * (0.75 + 0.25 * Math.sin(t * 3));
    const attr = this.fireflies.geometry.getAttribute("position") as BufferAttribute;
    const a = attr.array as Float32Array;
    const s = this.seeds;
    const half = FIREFLY_AREA / 2;
    for (let i = 0; i < FIREFLIES; i++) {
      const sx = s[i * 3];
      const sz = s[i * 3 + 1];
      const sy = s[i * 3 + 2];
      // Fest in der Welt verankert (wiederholt sich im Raster), damit sie beim Schwenken nicht mitwandern.
      const bx = wrap(sx * FIREFLY_AREA - target.x, FIREFLY_AREA) - half;
      const bz = wrap(sz * FIREFLY_AREA - target.z, FIREFLY_AREA) - half;
      a[i * 3] = target.x + bx + Math.sin(t * (0.3 + sy) + i) * 0.6;
      a[i * 3 + 1] = 0.25 + sy * 0.9 + Math.sin(t * (0.8 + sx) + i * 2) * 0.15;
      a[i * 3 + 2] = target.z + bz + Math.cos(t * (0.25 + sz) + i) * 0.6;
    }
    attr.needsUpdate = true;
  }
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
