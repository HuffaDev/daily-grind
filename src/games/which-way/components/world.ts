import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32, seedForDateKey } from "@/platform/daily";

// A brass compass in the player's hand, held up in front of a still view of the city. The style is
// chunky faceted 3D: flat-shaded triangles, a faint blocky texture, warm sun and hazy distance. The
// two parts are separate layers with separate cameras, so the background can never move, because
// motion sickness came from a moving world. North is -Z and east is +X, so a compass bearing maps
// straight onto the dial.

const MAX_PIXEL_RATIO = 2;
const DIAL_RADIUS = 15.6;
const DIAL_TOP = 2.2;
const CASE_RADIUS = 18;
const COMPASS_FIELD_OF_VIEW = 32;
/** How far the compass tips away from the viewer, in radians from lying flat towards the camera. */
const CAMERA_TILT = 1.02;
const PADDING_PX = 10;
const IGNORE_NEAR_CENTRE = 1.5;
const SWING_SECONDS = 0.8;

const AIM_COLOR = "#f08a12";
const TRUE_COLOR = "#2467e0";
const BRASS = "#d4a23f";
const DIAL = "#f6eed8";
const INK = "#2a2520";
const SKIN = "#d9ab74";
const SLEEVE = "#3c4468";
const CUFF = "#2c3250";
const SUN_DIRECTION = new THREE.Vector3(0.55, 0.85, 0.6).normalize();

type Random = () => number;

/** The faint blocky patchwork that sits on every surface. */
function blockyTexture(random: Random): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const context = canvas.getContext("2d")!;
  for (let x = 0; x < 24; x++) {
    for (let y = 0; y < 24; y++) {
      const shade = Math.round(240 + random() * 15);
      context.fillStyle = `rgb(${shade},${shade},${shade})`;
      context.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Gives a shape its facets: every triangle gets its own flat face and a slightly different shade.
 * `lump` pushes corners around so organic things look carved. Shared corners move together, so no
 * gaps open up.
 */
function facet(source: THREE.BufferGeometry, color: string, random: Random, jitter = 0.07, lump = 0): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (lump > 0) {
    const moved = new Map<string, [number, number, number]>();
    for (let i = 0; i < positions.count; i++) {
      const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map((n) => n.toFixed(3)).join();
      if (!moved.has(key)) moved.set(key, [(random() - 0.5) * lump, (random() - 0.5) * lump, (random() - 0.5) * lump]);
      const [dx, dy, dz] = moved.get(key)!;
      positions.setXYZ(i, positions.getX(i) + dx, positions.getY(i) + dy, positions.getZ(i) + dz);
    }
  }
  const colors = new Float32Array(positions.count * 3);
  const base = new THREE.Color(color);
  const shade = new THREE.Color();
  for (let i = 0; i < positions.count; i += 3) {
    shade.copy(base).multiplyScalar(1 - jitter + random() * jitter * 2);
    for (let v = i; v < i + 3; v++) shade.toArray(colors, v * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function place(geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rotationY = 0): THREE.BufferGeometry {
  geometry.scale(sx, sy, sz);
  geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return geometry;
}

/** One draw call for a whole group of static shapes, which phones care about. */
function merged(parts: THREE.BufferGeometry[], material: THREE.Material, shadows = true): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((part) => {
    // Everything has to carry the same data to be merged.
    const keep = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "color", "uv"]) keep.setAttribute(name, part.getAttribute(name));
    return keep;
  })), material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** A tapered limb between two points, used for fingers, trunks and the sleeve. */
function limb(from: THREE.Vector3, to: THREE.Vector3, fromRadius: number, toRadius: number, color: string, random: Random, sides = 6, lump = 0): THREE.BufferGeometry {
  const length = from.distanceTo(to);
  const shape = new THREE.CylinderGeometry(toRadius, fromRadius, length, sides, 1);
  const geometry = facet(shape, color, random, 0.06, lump);
  geometry.translate(0, length / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
  geometry.translate(from.x, from.y, from.z);
  return geometry;
}

function blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, random: Random, detail = 1, lump = 0.08, jitter = 0.07): THREE.BufferGeometry {
  return place(facet(new THREE.IcosahedronGeometry(1, detail), color, random, jitter, lump), x, y, z, sx, sy, sz);
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A clean tube with rounded ends, following a few points. */
function buildFinger(points: THREE.Vector3[], radius: number, random: Random): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  points.forEach((point, i) => {
    parts.push(blob(point.x, point.y, point.z, radius, radius, radius, SKIN, random, 1, 0, 0.025));
    if (i > 0) parts.push(limb(points[i - 1], point, radius, radius, SKIN, random, 8));
  });
  return parts;
}

/** Deliberately simple: a palm under the case, four fingers and a thumb over its rim, an arm and a sleeve. */
function buildHand(random: Random, material: THREE.Material): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [
    blob(0, -4.4, 2, 19, 3, 18, SKIN, random, 2, 0, 0.025),
    // The arm stays low until it's clear of the case, so it can never cover the dial.
    limb(v(0, -7.4, 12), v(0, -9.6, 30), 6.8, 6, SKIN, random, 10),
    limb(v(0, -9.5, 29), v(0, -10.3, 34), 7, 7.2, CUFF, random, 10),
    limb(v(0, -10.2, 33), v(0, -15, 90), 6.6, 11, SLEEVE, random, 10),
  ];
  // Each finger comes up the outside of the case and rests its tip on the rim.
  parts.push(...buildFinger([v(-17, -3, 5), v(-20.4, 0.6, 5), v(-18.8, 4.6, 4)], 2.5, random));
  for (const z of [-8.4, -3, 2.4, 7.8]) {
    parts.push(...buildFinger([v(17, -3, z), v(20.4, 0.6, z), v(18.9, 4.5, z)], 2.2, random));
  }
  return merged(parts, material);
}

/** Stepped profile spun into a case, so the rim catches the light in bands. */
function buildCase(random: Random, material: THREE.Material): THREE.Mesh {
  const profile = [
    [0, -1.4], [CASE_RADIUS - 1.2, -1.4], [CASE_RADIUS, -0.2], [CASE_RADIUS, 2.8], [CASE_RADIUS - 0.8, 3.6], [DIAL_RADIUS + 0.7, 3.6], [DIAL_RADIUS, DIAL_TOP - 0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const parts = [
    facet(new THREE.LatheGeometry(profile, 30), BRASS, random, 0.09),
    // The crown and loop at north, which also shows at a glance which way is up.
    place(facet(new THREE.CylinderGeometry(1.5, 1.8, 3.4, 8), "#b9862e", random), 0, 1.2, -CASE_RADIUS - 1.2),
    place(facet(new THREE.TorusGeometry(2.2, 0.55, 5, 10), "#c39231", random), 0, 1.2, -CASE_RADIUS - 4),
  ];
  return merged(parts, material);
}

/** Painted, not modelled, so the letters and notches stay crisp and easy to read. */
function dialTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const centre = size / 2;
  context.fillStyle = DIAL;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineCap = "butt";
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const angle = (degrees * Math.PI) / 180;
    const main = degrees % 90 === 0;
    const corner = degrees % 45 === 0;
    const middle = degrees % 15 === 0;
    const length = main ? 58 : corner ? 44 : middle ? 30 : 16;
    context.lineWidth = main ? 11 : corner ? 8 : middle ? 5 : 3;
    context.globalAlpha = main || corner || middle ? 1 : 0.6;
    const outer = centre - 8;
    context.beginPath();
    context.moveTo(centre + Math.sin(angle) * outer, centre - Math.cos(angle) * outer);
    context.lineTo(centre + Math.sin(angle) * (outer - length), centre - Math.cos(angle) * (outer - length));
    context.stroke();
  }
  context.globalAlpha = 1;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const letter = (text: string, degrees: number, px: number, reach: number) => {
    const angle = (degrees * Math.PI) / 180;
    context.font = `700 ${px}px Georgia, "Times New Roman", serif`;
    context.fillText(text, centre + Math.sin(angle) * reach, centre - Math.cos(angle) * reach);
  };
  for (const [text, degrees] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) letter(text, degrees, 118, 345);
  for (const [text, degrees] of [["NE", 45], ["SE", 135], ["SW", 225], ["NW", 315]] as const) letter(text, degrees, 56, 372);
  for (let degrees = 30; degrees < 360; degrees += 30) {
    if (degrees % 90 !== 0) letter(String(degrees), degrees, 30, 412);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A long pointed blade, ridged so it catches the light, whose base sits under the centre cap. Each
 * needle lies at its own height and the cap sits above them all, so nothing cuts through anything.
 */
function buildNeedle(color: string, height: number, random: Random, material: THREE.Material): THREE.Group {
  const needle = new THREE.Group();
  const blade = new THREE.ConeGeometry(1.5, 13.2, 4);
  blade.rotateX(-Math.PI / 2);
  blade.scale(1, 0.14, 1);
  blade.translate(0, 0, -6.6);
  needle.add(merged([facet(blade, color, random, 0.03)], material));
  needle.position.y = height;
  needle.visible = false;
  return needle;
}

interface Palette {
  sky: string;
  horizon: string;
  ground: string;
  groundFar: string;
  walls: string[];
  roof: string;
  far: string;
  leaf: string;
  trunk: string;
  palms: boolean;
}

const TROPICAL: Palette = { sky: "#4d97d4", horizon: "#cfe3ea", ground: "#7fae4d", groundFar: "#e6d6a8", walls: ["#efe4cd", "#e9c98e", "#d97f5a", "#a9cfc0"], roof: "#a7523f", far: "#5f8d7c", leaf: "#6faa33", trunk: "#6b3d3a", palms: true };
const WARM: Palette = { sky: "#5a9dd0", horizon: "#e5e2cf", ground: "#d9c088", groundFar: "#e8d6a9", walls: ["#ecdcbc", "#dfb987", "#cf9a68", "#f3ead7"], roof: "#b0663f", far: "#b9916a", leaf: "#83a23e", trunk: "#6b4538", palms: true };
const TEMPERATE: Palette = { sky: "#6d9cc9", horizon: "#dbe5ea", ground: "#6f9c50", groundFar: "#8fae62", walls: ["#d8d1c2", "#b6bcc6", "#b9806a", "#e5decd"], roof: "#6e4a44", far: "#7a95a8", leaf: "#3f7f45", trunk: "#4d352f", palms: false };
const COLD: Palette = { sky: "#7c9abb", horizon: "#e2e9ee", ground: "#dfe8ea", groundFar: "#eef2f3", walls: ["#a9b2bc", "#c8cbcf", "#8796a6", "#b98c74"], roof: "#4e5a68", far: "#94a9bc", leaf: "#2f6650", trunk: "#3f302d", palms: false };

function paletteFor(lat: number): Palette {
  const distance = Math.abs(lat);
  if (distance < 20) return TROPICAL;
  if (distance < 37) return WARM;
  if (distance < 52) return TEMPERATE;
  return COLD;
}

function buildPalm(x: number, z: number, height: number, palette: Palette, random: Random): THREE.BufferGeometry[] {
  const parts = [limb(v(x, 0, z), v(x, height, z), 0.9, 0.55, palette.trunk, random, 6)];
  for (let i = 0; i < 8; i++) {
    const length = height * 0.5;
    const frond = new THREE.ConeGeometry(1.7, length, 4);
    frond.scale(1, 1, 0.12);
    frond.translate(0, length / 2, 0);
    frond.rotateZ(-1.35);
    frond.rotateY((i / 8) * Math.PI * 2);
    frond.translate(x, height, z);
    parts.push(facet(frond, palette.leaf, random, 0.08));
  }
  return parts;
}

function buildPine(x: number, z: number, height: number, palette: Palette, random: Random): THREE.BufferGeometry[] {
  const parts = [limb(v(x, 0, z), v(x, height * 0.3, z), 0.7, 0.6, palette.trunk, random, 6)];
  for (let i = 0; i < 3; i++) {
    parts.push(place(facet(new THREE.ConeGeometry(height * (0.27 - i * 0.06), height * 0.4, 7), palette.leaf, random, 0.08), x, height * (0.42 + i * 0.2), z));
  }
  return parts;
}

/** A plain block with one colour and a simple top. Depth comes from the haze, not from surface detail. */
function buildBuilding(x: number, z: number, width: number, height: number, palette: Palette, random: Random, tall: boolean): THREE.BufferGeometry[] {
  const wall = palette.walls[Math.floor(random() * palette.walls.length)];
  const parts = [place(facet(new THREE.BoxGeometry(width, height, width), wall, random, 0.02), x, height / 2, z)];
  if (tall) {
    parts.push(place(facet(new THREE.BoxGeometry(width * 0.6, 2, width * 0.6), wall, random, 0.02), x, height + 1, z));
  } else {
    const roof = new THREE.ConeGeometry(width * 0.78, width * 0.42, 4);
    roof.rotateY(Math.PI / 4);
    parts.push(place(facet(roof, palette.roof, random, 0.02), x, height + width * 0.21, z));
  }
  return parts;
}

function buildGround(color: string, random: Random, material: THREE.Material): THREE.Mesh {
  const plane = new THREE.PlaneGeometry(1400, 800, 12, 8);
  plane.rotateX(-Math.PI / 2);
  plane.translate(0, 0, -300);
  return merged([facet(plane, color, random, 0.012)], material, false);
}

/** Rows of evenly spaced buildings, so nothing overlaps oddly, with the tallest near the middle. */
function buildRow(z: number, spacing: number, baseHeight: number, tallness: number, tall: boolean, palette: Palette, random: Random): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const count = Math.ceil(420 / spacing);
  for (let i = -count; i <= count; i++) {
    if (random() < 0.15) continue;
    const x = i * spacing + (random() - 0.5) * spacing * 0.2;
    const centre = Math.max(0, 1 - Math.abs(x) / 170);
    const height = baseHeight + random() * baseHeight * 0.4 + centre * tallness * (0.6 + random() * 0.4);
    parts.push(...buildBuilding(x, z, spacing * 0.68, height, palette, random, tall));
  }
  return parts;
}

/** A still, tidy view of the city: its climate's colours, a skyline, framing trees, and the sea if it's on the coast. */
function buildCity(scene: THREE.Scene, palette: Palette, coastal: boolean, random: Random, material: THREE.Material) {
  scene.add(buildGround(coastal ? palette.groundFar : palette.ground, random, material));
  const parts: THREE.BufferGeometry[] = [];

  if (coastal) {
    // The sea starts in a clean straight line behind the city.
    const sea = new THREE.PlaneGeometry(1600, 500, 10, 4);
    sea.rotateX(-Math.PI / 2);
    parts.push(place(facet(sea, "#4a8fc4", random, 0.015), 0, 0.3, -470));
  } else {
    for (let i = -6; i <= 6; i++) {
      const ridge = new THREE.ConeGeometry(70 + random() * 30, 42 + random() * 40, 6);
      parts.push(place(facet(ridge, palette.far, random, 0.03), i * 72, 18, -400));
    }
  }

  parts.push(...buildRow(-205, 26, 16, 44, true, palette, random));
  parts.push(...buildRow(-150, 24, 11, 22, true, palette, random));
  parts.push(...buildRow(-98, 22, 6, 0, false, palette, random));

  // A few trees frame the two sides, leaving the middle clear behind the compass.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (34 + i * 17 + random() * 4);
      const z = -22 - i * 13;
      const height = 15 - i;
      parts.push(...(palette.palms ? buildPalm(x, z, height, palette, random) : buildPine(x, z, height, palette, random)));
    }
  }
  const city = merged(parts, material, false);
  city.receiveShadow = false;
  scene.add(city);

  // A few big, soft low-poly clouds.
  const clouds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const x = -300 + i * 150 + random() * 60;
    const y = 95 + random() * 45;
    clouds.push(blob(x, y, -520, 42, 9, 12, "#ffffff", random, 1, 0, 0.02), blob(x + 22, y + 6, -520, 24, 9, 12, "#ffffff", random, 1, 0, 0.02));
  }
  scene.add(merged(clouds, material, false));
}

function skyTexture(palette: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, palette.sky);
  gradient.addColorStop(0.68, palette.horizon);
  gradient.addColorStop(1, palette.horizon);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addSun(scene: THREE.Scene, skyFill: string, intensity: number, reach: number, shadowSize: number) {
  scene.add(new THREE.HemisphereLight(skyFill, "#8b7a64", 1.25));
  const sun = new THREE.DirectionalLight("#fff0d4", intensity);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(reach * 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.right = sun.shadow.camera.top = reach;
  sun.shadow.camera.far = reach * 4;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.25;
  scene.add(sun);
}

export interface World {
  /** Aims without a pointer, for the keyboard. */
  setAim(degrees: number): void;
  /** The compass bearing the player's needle points to. */
  aimed: () => number;
  /** Swings out a second, blue needle to the true direction. */
  reveal: (trueBearing: number) => void;
  clear: () => void;
  /** Space the text and buttons take at the top and bottom, which the compass must fit between. */
  setInsets: (top: number, bottom: number) => void;
  dispose: () => void;
}

/** Throws if the device can't start WebGL. */
export function createWorld(
  container: HTMLElement,
  seed: string,
  latitude: number,
  coastal: boolean,
  onAim: (bearing: number) => void
): World {
  const random = mulberry32(seedForDateKey(`${seed}:city`));
  const palette = paletteFor(latitude);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Worked out when something changes rather than every frame, because the background never does.
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
  canvas.style.display = "block";
  canvas.style.cursor = "pointer";
  container.appendChild(canvas);

  const blocky = blockyTexture(random);
  const surface = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: blocky });

  const backdrop = new THREE.Scene();
  const sky = skyTexture(palette);
  backdrop.background = sky;
  backdrop.fog = new THREE.Fog(palette.horizon, 70, 460);
  // No cast shadows out here: hard shadows across a busy skyline looked like clutter.
  backdrop.add(new THREE.HemisphereLight(palette.sky, "#b8a98f", 1.7));
  const backdropSun = new THREE.DirectionalLight("#fff0d4", 1.9);
  backdropSun.position.copy(SUN_DIRECTION);
  backdrop.add(backdropSun);
  // The blocky texture is for things up close. Stretched over distant buildings it just looks like noise.
  const flatSurface = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  buildCity(backdrop, palette, coastal, random, flatSurface);
  const backdropCamera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
  backdropCamera.position.set(0, 9, 30);
  backdropCamera.lookAt(0, 14, -120);

  const foreground = new THREE.Scene();
  addSun(foreground, "#dfe9f2", 2.5, 44, 1024);
  foreground.add(buildHand(random, surface), buildCase(random, surface));
  const dialTex = dialTexture();
  // Lit partly from within, because the dial has to stay the brightest, clearest thing on screen.
  const dial = new THREE.Mesh(new THREE.CircleGeometry(DIAL_RADIUS + 0.2, 48), new THREE.MeshLambertMaterial({ map: dialTex, emissive: "#ffffff", emissiveMap: dialTex, emissiveIntensity: 0.5 }));
  dial.rotation.x = -Math.PI / 2;
  dial.position.y = DIAL_TOP;
  dial.receiveShadow = true;
  foreground.add(dial);
  // Stacked from the dial up: the player's needle, the answer's needle, then a cap over both bases.
  const pivot = merged([
    place(facet(new THREE.CylinderGeometry(2, 2.1, 0.5, 20), BRASS, random, 0.03), 0, 0, 0),
    place(facet(new THREE.CylinderGeometry(0.75, 0.95, 0.35, 12), "#8f6a24", random, 0.03), 0, 0.42, 0),
  ], surface);
  pivot.position.y = DIAL_TOP + 1.5;
  foreground.add(pivot);
  const aimNeedle = buildNeedle(AIM_COLOR, DIAL_TOP + 0.55, random, surface);
  const trueNeedle = buildNeedle(TRUE_COLOR, DIAL_TOP + 1, random, surface);
  foreground.add(aimNeedle, trueNeedle);
  const camera = new THREE.PerspectiveCamera(COMPASS_FIELD_OF_VIEW, 1, 1, 1000);

  let aim = 0;
  let touched = false;
  let locked = false;
  let insetTop = 0;
  let insetBottom = 0;
  let foregroundShadowStale = true;
  const showBearing = (needle: THREE.Group, degrees: number) => {
    needle.rotation.y = -THREE.MathUtils.degToRad(degrees);
    foregroundShadowStale = true;
  };

  let frame: number | null = null;
  let lastTime = 0;
  const steps = new Set<(seconds: number) => boolean>();

  function draw(time: number) {
    frame = null;
    const seconds = lastTime === 0 ? 0 : Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;
    for (const step of [...steps]) if (!step(seconds)) steps.delete(step);
    renderer.clear();
    renderer.render(backdrop, backdropCamera);
    renderer.clearDepth();
    renderer.shadowMap.needsUpdate = foregroundShadowStale;
    renderer.render(foreground, camera);
    foregroundShadowStale = false;
    if (steps.size > 0) {
      request();
    } else {
      lastTime = 0;
    }
  }

  function request() {
    frame ??= requestAnimationFrame(draw);
  }

  /** Sizes the compass to fill the gap between the header and the buttons, on any screen shape. */
  function layout() {
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height);
    backdropCamera.aspect = width / height;
    // A narrow phone needs a wider view, or the skyline would be cropped to a sliver.
    backdropCamera.fov = width < height ? 66 : 44;
    backdropCamera.updateProjectionMatrix();

    const room = height - insetTop - insetBottom - PADDING_PX * 2;
    const reach = CASE_RADIUS + 3.5;
    // Tilted away from the viewer, the compass looks shorter than it is wide.
    const squash = Math.sin(CAMERA_TILT);
    const radiusPx = Math.max(80, Math.min(width / 2 - PADDING_PX, room / (2 * squash)));
    const focalPx = height / 2 / Math.tan(THREE.MathUtils.degToRad(COMPASS_FIELD_OF_VIEW / 2));
    const distance = (reach * focalPx) / radiusPx;
    camera.aspect = width / height;
    camera.position.set(0, Math.sin(CAMERA_TILT) * distance, Math.cos(CAMERA_TILT) * distance);
    camera.lookAt(0, 0, 0);
    const centreY = insetTop + PADDING_PX + room / 2;
    camera.setViewOffset(width, height, 0, height / 2 - centreY, width, height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    request();
  }
  const observer = new ResizeObserver(layout);
  observer.observe(container);
  layout();

  const raycaster = new THREE.Raycaster();
  const dialPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DIAL_TOP);
  const hit = new THREE.Vector3();

  function aimAt(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
    if (!raycaster.ray.intersectPlane(dialPlane, hit)) return;
    if (Math.hypot(hit.x, hit.z) < IGNORE_NEAR_CENTRE) return;
    setAim((THREE.MathUtils.radToDeg(Math.atan2(hit.x, -hit.z)) + 360) % 360);
  }

  function setAim(degrees: number) {
    if (locked) return;
    aim = degrees;
    touched = true;
    showBearing(aimNeedle, aim);
    aimNeedle.visible = true;
    onAim(aim);
    request();
  }

  let pressId: number | null = null;

  function onPointerDown(e: PointerEvent) {
    if (pressId !== null || locked) return;
    canvas.setPointerCapture(e.pointerId);
    pressId = e.pointerId;
    canvas.style.cursor = "grabbing";
    aimAt(e.clientX, e.clientY);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId === pressId) aimAt(e.clientX, e.clientY);
  }

  function onPointerEnd(e: PointerEvent) {
    if (e.pointerId !== pressId) return;
    pressId = null;
    canvas.style.cursor = "pointer";
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("webglcontextrestored", () => {
    foregroundShadowStale = true;
    request();
  });

  request();

  return {
    aimed: () => aim,
    setAim,
    reveal(trueBearing) {
      locked = true;
      canvas.style.cursor = "default";
      aimNeedle.visible = touched;
      trueNeedle.visible = true;
      const turn = ((trueBearing - aim + 540) % 360) - 180;
      let elapsed = 0;
      steps.add((seconds) => {
        elapsed += seconds;
        const t = Math.min(1, elapsed / SWING_SECONDS);
        // A springy overshoot, like a real compass needle settling.
        const eased = 1 - Math.cos(t * Math.PI * 2.5) * Math.pow(1 - t, 2.4);
        showBearing(trueNeedle, aim + turn * eased);
        return t < 1;
      });
      request();
    },
    clear() {
      locked = false;
      touched = false;
      canvas.style.cursor = "pointer";
      aimNeedle.visible = false;
      trueNeedle.visible = false;
      foregroundShadowStale = true;
      request();
    },
    setInsets(top, bottom) {
      if (top === insetTop && bottom === insetBottom) return;
      insetTop = top;
      insetBottom = bottom;
      layout();
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      for (const scene of [backdrop, foreground]) {
        scene.traverse((object) => {
          const { geometry } = object as THREE.Mesh;
          geometry?.dispose();
        });
      }
      surface.dispose();
      flatSurface.dispose();
      (dial.material as THREE.Material).dispose();
      blocky.dispose();
      sky.dispose();
      dialTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
