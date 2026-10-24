import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { DEFAULT_GEN, type BiomeId, type Obstacle, type Purity, type WorldGen } from "../sim/terrain";

// Landschaft: Boden mit Biomen und Raster, Erz-Vorkommen, Deko und Seen.
// Alles wird in Chunks rund um das Kameraziel erzeugt; pro Chunk entstehen nur
// wenige Meshes (Boden, Deko, Leuchtteile, Wasser), damit es auf dem iPad flott bleibt.

const CHUNK = 16;
/** Zusaetzliche Chunks, die erst bei groesserem Abstand verworfen werden. */
const KEEP_MARGIN = 2;
/** Unterteilung je Feld: Feldmitte bekommt die reine Farbe, Raender mischen weich. */
const SUB = 2;
/** Rand um einen Chunk, der fuer Nachbar-Abfragen (Ufer, Seetiefe) mit erfasst wird. */
const MARGIN = 3;
const WATER_Y = -0.06;

/** Gemeinsame Shader-Werte fuer Boden und Wasser, gesetzt von `Environment`. */
export const terrainUniforms = {
  uTime: { value: 0 },
  /** 0 = Tag, 1 = Nacht. */
  uNight: { value: 0 },
  /** Staerke der Wolkenschatten. */
  uCloud: { value: 1 },
  /** Radius des bebauten Bereichs, in dem das Raster nachts leuchtet. */
  uBaseRadius: { value: 24 },
  uSkyColor: { value: new Color(0xa9c7d8) },
};

// ------------------------------------------------------------ Farben

const BIOME = {
  dry: new Color(0x8c9160),
  grass: new Color(0x76955a),
  lush: new Color(0x5a8c5e),
  rock: new Color(0x5d6569),
  sand: new Color(0xbdb088),
  lakeBed: new Color(0x3f5c5a),
  forest: new Color(0x4b7a4a),
  forestDark: new Color(0x3d6844),
  desert: new Color(0xd3b47c),
  dune: new Color(0xe0c48f),
  mountain: new Color(0x7b7f80),
  mountainDark: new Color(0x5f6466),
  snow: new Color(0xe8eef2),
  basalt: new Color(0x3b3533),
  ash: new Color(0x5a4b44),
  lavaBed: new Color(0x2a1a14),
  fog: new Color(0x2a3240),
};

interface OreStyle {
  ground: number;
  shape: "crystal" | "nugget" | "slab" | "oil";
  color: number;
  accent: number;
  glow: number | null;
}

/** Aussehen je Erz. Unbekannte Erze bekommen `FALLBACK_ORE`. */
const ORE_STYLES: Record<string, OreStyle> = {
  iron_ore: { ground: 0x66727e, shape: "crystal", color: 0x8ea4bd, accent: 0x5f6f80, glow: 0x9fe0ff },
  copper_ore: { ground: 0x86644a, shape: "nugget", color: 0xc8743c, accent: 0x4fa889, glow: 0xffa050 },
  coal: { ground: 0x3d3e43, shape: "slab", color: 0x2a2b30, accent: 0x3a3f4a, glow: null },
  stone: { ground: 0x8a877c, shape: "slab", color: 0xa29e93, accent: 0x7f7b71, glow: null },
  quartz: { ground: 0x9aa4ad, shape: "crystal", color: 0xe6eef5, accent: 0xb9c6d2, glow: 0xd8f4ff },
  sulfur: { ground: 0x9c9455, shape: "nugget", color: 0xe6d24a, accent: 0xf5ea8a, glow: 0xfff27a },
  crude_oil: { ground: 0x34322e, shape: "oil", color: 0x14161b, accent: 0x2b2a26, glow: null },
  bauxite: { ground: 0x9a5a3e, shape: "nugget", color: 0xb5603a, accent: 0xd9a07a, glow: null },
};
const FALLBACK_ORE: OreStyle = { ground: 0x777777, shape: "nugget", color: 0x999999, accent: 0x777777, glow: null };
const oreStyle = (ore: string) => ORE_STYLES[ore] ?? FALLBACK_ORE;

const DECO = {
  pebble: 0x7c7f80,
  rock: 0x6b7073,
  tuft: 0x6e9a4c,
  tuftDry: 0xb3a862,
  bush: 0x4f7d48,
  trunk: 0x6b4e38,
  crown: 0x3f6f55,
  crownLush: 0x467f50,
  reed: 0x7f9a52,
  stem: 0x4f7a50,
  bulb: 0x7fe8ff,
  bulbWarm: 0xffd27a,
  rockGlow: 0x6fd8ff,
  conifer: 0x2f5f45,
  cactus: 0x5f8f4e,
  deadBush: 0x8a7458,
  basaltRock: 0x2e2a29,
  ember: 0xff7a2a,
};

// ------------------------------------------------------------ Vorlagen

/** Nicht-indizierte Geometrie als rohe Arrays, wird pro Platzierung transformiert. */
interface Template {
  pos: Float32Array;
  nrm: Float32Array;
}

function template(geo: BufferGeometry): Template {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return {
    pos: g.getAttribute("position").array as Float32Array,
    nrm: g.getAttribute("normal").array as Float32Array,
  };
}

const T = {
  pebble: template(new OctahedronGeometry(0.075, 0).scale(1, 0.6, 1.2)),
  boulder: template(new DodecahedronGeometry(0.22, 0).translate(0, 0.08, 0)),
  tuft: template(tuftGeometry()),
  bush: template(new IcosahedronGeometry(0.16, 0).translate(0, 0.1, 0)),
  trunk: template(new CylinderGeometry(0.04, 0.06, 0.32, 5, 1, true).translate(0, 0.16, 0)),
  crown: template(crownGeometry()),
  reed: template(new ConeGeometry(0.018, 0.5, 3, 1, true).translate(0, 0.25, 0)),
  stem: template(new CylinderGeometry(0.012, 0.016, 0.24, 3, 1, true).translate(0, 0.12, 0)),
  bulb: template(new OctahedronGeometry(0.05, 0)),
  crystal: template(new CylinderGeometry(0, 0.075, 1, 5, 1, true).translate(0, 0.5, 0)),
  nugget: template(new IcosahedronGeometry(0.09, 0)),
  slab: template(new BoxGeometry(0.3, 0.06, 0.22)),
  pool: template(new CylinderGeometry(0.34, 0.36, 0.02, 9)),
  shard: template(new OctahedronGeometry(0.035, 0)),
  conifer: template(coniferGeometry()),
  cactus: template(cactusGeometry()),
};

/** Kleinteile, die aus der Ferne wegfallen. */
const DETAIL = new Set<Template>([T.pebble, T.tuft, T.reed, T.stem, T.bulb]);
/** Ab diesem Abstand (Chunk-Mitte zum Kameraziel) zeigt ein Chunk keine Kleinteile mehr. */
const DETAIL_RADIUS = 30;

/** Nicht-indizierte Teile ohne UVs zu einer Geometrie verbinden. */
function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const arrays = parts.map((p) => p.toNonIndexed().getAttribute("position").array as Float32Array);
  const pos = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    pos.set(a, o);
    o += a.length;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  return g;
}

function tuftGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const c = new ConeGeometry(0.024, 0.2 + i * 0.04, 3, 1, true);
    c.translate(0, 0.1 + i * 0.015, 0);
    c.rotateZ((i - 1) * 0.3);
    c.rotateY(i * 1.7);
    c.translate(Math.cos(i * 2.1) * 0.04, 0, Math.sin(i * 2.1) * 0.04);
    parts.push(c);
  }
  return mergeParts(parts);
}

function coniferGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) parts.push(new ConeGeometry(0.3 - i * 0.07, 0.42, 7, 1, true).translate(0, 0.42 + i * 0.26, 0));
  return mergeParts(parts);
}

function cactusGeometry(): BufferGeometry {
  const trunk = new CylinderGeometry(0.06, 0.07, 0.6, 6).translate(0, 0.3, 0);
  const armA = new CylinderGeometry(0.045, 0.045, 0.22, 6).translate(0.13, 0.4, 0);
  const elbowA = new CylinderGeometry(0.045, 0.045, 0.12, 6).rotateZ(Math.PI / 2).translate(0.08, 0.3, 0);
  const armB = new CylinderGeometry(0.04, 0.04, 0.16, 6).translate(-0.11, 0.33, 0);
  const elbowB = new CylinderGeometry(0.04, 0.04, 0.1, 6).rotateZ(Math.PI / 2).translate(-0.07, 0.25, 0);
  return mergeParts([trunk, armA, elbowA, armB, elbowB]);
}

function crownGeometry(): BufferGeometry {
  const a = new ConeGeometry(0.28, 0.5, 6, 1, true).translate(0, 0.5, 0);
  const b = new ConeGeometry(0.2, 0.4, 6, 1, true).translate(0, 0.78, 0);
  return mergeParts([a, b]);
}

// ------------------------------------------------------------ Materialien

const groundMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
groundMat.onBeforeCompile = (s) => patchGround(s);
groundMat.customProgramCacheKey = () => "terrain-ground";

const decoMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.08 });
/** Unbeleuchtete Leuchtteile; `Environment` dreht sie nachts hoch. */
export const glowMat = new MeshBasicMaterial({ vertexColors: true });

const waterMat = new MeshStandardMaterial({
  vertexColors: true,
  transparent: true,
  roughness: 0.12,
  metalness: 0.05,
  depthWrite: false,
});
waterMat.onBeforeCompile = (s) => patchWater(s);
waterMat.customProgramCacheKey = () => "terrain-water";

/** Lava leuchtet von selbst und wabert langsam. */
const lavaMat = new MeshBasicMaterial({ vertexColors: true });
lavaMat.onBeforeCompile = (s) => patchLava(s);
lavaMat.customProgramCacheKey = () => "terrain-lava";

const SHADER_COMMON = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uCloud;
uniform float uBaseRadius;
uniform vec3 uSkyColor;
varying vec3 vWPos;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

function addUniformsAndWorldPos(s: WebGLProgramParametersWithUniforms) {
  Object.assign(s.uniforms, terrainUniforms);
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\n${SHADER_COMMON}`);
}

/** Raster aus Feldfugen, Wolkenschatten und nachts leuchtende Fugen im bebauten Bereich. */
function patchGround(s: WebGLProgramParametersWithUniforms) {
  addUniformsAndWorldPos(s);
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float aFog;\nvarying float vFog;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFog = aFog;");
  s.fragmentShader = s.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vFog;")
    .replace(
      "#include <color_fragment>",
      /* glsl */ `#include <color_fragment>
      vec2 fw = fwidth(vWPos.xz);
      vec2 toLine = 0.5 - abs(fract(vWPos.xz) - 0.5);
      vec2 lines = 1.0 - smoothstep(vec2(0.012), vec2(0.012) + fw * 1.2, toLine);
      float gridFade = 1.0 - smoothstep(0.05, 0.18, max(fw.x, fw.y));
      float land = smoothstep(-0.04, -0.004, vWPos.y);
      float grid = max(lines.x, lines.y) * gridFade * land * (1.0 - vFog);
      diffuseColor.rgb *= 1.0 - 0.15 * grid;
      vec2 cp = vWPos.xz * 0.03 + vec2(uTime * 0.011, uTime * 0.006);
      float cloud = tNoise(cp) * 0.65 + tNoise(cp * 2.3 + 7.0) * 0.35;
      diffuseColor.rgb *= 1.0 - 0.24 * smoothstep(0.52, 0.72, cloud) * uCloud;
      // Nachts wirken Farben blasser.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uNight * 0.45);
      // Nebel des Krieges: ziehende Schwaden ueber unerkundetem Land.
      vec2 fp = vWPos.xz * 0.12 + vec2(uTime * 0.03, -uTime * 0.02);
      float mist = tNoise(fp) * 0.6 + tNoise(fp * 2.6 - uTime * 0.04) * 0.4;
      vec3 fogCol = mix(vec3(0.13, 0.16, 0.21), vec3(0.32, 0.37, 0.45), mist);
      diffuseColor.rgb = mix(diffuseColor.rgb, fogCol, smoothstep(0.0, 1.0, vFog));`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      float base = 1.0 - smoothstep(uBaseRadius * 0.6, uBaseRadius, length(vWPos.xz));
      float pulse = 0.8 + 0.2 * sin(uTime * 1.5 - length(vWPos.xz) * 0.4);
      totalEmissiveRadiance += vec3(0.2, 0.7, 1.0) * grid * base * uNight * 0.05 * pulse;`,
    );
}

function patchLava(s: WebGLProgramParametersWithUniforms) {
  addUniformsAndWorldPos(s);
  s.fragmentShader = s.fragmentShader.replace(
    "#include <color_fragment>",
    /* glsl */ `#include <color_fragment>
    vec2 lp = vWPos.xz * 1.3;
    float flow = tNoise(lp + vec2(uTime * 0.21, uTime * 0.13)) * 0.6 + tNoise(lp * 2.7 - uTime * 0.17) * 0.4;
    float crust = smoothstep(0.55, 0.75, tNoise(lp * 1.6 + 3.0 + uTime * 0.05));
    diffuseColor.rgb = mix(diffuseColor.rgb * (0.75 + 0.6 * flow), vec3(0.16, 0.08, 0.06), crust * 0.75);`,
  );
}

/** Wellen ueber die Normale, Himmel spiegelt sich am flachen Blickwinkel. */
function patchWater(s: WebGLProgramParametersWithUniforms) {
  addUniformsAndWorldPos(s);
  s.fragmentShader = s.fragmentShader
    .replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `#include <normal_fragment_maps>
      vec2 wp = vWPos.xz;
      float wx = cos(wp.x * 3.1 + uTime * 1.3) * 0.6 + cos((wp.x + wp.y) * 5.3 - uTime * 1.9) * 0.4;
      float wz = cos(wp.y * 2.7 - uTime * 1.1) * 0.6 + cos((wp.x - wp.y) * 4.7 + uTime * 1.6) * 0.4;
      normal = normalize(normal + (viewMatrix * vec4(wx * 0.12, 0.0, wz * 0.12, 0.0)).xyz);`,
    )
    .replace(
      "#include <opaque_fragment>",
      /* glsl */ `#include <opaque_fragment>
      float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uSkyColor, fres * 0.55);
      gl_FragColor.a = mix(gl_FragColor.a, 0.95, fres * 0.6);`,
    );
}

// ------------------------------------------------------------ Gelaende

interface Placement {
  tx: number;
  tz: number;
  tpl: Template;
  m: Matrix4;
  color: number;
  glow: boolean;
}

interface Chunk {
  group: Group;
  deco: Mesh | null;
  glow: Mesh | null;
  placements: Placement[];
  /** Belegte Felder mit Deko beim letzten Aufbau der Deko-Meshes. */
  hiddenKey: string;
  /** Weit weg: ohne Kleinteile. */
  far: boolean;
  /** Erkundete Nebel-Zellen beim Aufbau (siehe `fogKey`). */
  fogKey: string;
}

/** Ist Feld (x, y) erkundet? */
export type Explored = (x: number, y: number) => boolean;

type Occupied = (x: number, y: number) => boolean;

/** Boden, Erz, Deko und Seen, in Chunks rund um das Kameraziel erzeugt. */
export class TerrainView {
  readonly group = new Group();
  private readonly chunks = new Map<string, Chunk>();
  private occupied: Occupied = () => false;
  private gen: WorldGen = DEFAULT_GEN;
  private explored: Explored = () => true;
  private exploredVersion = -1;

  /** Nebel des Krieges: Chunks, deren erkundete Felder sich geaendert haben, neu bauen. */
  setExplored(explored: Explored, version: number) {
    if (version === this.exploredVersion) return;
    this.exploredVersion = version;
    this.explored = explored;
    for (const [key, c] of this.chunks) {
      const [x, z] = key.split(",").map(Number);
      if (fogKey(x, z, explored) === c.fogKey) continue;
      this.group.remove(c.group);
      disposeChunk(c);
      const n = this.makeChunk(x, z, c.far);
      this.chunks.set(key, n);
      this.group.add(n.group);
    }
  }

  private makeChunk(chx: number, chz: number, far: boolean): Chunk {
    const c = buildChunk(chx, chz, this.gen, this.explored);
    c.far = far;
    this.rebuildDeco(c);
    return c;
  }

  /** Anderer Weltgenerator (z. B. nach dem Laden): alles neu aufbauen. */
  setGen(gen: WorldGen) {
    if (gen === this.gen) return;
    this.gen = gen;
    for (const c of this.chunks.values()) {
      this.group.remove(c.group);
      disposeChunk(c);
    }
    this.chunks.clear();
  }

  /** Erzeugt alle Chunks, die den Kreis `viewRadius` um (cx, cz) beruehren, und verwirft entfernte. */
  update(cx: number, cz: number, viewRadius: number) {
    const keep = viewRadius + KEEP_MARGIN * CHUNK;
    const r = Math.ceil(viewRadius / CHUNK) + 1;
    const ccx = Math.floor(cx / CHUNK);
    const ccz = Math.floor(cz / CHUNK);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const chx = ccx + dx;
        const chz = ccz + dz;
        if (chunkDistance(chx, chz, cx, cz) > viewRadius) continue;
        const key = `${chx},${chz}`;
        if (!this.chunks.has(key)) {
          const c = this.makeChunk(chx, chz, chunkCenterDistance(chx, chz, cx, cz) > DETAIL_RADIUS);
          this.chunks.set(key, c);
          this.group.add(c.group);
        }
      }
    }
    for (const [key, c] of this.chunks) {
      const [x, z] = key.split(",").map(Number);
      if (chunkDistance(x, z, cx, cz) > keep) {
        this.group.remove(c.group);
        disposeChunk(c);
        this.chunks.delete(key);
        continue;
      }
      const far = chunkCenterDistance(x, z, cx, cz) > DETAIL_RADIUS;
      if (far !== c.far) {
        c.far = far;
        this.rebuildDeco(c);
      }
    }
  }

  /** Deko unter Gebaeuden ausblenden; nach jeder Bauaenderung aufrufen. */
  setOccupied(occupied: Occupied) {
    this.occupied = occupied;
    for (const c of this.chunks.values()) {
      if (hiddenKey(c, occupied) !== c.hiddenKey) this.rebuildDeco(c);
    }
  }

  private rebuildDeco(c: Chunk) {
    c.hiddenKey = hiddenKey(c, this.occupied);
    for (const m of [c.deco, c.glow]) {
      if (!m) continue;
      c.group.remove(m);
      m.geometry.dispose();
    }
    const visible = c.placements.filter((p) => !(c.far && DETAIL.has(p.tpl)) && !this.occupied(p.tx, p.tz));
    c.deco = mergePlacements(visible.filter((p) => !p.glow), decoMat, true);
    c.glow = mergePlacements(visible.filter((p) => p.glow), glowMat, false);
    if (c.deco) c.group.add(c.deco);
    if (c.glow) c.group.add(c.glow);
  }
}

/** Abstand vom Punkt zum naechsten Punkt des Chunks. */
function chunkDistance(chx: number, chz: number, x: number, z: number): number {
  const dx = Math.max(chx * CHUNK - x, 0, x - (chx + 1) * CHUNK);
  const dz = Math.max(chz * CHUNK - z, 0, z - (chz + 1) * CHUNK);
  return Math.hypot(dx, dz);
}

const chunkCenterDistance = (chx: number, chz: number, x: number, z: number) =>
  Math.hypot((chx + 0.5) * CHUNK - x, (chz + 0.5) * CHUNK - z);

/** Erkundungsstand der Felder eines Chunks samt Rand, abgetastet in Nebel-Zellen. */
function fogKey(chx: number, chz: number, explored: Explored): string {
  let key = "";
  for (let z = chz * CHUNK - 4; z <= (chz + 1) * CHUNK + 3; z += 4) {
    for (let x = chx * CHUNK - 4; x <= (chx + 1) * CHUNK + 3; x += 4) key += explored(x, z) ? "1" : "0";
  }
  return key;
}

function hiddenKey(c: Chunk, occupied: Occupied): string {
  let key = "";
  let last = "";
  for (const p of c.placements) {
    if (!occupied(p.tx, p.tz)) continue;
    const k = `${p.tx},${p.tz};`;
    if (k !== last) key += k;
    last = k;
  }
  return key;
}

interface TileInfo {
  /** Noch nicht erkundet. */
  fog: boolean;
  ore: string | null;
  obstacle: Obstacle | null;
  /** Wasser oder Lava: Boden senkt sich ab. */
  sunk: boolean;
  biome: BiomeId;
  purity: Purity;
  color: Color;
  /** Seetiefe 0..1 (nur Wasser- und Lavafelder). */
  depth: number;
  /** Felshoehe (nur Felsfelder). */
  height: number;
}

function buildChunk(chx: number, chz: number, gen: WorldGen, explored: Explored): Chunk {
  const group = new Group();
  const x0 = chx * CHUNK;
  const z0 = chz * CHUNK;
  const W = CHUNK + 2 * MARGIN;

  // Hindernisse samt Rand vorberechnen; im Nebel ist alles flach und leer.
  const obstacles: (Obstacle | null)[] = new Array(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 - MARGIN + i;
      const z = z0 - MARGIN + j;
      obstacles[j * W + i] = explored(x, z) ? gen.obstacleAt(x, z) : null;
    }
  }
  const obstacleAt = (tx: number, tz: number) => obstacles[(tz - z0 + MARGIN) * W + (tx - x0 + MARGIN)];
  const tiles: TileInfo[] = [];
  const tileAt = (tx: number, tz: number) => tiles[(tz - z0 + 1) * (CHUNK + 2) + (tx - x0 + 1)];
  for (let tz = z0 - 1; tz <= z0 + CHUNK; tz++) {
    for (let tx = x0 - 1; tx <= x0 + CHUNK; tx++) {
      const fog = !explored(tx, tz);
      const obstacle = obstacleAt(tx, tz);
      const sunk = obstacle === "water" || obstacle === "lava";
      const ore = obstacle || fog ? null : gen.oreAt(tx, tz);
      const biome = gen.biomeAt(tx, tz);
      let depth = 0;
      let height = 0;
      if (obstacle) {
        let n = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) n += obstacleAt(tx + dx, tz + dz) === obstacle ? 1 : 0;
        depth = Math.max(0, (n - 9) / 16);
        if (obstacle === "cliff") height = 0.35 + depth * 0.9 + hash(tx, tz, 7) * 0.25;
      }
      const color = new Color();
      if (fog) color.copy(BIOME.fog).offsetHSL(0, 0, (noise(tx / 5, tz / 5, 40) - 0.5) * 0.06 + (hash(tx, tz, 6) - 0.5) * 0.02);
      else if (obstacle === "water") color.copy(BIOME.sand);
      else if (obstacle === "lava") color.copy(BIOME.basalt);
      else if (obstacle === "cliff") color.copy(BIOME.mountainDark).lerp(BIOME.snow, smooth01((height - 0.9) / 0.4));
      else if (ore) color.setHex(oreStyle(ore).ground).offsetHSL(0, 0, (hash(tx, tz, 5) - 0.5) * 0.05);
      else biomeColor(tx, tz, biome, color);
      tiles.push({ fog, ore, obstacle, sunk, biome, purity: ore ? gen.purityAt(tx, tz) : "normal", color, depth, height });
    }
  }

  group.add(buildGround(x0, z0, tileAt));
  for (const kind of ["water", "lava"] as const) {
    const liquid = buildLiquid(x0, z0, tileAt, kind);
    if (liquid) group.add(liquid);
  }

  const placements: Placement[] = [];
  for (let tz = z0; tz < z0 + CHUNK; tz++) {
    for (let tx = x0; tx < x0 + CHUNK; tx++) {
      const t = tileAt(tx, tz);
      if (t.sunk || t.fog) continue;
      if (t.obstacle === "cliff") placeCliff(placements, tx, tz, t.height);
      else if (t.ore) placeOre(placements, tx, tz, oreStyle(t.ore), t.purity);
      else {
        const shore = [tileAt(tx + 1, tz), tileAt(tx - 1, tz), tileAt(tx, tz + 1), tileAt(tx, tz - 1)].some((n) => n.obstacle === "water");
        placeDeco(placements, tx, tz, t.biome, shore);
      }
    }
  }
  return { group, deco: null, glow: null, placements, hiddenKey: "-", far: false, fogKey: fogKey(chx, chz, explored) };
}

/** Feld-Ecken und -Mitten als Gitter; Seen senken sich zur Mitte ab, Felsen ragen auf. */
function buildGround(x0: number, z0: number, tileAt: (x: number, z: number) => TileInfo): Mesh {
  const N = CHUNK * SUB;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const col = new Float32Array((N + 1) * (N + 1) * 3);
  const fog = new Float32Array((N + 1) * (N + 1));
  const c = new Color();
  const deep = new Color();
  let v = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const wx = x0 + i / SUB;
      const wz = z0 + j / SUB;
      const { tiles, allSunk, allCliff, depth, height } = adjacentTiles(wx, wz, tileAt);
      c.setRGB(0, 0, 0);
      for (const t of tiles) c.add(t.color);
      c.multiplyScalar(1 / tiles.length);
      let y = 0;
      if (allSunk) {
        y = -(0.1 + 0.32 * depth);
        const lava = tiles[0].obstacle === "lava";
        c.lerp(deep.copy(lava ? BIOME.lavaBed : BIOME.lakeBed), Math.min(1, 0.4 + depth));
      } else if (allCliff) {
        y = height;
      } else if (tiles.some((t) => t.obstacle === "cliff")) {
        // Fuss des Felsens: leicht angehoben, damit die Flanke nicht senkrecht ist.
        y = 0.06;
      }
      fog[v] = tiles.filter((t) => t.fog).length / tiles.length;
      pos[v * 3] = wx;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = wz;
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      v++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const d = a + N + 1;
      const e = d + 1;
      idx.push(a, d, e, a, e, b);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.setAttribute("aFog", new BufferAttribute(fog, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, groundMat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Felder, die einen Gitterpunkt beruehren (1 an der Feldmitte, 2 an Kanten, 4 an Ecken). */
function adjacentTiles(wx: number, wz: number, tileAt: (x: number, z: number) => TileInfo) {
  const onX = Number.isInteger(wx);
  const onZ = Number.isInteger(wz);
  const xs = onX ? [wx - 1, wx] : [Math.floor(wx)];
  const zs = onZ ? [wz - 1, wz] : [Math.floor(wz)];
  const tiles: TileInfo[] = [];
  let allSunk = true;
  let allCliff = true;
  let depth = 0;
  let height = Infinity;
  for (const z of zs) {
    for (const x of xs) {
      const t = tileAt(x, z);
      tiles.push(t);
      allSunk &&= t.sunk && t.obstacle === tiles[0].obstacle;
      allCliff &&= t.obstacle === "cliff";
      depth += t.depth;
      height = Math.min(height, t.height);
    }
  }
  return { tiles, allSunk, allCliff, depth: depth / tiles.length, height };
}

function buildLiquid(x0: number, z0: number, tileAt: (x: number, z: number) => TileInfo, kind: "water" | "lava"): Mesh | null {
  const pos: number[] = [];
  const col: number[] = [];
  const lava = kind === "lava";
  const shallow = new Color(lava ? 0xff8a2a : 0x5fb8b0);
  const deepCol = new Color(lava ? 0xd8341a : 0x1d5a7a);
  const c = new Color();
  const vert = (wx: number, wz: number) => {
    const { allSunk, depth } = adjacentTiles(wx, wz, tileAt);
    const d = allSunk ? depth : 0;
    c.copy(shallow).lerp(deepCol, Math.min(1, d * 1.6));
    pos.push(wx, WATER_Y, wz);
    if (lava) col.push(c.r, c.g, c.b);
    else col.push(c.r, c.g, c.b, 0.45 + 0.45 * Math.min(1, d * 2));
  };
  const step = 1 / SUB;
  for (let tz = z0; tz < z0 + CHUNK; tz++) {
    for (let tx = x0; tx < x0 + CHUNK; tx++) {
      if (tileAt(tx, tz).obstacle !== kind) continue;
      for (let j = 0; j < SUB; j++) {
        for (let i = 0; i < SUB; i++) {
          const ax = tx + i * step;
          const az = tz + j * step;
          const bx = ax + step;
          const bz = az + step;
          vert(ax, az);
          vert(ax, bz);
          vert(bx, bz);
          vert(ax, az);
          vert(bx, bz);
          vert(bx, az);
        }
      }
    }
  }
  if (pos.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(col), lava ? 3 : 4));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const mesh = new Mesh(geo, lava ? lavaMat : waterMat);
  mesh.renderOrder = 1;
  return mesh;
}

/** Bodenfarbe je Biom, mit weichen Varianten aus zwei Rauschfeldern. */
function biomeColor(tx: number, tz: number, biome: BiomeId, out: Color): Color {
  const { wet, rock } = biomeNoise(tx, tz);
  switch (biome) {
    case "forest":
      out.copy(BIOME.forest).lerp(BIOME.forestDark, smooth01((wet - 0.4) / 0.3));
      break;
    case "desert":
      out.copy(BIOME.desert).lerp(BIOME.dune, smooth01((wet - 0.35) / 0.3));
      out.lerp(BIOME.sand, smooth01((rock - 0.65) / 0.2) * 0.6);
      break;
    case "mountains":
      out.copy(BIOME.mountain).lerp(BIOME.mountainDark, smooth01((rock - 0.45) / 0.3));
      out.lerp(BIOME.dry, smooth01((wet - 0.6) / 0.2) * 0.4);
      break;
    case "volcano":
      out.copy(BIOME.basalt).lerp(BIOME.ash, smooth01((rock - 0.4) / 0.3));
      break;
    default:
      out.copy(BIOME.dry).lerp(BIOME.grass, smooth01((wet - 0.22) / 0.18));
      out.lerp(BIOME.lush, smooth01((wet - 0.6) / 0.18));
      out.lerp(BIOME.rock, smooth01((rock - 0.6) / 0.16));
  }
  return out.offsetHSL(0, 0, (hash(tx, tz, 1) - 0.5) * 0.035);
}

function biomeNoise(tx: number, tz: number) {
  // Rund um den Start eher gruene Wiese.
  const home = 0.25 * (1 - smooth01(Math.hypot(tx, tz) / 30));
  return {
    wet: noise(tx / 26, tz / 26, 11) * 0.7 + noise(tx / 9, tz / 9, 12) * 0.3 + home,
    rock: noise(tx / 34, tz / 34, 13) * 0.75 + noise(tx / 11, tz / 11, 14) * 0.25,
  };
}

// ------------------------------------------------------------ Platzierung

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

function put(
  out: Placement[],
  tx: number,
  tz: number,
  tpl: Template,
  color: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy = sx,
  sz = sx,
  tiltX = 0,
  tiltZ = 0,
  glow = false,
) {
  _e.set(tiltX, yaw, tiltZ);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  out.push({ tx, tz, tpl, m: _m.clone(), color, glow });
}

/** Funkeln auf reinen Vorkommen, wenn das Erz selbst nicht leuchtet. */
const PURE_SPARK = 0xfff0b0;

/** Reine Vorkommen: mehr und groessere Brocken, die funkeln; unreine: wenige, kleine, matte. */
function placeOre(out: Placement[], tx: number, tz: number, st: OreStyle, purity: Purity) {
  const r = (k: number) => hash(tx, tz, 100 + k);
  const cx = tx + 0.5;
  const cz = tz + 0.5;
  const pure = purity === "pure";
  const impure = purity === "impure";
  const k = pure ? 1.2 : impure ? 0.7 : 1;
  const extra = pure ? 2 : impure ? -1 : 0;
  const color = (hex: number, h: number) => (impure ? dull(hex) : shade(hex, h));
  const glow = impure ? null : (st.glow ?? (pure ? PURE_SPARK : null));
  switch (st.shape) {
    case "crystal": {
      put(out, tx, tz, T.boulder, st.accent, cx + (r(0) - 0.5) * 0.2, -0.04, cz + (r(1) - 0.5) * 0.2, r(2) * 6, 0.8 * k, 0.45 * k);
      const n = 3 + Math.floor(r(3) * 2) + extra;
      for (let i = 0; i < n; i++) {
        const a = r(10 + i) * Math.PI * 2;
        const d = 0.08 + r(20 + i) * 0.2 * (pure ? 1.3 : 1);
        const h = (0.24 + r(30 + i) * 0.3) * k;
        const tilt = 0.15 + r(40 + i) * 0.35;
        put(out, tx, tz, T.crystal, i === 0 && !impure ? st.color : color(st.color, r(50 + i)), cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, a, k, h, k, Math.sin(a) * tilt, -Math.cos(a) * tilt);
      }
      if (glow !== null) put(out, tx, tz, T.shard, glow, cx + (r(4) - 0.5) * 0.4, 0.03, cz + (r(5) - 0.5) * 0.4, r(6) * 6, k, 1.4 * k, k, 0, 0, true);
      break;
    }
    case "nugget": {
      const n = 3 + Math.floor(r(3) * 2) + extra;
      for (let i = 0; i < n; i++) {
        const s = (0.7 + r(10 + i) * 0.8) * k;
        const c = i === n - 1 && r(9) < 0.35 ? st.accent : color(st.color, r(20 + i));
        put(out, tx, tz, T.nugget, c, tx + 0.2 + r(30 + i) * 0.6, 0.03 * s, tz + 0.2 + r(40 + i) * 0.6, r(50 + i) * 6, s, s * 0.75, s, r(60 + i) * 0.6);
      }
      if (glow !== null && (pure || r(7) < 0.6)) put(out, tx, tz, T.shard, glow, cx + (r(4) - 0.5) * 0.5, 0.02, cz + (r(5) - 0.5) * 0.5, r(6) * 6, 0.8 * k, 0.8 * k, 0.8 * k, 0, 0, true);
      break;
    }
    case "slab": {
      const n = 2 + Math.floor(r(3) * 2) + extra;
      for (let i = 0; i < n; i++) {
        const s = (0.7 + r(10 + i) * 0.6) * k;
        put(out, tx, tz, T.slab, color(i === 0 ? st.accent : st.color, r(20 + i)), tx + 0.25 + r(30 + i) * 0.5, 0.02 + i * 0.035, tz + 0.25 + r(40 + i) * 0.5, r(50 + i) * 6, s, 1 + r(60 + i), s, (r(70 + i) - 0.5) * 0.5, (r(80 + i) - 0.5) * 0.5);
      }
      if (r(8) < 0.5) put(out, tx, tz, T.pebble, st.color, tx + 0.2 + r(9) * 0.6, 0.02, tz + 0.2 + r(11) * 0.6, r(12) * 6, 1.2);
      if (glow !== null) put(out, tx, tz, T.shard, glow, cx + (r(4) - 0.5) * 0.4, 0.1, cz + (r(5) - 0.5) * 0.4, r(6) * 6, 0.8, 1, 0.8, 0, 0, true);
      break;
    }
    case "oil": {
      put(out, tx, tz, T.pool, st.color, cx, 0.005, cz, r(2) * 6, (0.8 + r(3) * 0.3) * k, 1, (0.8 + r(4) * 0.3) * k);
      for (let i = 0; i < 3 + extra; i++) {
        const a = r(10 + i) * Math.PI * 2;
        put(out, tx, tz, T.pebble, st.accent, cx + Math.cos(a) * 0.36 * k, 0.01, cz + Math.sin(a) * 0.36 * k, a, 1.2, 0.7);
      }
      if (pure) put(out, tx, tz, T.shard, PURE_SPARK, cx, 0.03, cz, r(6) * 6, 0.6, 0.6, 0.6, 0, 0, true);
      break;
    }
  }
}

/** Felsnadeln und Geroell auf Felsfeldern (der Boden selbst ist schon angehoben). */
function placeCliff(out: Placement[], tx: number, tz: number, height: number) {
  const r = (k: number) => hash(tx, tz, 300 + k);
  if (r(0) < 0.45) {
    const s = 0.8 + r(1) * 0.9;
    put(out, tx, tz, T.boulder, shade(DECO.rock, r(2)), tx + 0.2 + r(3) * 0.6, height - 0.05, tz + 0.2 + r(4) * 0.6, r(5) * 6, s, s * (0.8 + r(6)), s);
  }
  if (height > 1 && r(7) < 0.5) {
    put(out, tx, tz, T.pebble, 0xf2f6f8, tx + 0.3 + r(8) * 0.4, height, tz + 0.3 + r(9) * 0.4, r(10) * 6, 1.6, 0.5);
  }
}

function placeDeco(out: Placement[], tx: number, tz: number, biome: BiomeId, shore: boolean) {
  const d0 = Math.hypot(tx + 0.5, tz + 0.5);
  if (d0 < 2.5) return;
  const r = (k: number) => hash(tx, tz, 200 + k);
  const at = (k: number) => [tx + 0.15 + r(k) * 0.7, tz + 0.15 + r(k + 1) * 0.7] as const;
  switch (biome) {
    case "forest":
      return placeForest(out, tx, tz, r, at, shore);
    case "desert":
      return placeDesert(out, tx, tz, r, at);
    case "mountains":
      return placeMountains(out, tx, tz, r, at);
    case "volcano":
      return placeVolcano(out, tx, tz, r, at);
  }
  const { wet, rock } = biomeNoise(tx, tz);

  const lush = smooth01((wet - 0.6) / 0.18);
  const dry = 1 - smooth01((wet - 0.22) / 0.18);
  const rocky = smooth01((rock - 0.6) / 0.16);
  const grass = Math.max(0, 1 - lush - dry - rocky);

  if (shore && r(0) < 0.4) {
    for (let k = 0; k < 4; k++) {
      const [x, z] = at(10 + k * 2);
      put(out, tx, tz, T.reed, shade(DECO.reed, r(30 + k)), x, 0, z, r(40 + k) * 6, 1, 0.6 + r(50 + k) * 0.7, 1, (r(60 + k) - 0.5) * 0.3);
    }
    return;
  }

  // Baeume nicht direkt am Hub, damit der Start uebersichtlich bleibt.
  if (d0 > 7 && r(1) < lush * 0.07 + grass * 0.018) {
    const [x, z] = at(2);
    const s = 0.8 + r(4) * 0.6;
    put(out, tx, tz, T.trunk, DECO.trunk, x, 0, z, 0, s);
    put(out, tx, tz, T.crown, shade(lush > 0.5 ? DECO.crownLush : DECO.crown, r(5)), x, 0, z, r(6) * 6, s, s * (0.9 + r(7) * 0.3));
    return;
  }
  if (r(8) < lush * 0.05 + grass * 0.025 + dry * 0.02) {
    const [x, z] = at(9);
    const s = 0.6 + r(11) * 0.7;
    put(out, tx, tz, T.bush, shade(DECO.bush, r(12)), x, 0, z, r(13) * 6, s, s * 0.8);
  }
  const tuftChance = lush * 0.35 + grass * 0.18 + dry * 0.1;
  for (let k = 0; k < 3; k++) {
    if (r(20 + k) >= tuftChance) continue;
    const [x, z] = at(23 + k * 2);
    put(out, tx, tz, T.tuft, shade(dry > 0.5 ? DECO.tuftDry : DECO.tuft, r(30 + k)), x, 0, z, r(33 + k) * 6, 0.8 + r(36 + k) * 0.6);
  }
  if (r(40) < lush * 0.05 + grass * 0.012) {
    // Leuchtpflanze: Stiel mit Knospe, die nachts strahlt.
    const [x, z] = at(41);
    const h = 0.8 + r(43) * 0.6;
    put(out, tx, tz, T.stem, DECO.stem, x, 0, z, 0, 1, h);
    put(out, tx, tz, T.bulb, r(44) < 0.7 ? DECO.bulb : DECO.bulbWarm, x, 0.24 * h, z, r(45) * 6, 1, 1.3, 1, 0, 0, true);
  }
  const pebbleChance = rocky * 0.3 + dry * 0.08 + grass * 0.02;
  for (let k = 0; k < 2; k++) {
    if (r(50 + k) >= pebbleChance) continue;
    const [x, z] = at(52 + k * 2);
    put(out, tx, tz, T.pebble, shade(DECO.pebble, r(56 + k)), x, 0.01, z, r(58 + k) * 6, 0.7 + r(60 + k) * 0.9, 0.6);
  }
  if (r(62) < rocky * 0.06 + 0.004) {
    const [x, z] = at(63);
    const s = 0.7 + r(65) * 0.8;
    put(out, tx, tz, T.boulder, shade(DECO.rock, r(66)), x, 0, z, r(67) * 6, s, s * (0.6 + r(68) * 0.5), s * (0.8 + r(69) * 0.4));
    if (r(70) < 0.35) put(out, tx, tz, T.shard, DECO.rockGlow, x + 0.15, 0.03, z - 0.1, r(71) * 6, 0.9, 1.6, 0.9, 0.3, 0, true);
  }
}

/** Leichte Helligkeits-Streuung einer Farbe. */
function shade(hex: number, h: number): number {
  return _c.setHex(hex).offsetHSL(0, 0, (h - 0.5) * 0.08).getHex();
}
const _c = new Color();
/** Matte, entsaettigte Farbe fuer unreine Vorkommen. */
function dull(hex: number): number {
  return _c.setHex(hex).offsetHSL(0, -0.25, -0.06).getHex();
}

type Rand = (k: number) => number;
type At = (k: number) => readonly [number, number];

/** Dichter Nadelwald mit Lichtungen, Pilzleuchten und Schilf am Ufer. */
function placeForest(out: Placement[], tx: number, tz: number, r: Rand, at: At, shore: boolean) {
  if (shore && r(0) < 0.5) {
    for (let k = 0; k < 4; k++) {
      const [x, z] = at(10 + k * 2);
      put(out, tx, tz, T.reed, shade(DECO.reed, r(30 + k)), x, 0, z, r(40 + k) * 6, 1, 0.6 + r(50 + k) * 0.7, 1, (r(60 + k) - 0.5) * 0.3);
    }
    return;
  }
  const clearing = noise(tx / 7, tz / 7, 31) < 0.35;
  if (!clearing && r(1) < 0.3) {
    const [x, z] = at(2);
    const s = 0.7 + r(4) * 0.7;
    put(out, tx, tz, T.trunk, DECO.trunk, x, 0, z, 0, s * 0.8);
    const conifer = r(3) < 0.7;
    put(out, tx, tz, conifer ? T.conifer : T.crown, shade(conifer ? DECO.conifer : DECO.crownLush, r(5)), x, 0, z, r(6) * 6, s, s * (0.9 + r(7) * 0.4));
    return;
  }
  if (r(8) < 0.12) {
    const [x, z] = at(9);
    const s = 0.6 + r(11) * 0.6;
    put(out, tx, tz, T.bush, shade(DECO.bush, r(12)), x, 0, z, r(13) * 6, s, s * 0.8);
  }
  for (let k = 0; k < 2; k++) {
    if (r(20 + k) >= 0.3) continue;
    const [x, z] = at(23 + k * 2);
    put(out, tx, tz, T.tuft, shade(DECO.tuft, r(30 + k)), x, 0, z, r(33 + k) * 6, 0.8 + r(36 + k) * 0.6);
  }
  if (r(40) < 0.04) {
    const [x, z] = at(41);
    const h = 0.6 + r(43) * 0.5;
    put(out, tx, tz, T.stem, DECO.stem, x, 0, z, 0, 1, h);
    put(out, tx, tz, T.bulb, r(44) < 0.5 ? DECO.bulb : DECO.bulbWarm, x, 0.24 * h, z, r(45) * 6, 1, 1.3, 1, 0, 0, true);
  }
}

/** Wueste: Kakteen, duerre Bueschel, Steine. */
function placeDesert(out: Placement[], tx: number, tz: number, r: Rand, at: At) {
  if (r(1) < 0.025) {
    const [x, z] = at(2);
    const s = 0.7 + r(4) * 0.7;
    put(out, tx, tz, T.cactus, shade(DECO.cactus, r(5)), x, 0, z, r(6) * 6, s, s * (0.8 + r(7) * 0.5));
    return;
  }
  if (r(8) < 0.05) {
    const [x, z] = at(9);
    put(out, tx, tz, T.bush, shade(DECO.deadBush, r(12)), x, 0, z, r(13) * 6, 0.5 + r(11) * 0.4, 0.4);
  }
  if (r(20) < 0.08) {
    const [x, z] = at(23);
    put(out, tx, tz, T.tuft, shade(DECO.tuftDry, r(30)), x, 0, z, r(33) * 6, 0.7 + r(36) * 0.5);
  }
  if (r(50) < 0.06) {
    const [x, z] = at(52);
    put(out, tx, tz, T.pebble, shade(0xb39a74, r(56)), x, 0.01, z, r(58) * 6, 0.8 + r(60) * 0.8, 0.6);
  }
}

/** Berge: viel Geroell und Felsbrocken, vereinzelt Nadelbaeume. */
function placeMountains(out: Placement[], tx: number, tz: number, r: Rand, at: At) {
  if (r(1) < 0.025) {
    const [x, z] = at(2);
    const s = 0.6 + r(4) * 0.5;
    put(out, tx, tz, T.trunk, DECO.trunk, x, 0, z, 0, s * 0.8);
    put(out, tx, tz, T.conifer, shade(DECO.conifer, r(5)), x, 0, z, r(6) * 6, s, s);
    return;
  }
  for (let k = 0; k < 2; k++) {
    if (r(50 + k) >= 0.3) continue;
    const [x, z] = at(52 + k * 2);
    put(out, tx, tz, T.pebble, shade(DECO.pebble, r(56 + k)), x, 0.01, z, r(58 + k) * 6, 0.7 + r(60 + k) * 0.9, 0.6);
  }
  if (r(62) < 0.07) {
    const [x, z] = at(63);
    const s = 0.7 + r(65) * 0.8;
    put(out, tx, tz, T.boulder, shade(DECO.rock, r(66)), x, 0, z, r(67) * 6, s, s * (0.6 + r(68) * 0.5), s * (0.8 + r(69) * 0.4));
    if (r(70) < 0.25) put(out, tx, tz, T.shard, DECO.rockGlow, x + 0.15, 0.03, z - 0.1, r(71) * 6, 0.9, 1.6, 0.9, 0.3, 0, true);
  }
  if (r(20) < 0.08) {
    const [x, z] = at(23);
    put(out, tx, tz, T.tuft, shade(DECO.tuftDry, r(30)), x, 0, z, r(33) * 6, 0.6 + r(36) * 0.4);
  }
}

/** Vulkan: dunkles Gestein mit gluehenden Rissen und Glutbrocken. */
function placeVolcano(out: Placement[], tx: number, tz: number, r: Rand, at: At) {
  if (r(1) < 0.06) {
    const [x, z] = at(2);
    const s = 0.6 + r(4) * 0.8;
    put(out, tx, tz, T.boulder, shade(DECO.basaltRock, r(5)), x, 0, z, r(6) * 6, s, s * (0.5 + r(7) * 0.6), s);
  }
  if (r(8) < 0.1) {
    // Glutriss: flache, leuchtende Splitter in einer Reihe.
    const a = r(9) * Math.PI;
    const [x, z] = at(10);
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 0.12;
      put(out, tx, tz, T.shard, DECO.ember, x + Math.cos(a) * o, 0.0, z + Math.sin(a) * o, a, 1.4, 0.25, 0.6, 0, 0, true);
    }
  }
  if (r(20) < 0.15) {
    const [x, z] = at(23);
    put(out, tx, tz, T.pebble, shade(DECO.basaltRock, r(24)), x, 0.01, z, r(25) * 6, 0.8 + r(26) * 0.8, 0.6);
  }
}


// ------------------------------------------------------------ Zusammenfuegen

const _nm = new Matrix3();
const _v = new Vector3();

function mergePlacements(list: Placement[], material: MeshStandardMaterial | MeshBasicMaterial, shadows: boolean): Mesh | null {
  if (list.length === 0) return null;
  let n = 0;
  for (const p of list) n += p.tpl.pos.length;
  const pos = new Float32Array(n);
  const nrm = new Float32Array(n);
  const col = new Float32Array(n);
  const c = new Color();
  let o = 0;
  for (const p of list) {
    _nm.getNormalMatrix(p.m);
    c.setHex(p.color);
    const { pos: tp, nrm: tn } = p.tpl;
    for (let i = 0; i < tp.length; i += 3) {
      _v.set(tp[i], tp[i + 1], tp[i + 2]).applyMatrix4(p.m);
      pos[o] = _v.x;
      pos[o + 1] = _v.y;
      pos[o + 2] = _v.z;
      _v.set(tn[i], tn[i + 1], tn[i + 2]).applyMatrix3(_nm).normalize();
      nrm[o] = _v.x;
      nrm[o + 1] = _v.y;
      nrm[o + 2] = _v.z;
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
      o += 3;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nrm, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new Mesh(geo, material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function disposeChunk(c: Chunk) {
  c.group.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
}

// ------------------------------------------------------------ Rauschen

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + 0x5bd1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const smooth01 = (t: number) => smoothstep(Math.min(1, Math.max(0, t)));
