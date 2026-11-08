// Isometric office diorama: Meridian Tower floors seen from above at an angle, pixel-style rendering.
// WASD / arrows to walk (screen-relative), click a tile, a room, or a person to walk there, E to talk,
// W/S inside the lift to change floors, mouse wheel to zoom.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { WORLD, CHARACTERS } from "./characters.js";

const SLOT_Z = [-12, 0, 12];
const HALF_X = 5.6, Z_MIN = -18.6, Z_MAX = 19.2, LIFT_Z = 18.2, WEST_X = -6, EAST_X = 6;
const SPEED = 3.4, TURN_LERP = 0.2;
const ISO_DIR = new THREE.Vector3(1, 1.15, 1).normalize();
const pxToZ = (x) => (x - 330) / 220 * 12;
const zToPx = (z) => 330 + z / 12 * 220;

// Palette from the reference: deep green ground, sage floors, cream walls, tan desks, gold accents.
const C = { bg: 0x16352f, tileA: 0x8fae9a, tileB: 0x7f9d8a, wall: 0xb7cbb9, cream: 0xefe6cf, trim: 0x6b8a76, gold: 0xe9b64f, desk: 0xcbb08a, deskDark: 0x8c7355, screen: 0x3fa7a0, plant: 0x3f8a5a, base: 0x2b5148, red: 0xc84b3c };
const FLOOR_THEME = {
  1: { name: "Lobby", a: C.tileA, b: C.tileB, wall: C.wall },
  2: { name: "Security", a: 0x86a596, b: 0x789887, wall: 0xaebfb0 },
  3: { name: "Facilities", a: 0x9aa48c, b: 0x8c967e, wall: 0xb9bea6 },
  4: { name: "IT", a: 0x8ba8a4, b: 0x7c9995, wall: 0xb2c6c2 },
  7: { name: "Restricted", a: 0x7b958a, b: 0x6d877c, wall: 0xa3b6aa },
  11: { name: "Executive", a: 0xa39a7c, b: 0x958c6e, wall: 0xc9bea0 },
  default: { name: "Offices", a: C.tileA, b: C.tileB, wall: C.wall },
};

// ---------- helpers ----------
function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, ...opts }));
  m.castShadow = true; m.receiveShadow = true; return m;
}
function textPlane(text, w, h, { fg = "#1f2a26", bg = "#efe6cf", size = 44, font = "bold" } = {}) {
  const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = `${font} ${size}px Rajdhani, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

// Distinct people: build, hair, accessories. Shared with the 2D portraits in scene.js.
export const TRAITS = {
  ghost:    { shirt: 0x3a4a5c, pants: 0x2a2320, skin: 0xc98f66, hair: "short", hairColor: 0x1a1410, height: 1.02, width: 1.0, acc: ["satchel"] },
  priya:    { shirt: 0x6fb3c9, pants: 0x4e8aa3, skin: 0xd9a77a, hair: "long", hairColor: 0x1a1410, height: 0.96, width: 0.92, acc: ["saree"] },
  ramesh:   { shirt: 0x5b6470, pants: 0x2a2a2e, skin: 0xa86e4b, hair: "cap", hairColor: 0x2a2a2e, height: 1.0, width: 1.18, acc: ["belt", "moustache", "epaulettes"] },
  dev:      { shirt: 0x2f3a45, pants: 0x556270, skin: 0xd9a77a, hair: "messy", hairColor: 0x3a2a1a, height: 1.06, width: 0.88, acc: ["glasses", "hood"] },
  anita:    { shirt: 0xf3ead6, pants: 0x2a2320, skin: 0xc98f66, hair: "bun", hairColor: 0x1a1410, height: 1.03, width: 0.95, acc: ["lanyard", "blazer", "skirt"] },
  kulkarni: { shirt: 0xe8dcc0, pants: 0x5a4a3a, skin: 0xb8865a, hair: "bald", hairColor: 0x6a6a72, height: 0.94, width: 1.25, acc: ["moustache"] },
  kavya:    { shirt: 0xc84b3c, pants: 0x2a2320, skin: 0xd9a77a, hair: "long", hairColor: 0x2a1a10, height: 0.9, width: 0.85, acc: ["lanyard"] },
  lakshmi:  { shirt: 0xc84b3c, pants: 0x7a2a5a, skin: 0xa86e4b, hair: "bun", hairColor: 0x1a1410, height: 0.92, width: 1.0, acc: ["saree"] },
  ambient:  { shirt: 0xf3ead6, pants: 0x2a2a2e, skin: 0xc98f66, hair: "short", hairColor: 0x1a1410, height: 1.0, width: 1.0, acc: [] },
};
function makePerson(t = TRAITS.ambient) {
  const { shirt, pants, skin, hair, hairColor, height, width, acc } = { ...TRAITS.ambient, ...t };
  const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
  const torso = box(0.46 * width, 0.6, 0.26 * width, shirt); torso.position.y = 1.15; inner.add(torso);
  if (acc.includes("blazer")) { const bl = box(0.52 * width, 0.5, 0.3 * width, 0x1f2a26); bl.position.y = 1.2; inner.add(bl); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: skin })); head.position.y = 1.62; head.castShadow = true; inner.add(head);
  const face = new THREE.Group(); face.position.set(0, 1.62, 0); inner.add(face);
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x0e0e10 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeMat); eyeL.position.set(-0.055, 0.02, 0.145); face.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.055; face.add(eyeR);
  const browL = box(0.06, 0.012, 0.01, hairColor); browL.position.set(-0.055, 0.065, 0.15); face.add(browL);
  const browR = browL.clone(); browR.position.x = 0.055; face.add(browR);
  const mouth = box(0.06, 0.012, 0.01, 0x7a2a2a); mouth.position.set(0, -0.06, 0.15); face.add(mouth);
  const cheeks = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc84b3c, transparent: true, opacity: 0 })); face.add(cheeks);
  g.userData.face = { eyeL, eyeR, browL, browR, mouth, cheeks, blinkT: Math.random() * 4 };
  const hc = hairColor;
  if (["short", "messy", "long", "bun"].includes(hair)) { const h = box(hair === "messy" ? 0.34 : 0.3, hair === "messy" ? 0.14 : 0.1, 0.3, hc); h.position.y = 1.74; inner.add(h); }
  if (hair === "long") { const back = box(0.32, 0.4, 0.1, hc); back.position.set(0, 1.5, -0.14); inner.add(back); }
  if (hair === "bun") { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshLambertMaterial({ color: hc })); b.position.set(0, 1.72, -0.14); inner.add(b); }
  if (hair === "cap") { const c = box(0.34, 0.09, 0.34, hc); c.position.y = 1.76; inner.add(c); const brim = box(0.22, 0.03, 0.16, hc); brim.position.set(0, 1.72, 0.22); inner.add(brim); }
  if (acc.includes("glasses")) { const gl = box(0.3, 0.05, 0.04, 0x0e0e10); gl.position.set(0, 1.63, 0.15); inner.add(gl); }
  if (acc.includes("moustache")) { const m = box(0.14, 0.035, 0.04, 0x2a1a10); m.position.set(0, 1.56, 0.155); inner.add(m); }
  if (acc.includes("lanyard")) { const l = box(0.03, 0.34, 0.02, C.red); l.position.set(0.05, 1.2, 0.14 * width); inner.add(l); const badge = box(0.1, 0.07, 0.02, 0xffffff); badge.position.set(0.05, 1.02, 0.145 * width); inner.add(badge); }
  if (acc.includes("satchel")) { const strap = box(0.05, 0.6, 0.03, 0x8c7355); strap.position.set(0.1, 1.2, 0.14 * width); strap.rotation.z = 0.5; inner.add(strap); const bag = box(0.28, 0.22, 0.12, 0xa8895f); bag.position.set(-0.3 * width, 0.95, 0); inner.add(bag); }
  if (acc.includes("belt")) { const b = box(0.48 * width, 0.06, 0.28 * width, 0x0e0e10); b.position.y = 0.87; inner.add(b); }
  if (acc.includes("hood")) { const hd = box(0.36 * width, 0.14, 0.16, shirt); hd.position.set(0, 1.5, -0.16); inner.add(hd); }
  if (acc.includes("epaulettes")) { for (const sx of [-1, 1]) { const e = box(0.12, 0.03, 0.14, C.gold); e.position.set(sx * 0.2 * width, 1.46, 0); inner.add(e); } const badge = box(0.06, 0.06, 0.02, C.gold); badge.position.set(-0.12, 1.28, 0.14 * width); inner.add(badge); }
  const mk = (x, y, w, h, c) => { const p = new THREE.Group(); const m = box(w, h, w, c); m.position.y = -h / 2; p.add(m); p.position.set(x, y, 0); inner.add(p); return p; };
  g.userData.legL = mk(-0.12 * width, 0.85, 0.16, 0.85, pants); g.userData.legR = mk(0.12 * width, 0.85, 0.16, 0.85, pants);
  g.userData.armL = mk(-0.32 * width, 1.42, 0.12, 0.6, shirt); g.userData.armR = mk(0.32 * width, 1.42, 0.12, 0.6, shirt);
  if (acc.includes("saree")) { const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34 * width, 0.9, 10, 1, true), new THREE.MeshLambertMaterial({ color: pants, side: THREE.DoubleSide })); skirt.position.y = 0.45; skirt.castShadow = true; inner.add(skirt); g.userData.legL.visible = false; g.userData.legR.visible = false; g.userData.dress = skirt; const pallu = box(0.14, 0.7, 0.03, shirt); pallu.position.set(-0.18 * width, 1.1, -0.13); pallu.rotation.z = -0.3; inner.add(pallu); }
  if (acc.includes("skirt")) { const sk = box(0.5 * width, 0.4, 0.3 * width, pants); sk.position.y = 0.72; inner.add(sk); }
  inner.scale.setScalar(height);
  g.userData.torso = torso; g.userData.t = Math.random() * 6;
  return g;
}
function animatePerson(g, dt, walking, phone = false) {
  const u = g.userData; u.t += dt * (walking ? 9 : 1.5);
  const s = walking ? Math.sin(u.t) * 0.7 : Math.sin(u.t) * 0.03;
  u.legL.rotation.x = s; u.legR.rotation.x = -s; u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = phone ? -2.4 : s * 0.8;
  u.armR.rotation.z = phone ? -0.5 : 0;
  if (u.dress) u.dress.rotation.z = walking ? Math.sin(u.t) * 0.06 : 0;
  if (u.torso) u.torso.scale.y = 1 + Math.sin(u.t * (walking ? 0.5 : 1.2)) * 0.015;
  g.position.y = walking ? Math.abs(Math.sin(u.t)) * 0.04 : 0;
  const f = u.face; if (f) { f.blinkT -= dt; if (f.blinkT < 0) { f.blinkT = 2.5 + Math.random() * 3; f.closing = 0.12; } if (f.closing > 0) { f.closing -= dt; const sc = f.closing > 0.06 ? 0.15 : 1; f.eyeL.scale.y = sc; f.eyeR.scale.y = sc; } }
}
export function setExpression(g, state) {
  const f = g.userData.face; if (!f) return;
  const E = {
    cooperative: { brow: 0, browY: 0.065, mouthW: 1.3, mouthY: -0.055, frown: false, flush: 0 },
    stalling: { brow: -0.25, browY: 0.06, mouthW: 1.0, mouthY: -0.06, frown: false, flush: 0.08 },
    hostile: { brow: -0.5, browY: 0.05, mouthW: 0.8, mouthY: -0.07, frown: true, flush: 0.18 },
    escalated: { brow: -0.7, browY: 0.045, mouthW: 0.7, mouthY: -0.075, frown: true, flush: 0.3 },
    worried: { brow: 0.35, browY: 0.075, mouthW: 0.7, mouthY: -0.07, frown: false, flush: 0 },
  }[state]; if (!E) return;
  f.browL.rotation.z = E.brow; f.browR.rotation.z = -E.brow; f.browL.position.y = f.browR.position.y = E.browY;
  f.mouth.scale.x = E.mouthW; f.mouth.position.y = E.mouthY; f.mouth.rotation.x = E.frown ? 0.6 : -0.2;
  f.cheeks.material.opacity = E.flush;
}

export class World3D {
  constructor(container, hooks) {
    if (World3D.current) World3D.current.destroy();
    World3D.current = this; this.dead = false;
    this.el = container; this.hooks = hooks || {};
    const old = container.querySelector("#gl"); const fresh = old.cloneNode(false); old.replaceWith(fresh); this.canvas = fresh;
    this.labelsEl = container.querySelector("#labels"); this.labelsEl.innerHTML = ""; this.minimap = container.querySelector("#minimap");
    this.fadeEl = container.querySelector("#fade"); this.promptEl = container.querySelector("#promptHud");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(0.5); // chunky pixels, upscaled with image-rendering: pixelated
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(C.bg);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.zoom = 1; this.zoomTarget = 1; this.lookAt = new THREE.Vector3(0, 0, -8);
    this.floor = 1; this.known = new Set(["lobby"]); this.visited = new Set([1]);
    this.player = makePerson(TRAITS.ghost); this.player.position.set(0.4, 0, -8); this.scene.add(this.player);
    this.keys = {}; this.enabled = true; this.moving = null; this.nearId = null; this.focusId = null; this.focusMode = null; this.stress = 0;
    this.npcs = new Map(); this.ambient = []; this.drag = null; this.walkCost = 0; this.dir = new THREE.Vector3(0, 0, -1);
    this.ray = new THREE.Raycaster(); this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._buildLights(); this._buildLevel(); this._buildNpcs();
    this._bindInput(); this._resize(); setTimeout(() => this._resize(), 120);
    this._onResize = () => this._resize(); window.addEventListener("resize", this._onResize);
    this._onGhost = (e) => { this.stress = { calm: 0, tense: 0.3, sweating: 0.7, caught: 1 }[e.detail] || 0; }; window.addEventListener("ghoststate", this._onGhost);
    this._onLine = (e) => this.bubble(e.detail.id, e.detail.text); window.addEventListener("npcline", this._onLine);
    this.clockT = performance.now(); this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
  }
  destroy() {
    this.dead = true; this.enabled = false;
    window.removeEventListener("resize", this._onResize); window.removeEventListener("ghoststate", this._onGhost); window.removeEventListener("npcline", this._onLine);
    try { this.renderer.dispose(); } catch {}
    if (World3D.current === this) World3D.current = null;
  }

  // ---------- building ----------
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x4a6a5a, 0.9));
    const key = new THREE.DirectionalLight(0xfff1cc, 1.0); key.position.set(-12, 22, 8); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); const s = 26; key.shadow.camera.left = -s; key.shadow.camera.right = s; key.shadow.camera.top = s; key.shadow.camera.bottom = -s; key.shadow.camera.near = 1; key.shadow.camera.far = 80;
    this.scene.add(key); this.key = key;
  }
  _theme() { return FLOOR_THEME[this.floor] || FLOOR_THEME.default; }
  _buildLevel() {
    if (this.level) this.scene.remove(this.level);
    const L = this.level = new THREE.Group(); const T = this._theme();
    const len = Z_MAX - Z_MIN + 2, zc = (Z_MAX + Z_MIN) / 2;
    const base = box(2 * HALF_X + 9.4, 0.7, len + 0.8, C.base); base.position.set(-4.4, -0.36, zc); L.add(base);
    const tileA = new THREE.MeshLambertMaterial({ color: T.a }), tileB = new THREE.MeshLambertMaterial({ color: T.b });
    const tileGeo = new THREE.BoxGeometry(1.96, 0.06, 1.96);
    for (let x = -HALF_X + 1; x <= HALF_X - 1; x += 2) for (let z = Z_MIN + 1; z <= Z_MAX - 1; z += 2) {
      const t = new THREE.Mesh(tileGeo, ((Math.round(x / 2) + Math.round(z / 2)) % 2 === 0) ? tileA : tileB); t.position.set(x, -0.03, z); t.receiveShadow = true; L.add(t);
    }
    const wallH = 1.1;
    const mkWall = (w, d, x, z) => { const m = box(w, wallH, d, T.wall); m.position.set(x, wallH / 2, z); L.add(m); const cap = box(w + 0.02, 0.06, d + 0.02, C.cream); cap.position.set(x, wallH + 0.03, z); L.add(cap); };
    mkWall(0.3, len, EAST_X + 0.15, zc); mkWall(0.3, len, WEST_X - 0.15, zc); mkWall(2 * HALF_X + 1, 0.3, 0, Z_MIN - 0.85); mkWall(2 * HALF_X + 1, 0.3, 0, Z_MAX + 0.85);
    // low partitions across the floor to make bays, like the reference
    for (const z of [-6, 6]) { const part = box(4.2, 0.8, 0.16, T.wall); part.position.set(3.4, 0.4, z); L.add(part); const cap = box(4.24, 0.05, 0.2, C.cream); cap.position.set(3.4, 0.83, z); L.add(cap); }
    for (let s = 0; s < 3; s++) {
      const room = WORLD.rooms.find(r => r.floor === this.floor && r.slot === s); const z = SLOT_Z[s];
      const state = room ? (this.known.has(room.id) ? (room.target ? "target" : "known") : "unknown") : "blank";
      const col = { target: C.gold, known: 0x3e5a4c, unknown: 0x8fa397, blank: 0xa3b5a8 }[state];
      const rm = box(4, 1.6, 4.4, T.wall); rm.position.set(WEST_X - 2.3, 0.8, z); L.add(rm);
      const roof = box(4.1, 0.08, 4.5, state === "target" ? C.gold : C.cream); roof.position.set(WEST_X - 2.3, 1.64, z); L.add(roof);
      const door = box(0.12, 1.0, 1.1, col); door.position.set(WEST_X - 0.1, 0.5, z); door.userData.room = room ? room.id : null; L.add(door);
      const label = room ? (this.known.has(room.id) ? room.label : "?") : "";
      if (label) { const sign = textPlane(label, 3.4, 0.7, { fg: state === "unknown" ? "#7a8a80" : "#1f2a26", bg: state === "target" ? "#e9b64f" : "#efe6cf" }); sign.rotation.x = -Math.PI / 2; sign.rotation.z = -Math.PI / 2; sign.position.set(WEST_X - 2.3, 1.7, z); L.add(sign); }
    }
    const liftFloor = box(3, 0.06, 2.4, C.trim); liftFloor.position.set(0, 0.02, LIFT_Z); L.add(liftFloor);
    for (const sx of [-1.5, 1.5]) { const side = box(0.12, 1.4, 2.4, C.wall); side.position.set(sx, 0.7, LIFT_Z); L.add(side); }
    const liftSign = textPlane(`LIFT · ${this.floor === 1 ? "G" : this.floor}`, 2.6, 0.6, { fg: "#e9b64f", bg: "#1f2a26" }); liftSign.rotation.x = -Math.PI / 2; liftSign.position.set(0, 0.08, LIFT_Z); L.add(liftSign);
    const fsign = textPlane(`${this.floor === 1 ? "GROUND" : "FLOOR " + this.floor} · ${T.name.toUpperCase()}`, 6, 0.9, { fg: "#1f2a26", bg: "#e9b64f" }); fsign.rotation.x = -Math.PI / 2; fsign.position.set(0, 0.05, Z_MIN + 1.2); L.add(fsign);
    const stripe = box(0.12, 0.02, len - 6, C.cream); stripe.position.set(0, 0.04, zc); L.add(stripe);
    this._props(L, T);
    this.scene.add(L);
  }
  _props(L, T) {
    const f = this.floor;
    const desk = (x, z, rotY = 0, col = C.desk) => { const d = box(1.6, 0.75, 0.8, col); d.position.set(x, 0.38, z); d.rotation.y = rotY; L.add(d); const mon = box(0.5, 0.35, 0.05, 0x1f2a26, { emissive: C.screen, emissiveIntensity: 0.6 }); mon.position.set(x, 0.95, z - 0.2); mon.rotation.y = rotY; L.add(mon); const chair = box(0.5, 0.5, 0.5, C.deskDark); chair.position.set(x + Math.sin(rotY) * 0.9, 0.25, z + Math.cos(rotY) * 0.9); L.add(chair); };
    const cluster = (x, z) => { desk(x - 0.9, z - 0.55, 0); desk(x + 0.9, z - 0.55, 0); desk(x - 0.9, z + 0.55, Math.PI); desk(x + 0.9, z + 0.55, Math.PI); };
    const plant = (x, z) => { const pot = box(0.4, 0.4, 0.4, C.deskDark); pot.position.set(x, 0.2, z); L.add(pot); const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 6), new THREE.MeshLambertMaterial({ color: C.plant })); leaf.position.set(x, 0.9, z); leaf.castShadow = true; L.add(leaf); };
    const counter = (x, z, w, col = C.deskDark) => { const c = box(w, 1.0, 0.8, col); c.position.set(x, 0.5, z); L.add(c); const top = box(w + 0.1, 0.06, 0.9, C.cream); top.position.set(x, 1.03, z); L.add(top); };
    if (f === 1) { counter(-3.6, 2.2, 3.2); const rug = box(4.6, 0.02, 6, 0x6b8a76); rug.position.set(0.5, 0.02, -3); L.add(rug); plant(4.8, -16); plant(4.8, 8); plant(-4.8, -16); const sofa = box(2.2, 0.5, 0.9, C.desk); sofa.position.set(3.6, 0.25, -12); L.add(sofa); const sofa2 = sofa.clone(); sofa2.position.set(3.6, 0.25, -15); L.add(sofa2); cluster(2.2, 2); }
    if (f === 2) { counter(-3.6, -11.8, 2.8); for (const gx of [-0.8, 0.8]) { const gate = box(0.1, 1.0, 1.0, C.cream); gate.position.set(gx, 0.5, -8); L.add(gate); } cluster(2.2, 2); plant(4.8, 14); }
    if (f === 3) { for (let z = -16; z < 18; z += 5) { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2 * HALF_X, 8), new THREE.MeshLambertMaterial({ color: C.deskDark })); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 1.05, z); L.add(pipe); } counter(-3.6, -11.8, 2.4); for (let i = 0; i < 4; i++) { const crate = box(0.8, 0.8, 0.8, C.desk); crate.position.set(3.6 + (i % 2) * 0.9, 0.4 + Math.floor(i / 2) * 0.8, 6 + (i % 2) * 0.1); L.add(crate); } }
    if (f === 4) { counter(-3.6, 2.2, 3.0); cluster(2.2, -10); cluster(2.2, 2); cluster(2.2, 12); const rack = box(0.6, 1.6, 0.6, 0x1f2a26); rack.position.set(4.8, 0.8, -15); L.add(rack); }
    if (f === 7) { const red = box(0.12, 1.0, 1.1, C.red, { emissive: C.red, emissiveIntensity: 0.3 }); red.position.set(WEST_X - 0.1, 0.5, 0); L.add(red); const trolley = box(0.7, 0.9, 0.5, C.cream); trolley.position.set(3.4, 0.45, 3); L.add(trolley); for (let i = 0; i < 3; i++) { const srv = box(0.6, 1.2, 0.6, 0x1f2a26); srv.position.set(-3.6 + i * 0.8, 0.6, -10); L.add(srv); } }
    if (f === 11) { const carpet = box(2 * HALF_X - 0.6, 0.02, 28, 0x7a5a3a); carpet.position.set(0, 0.02, 0); L.add(carpet); counter(-3.6, 12.2, 2.8); plant(4.8, 14); plant(4.8, -10); const table = box(1.6, 0.6, 4, C.deskDark); table.position.set(2.4, 0.3, -4); L.add(table); }
    if (f === 12) { const table = box(2, 0.7, 7, C.deskDark); table.position.set(0, 0.35, -4); L.add(table); for (let z = -7; z <= -1; z += 1.5) for (const x of [-1.5, 1.5]) { const ch = box(0.5, 0.5, 0.5, C.desk); ch.position.set(x, 0.25, z); L.add(ch); } }
    if (![1, 2, 3, 4, 7, 11, 12].includes(f)) { cluster(2.2, -10); cluster(2.2, 2); cluster(2.2, 12); plant(-4.8, 14); }
  }

  _buildNpcs() {
    for (const c of Object.values(CHARACTERS)) {
      if (c.hidden) continue;
      const room = WORLD.rooms.find(r => r.id === c.loc.room);
      const z = c.loc.x != null ? pxToZ(c.loc.x) : SLOT_Z[room ? room.slot : 1];
      const side = c.loc.side === "east" ? 1 : -1;
      const g = makePerson(TRAITS[c.id] || TRAITS.ambient); g.position.set(4.3 * side, 0, z); g.rotation.y = -side * Math.PI / 2; g.userData.id = c.id; g.userData.home = g.rotation.y;
      g.traverse(o => { o.userData.npcId = c.id; });
      this.scene.add(g);
      const label = document.createElement("div"); label.className = `npc-label ${c.npc ? "minor" : ""}`; label.dataset.id = c.id;
      label.innerHTML = `<b>${c.name}</b><span>${c.role}</span><i><u style="width:0%"></u></i>`;
      this.labelsEl.appendChild(label);
      const bubble = document.createElement("div"); bubble.className = "bubble hidden"; this.labelsEl.appendChild(bubble);
      this.npcs.set(c.id, { id: c.id, name: c.name, floor: room ? room.floor : 1, z, group: g, label, bubble, data: c });
    }
    const gb = document.createElement("div"); gb.className = "bubble me hidden"; this.labelsEl.appendChild(gb); this.ghostBubble = gb;
    const gt = document.createElement("div"); gt.className = "npc-label me"; gt.innerHTML = `<b>GHOST</b>`; this.labelsEl.appendChild(gt); this.ghostTag = gt;
    for (let i = 0; i < 2; i++) { const a = makePerson(TRAITS.ambient); a.userData.z0 = -10 + i * 14; a.userData.dirz = i ? -1 : 1; a.position.set(0.9, 0, a.userData.z0); this.scene.add(a); this.ambient.push(a); }
    this._refreshNpcVisibility();
  }
  _refreshNpcVisibility() { for (const n of this.npcs.values()) { const on = n.floor === this.floor; n.group.visible = on; n.label.classList.toggle("hidden", !on); if (!on) n.bubble.classList.add("hidden"); } }

  setKnown(set) { this.known = new Set(set); this._buildLevel(); }
  setSuspicion(id, pct, state) { const n = this.npcs.get(id); if (!n) return; n.label.querySelector("u").style.width = pct + "%"; n.label.dataset.state = state; setExpression(n.group, state); }
  setGhostExpression(state) { setExpression(this.player, state); }
  bubble(id, text) {
    const el = id === "ghost" ? this.ghostBubble : (this.npcs.get(id) || {}).bubble; if (!el) return;
    el.textContent = text; el.classList.remove("hidden");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), Math.min(12000, 2500 + text.length * 60));
  }

  // ---------- input ----------
  _bindInput() {
    window.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || ""; if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!this.enabled || this.dead) return;
      const k = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s", "e", "enter", " "].includes(k)) e.preventDefault();
      if (this.moving && ["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) this._cancelAuto();
      this.keys[k] = true;
      if ((k === "e" || k === "enter") && this.nearId && !this.moving) this.hooks.onTalk && this.hooks.onTalk(this.nearId);
      if (this._atLift()) {
        if ((k === "arrowup" || k === "w") && !this.moving && !this._liftBusy) this._ride(Math.min(12, this.floor + 1));
        if ((k === "arrowdown" || k === "s") && !this.moving && !this._liftBusy) this._ride(Math.max(1, this.floor - 1));
      }
    });
    window.addEventListener("keyup", (e) => { this.keys[e.key.toLowerCase()] = false; });
    this.canvas.addEventListener("wheel", (e) => { e.preventDefault(); this.zoomTarget = Math.max(0.7, Math.min(2.6, this.zoomTarget * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });
    this.canvas.addEventListener("pointerdown", (e) => { this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
    this.canvas.addEventListener("pointermove", (e) => { if (!this.drag) return; this.drag.moved += Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y); });
    this.canvas.addEventListener("pointerup", (e) => {
      const d = this.drag; this.drag = null; if (!d || d.moved > 8 || !this.enabled) return;
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      const hits = this.ray.intersectObjects([...this.npcs.values()].filter(n => n.group.visible).map(n => n.group), true);
      if (hits.length) { const id = hits[0].object.userData.npcId; this.goToPerson(id).then(() => { if (this.isNear(id)) this.hooks.onTalk && this.hooks.onTalk(id); }); return; }
      const doorHits = this.ray.intersectObjects(this.level.children.filter(o => o.userData.room !== undefined), false);
      if (doorHits.length) { const p = doorHits[0].object.position; this.goTo(this.floor, WEST_X + 1.2, p.z); return; }
      const pt = new THREE.Vector3(); if (this.ray.ray.intersectPlane(this.floorPlane, pt)) this.goTo(this.floor, pt.x, pt.z);
    });
  }
  _atLift() { const p = this.player.position; return p.z > LIFT_Z - 1.3 && Math.abs(p.x) < 1.4; }

  // ---------- movement ----------
  personPos(id) { const n = this.npcs.get(id); return n ? { floor: n.floor, x: zToPx(n.z), z: n.z } : null; }
  isNear(id) { const n = this.npcs.get(id); if (!n || n.floor !== this.floor) return false; return this.player.position.distanceTo(n.group.position) < 2.6; }
  get p() { return { x: zToPx(this.player.position.z), z: this.player.position.z }; }
  goToPerson(id) { const n = this.npcs.get(id); if (!n) return Promise.resolve(); return this.goTo(n.floor, n.group.position.x - Math.sign(n.group.position.x || -1) * 1.5, n.z); }
  goTo(floor, x, z) {
    x = Math.max(-HALF_X + 0.3, Math.min(HALF_X - 0.3, x)); z = Math.max(Z_MIN, Math.min(Z_MAX, z));
    this._cancelAuto();
    return new Promise((resolve) => {
      const steps = [];
      if (floor !== this.floor) { steps.push({ type: "walk", x: 0, z: LIFT_Z }); steps.push({ type: "lift", floor }); }
      steps.push({ type: "walk", x, z });
      const f0 = this.floor, z0 = this.player.position.z;
      this.moving = { steps, done: () => { this.moving = null; this._cost(f0, z0, floor, z); resolve(true); }, cancel: () => { this.moving = null; resolve(false); } };
    });
  }
  _cancelAuto() { if (this.moving) this.moving.cancel(); }
  _cost(f0, z0, f1, z1) {
    const dist = f1 !== f0 ? Math.abs(LIFT_Z - z0) + Math.abs(LIFT_Z - z1) : Math.abs(z1 - z0);
    const mins = Math.abs(f1 - f0) + Math.ceil(dist / 14);
    if (mins > 0) this.hooks.onCost && this.hooks.onCost(mins);
  }
  async _ride(toFloor) {
    if (toFloor === this.floor) return;
    this._liftBusy = true;
    await this._fade(1, 220);
    const f0 = this.floor; this.floor = toFloor; this._buildLevel(); this._refreshNpcVisibility();
    this.player.position.set(0, 0, LIFT_Z); this.player.rotation.y = Math.PI;
    await new Promise(r => setTimeout(r, 160 + Math.abs(toFloor - f0) * 90));
    await this._fade(0, 260);
    this._liftBusy = false;
    this.visited.add(toFloor);
    this.hooks.onFloor && this.hooks.onFloor(toFloor);
    if (!this.moving) this.hooks.onCost && this.hooks.onCost(Math.abs(toFloor - f0));
  }
  _fade(to, ms) { return new Promise(r => { this.fadeEl.style.transition = `opacity ${ms}ms`; this.fadeEl.style.opacity = to; setTimeout(r, ms + 10); }); }

  _step(dt) {
    const p = this.player.position; let moved = false; let mx = 0, mz = 0;
    if (this.moving && !this._liftBusy) {
      const s = this.moving.steps[0];
      if (!s) { this.moving.done(); }
      else if (s.type === "walk") {
        const dx = s.x - p.x, dz = s.z - p.z; const d = Math.hypot(dx, dz);
        if (d < 0.08) { this.moving.steps.shift(); if (!this.moving.steps.length) this.moving.done(); }
        else { mx = dx / d; mz = dz / d; const mv = Math.min(d, SPEED * dt); p.x += mx * mv; p.z += mz * mv; moved = true; }
      } else if (s.type === "lift") { const m = this.moving; m.steps.shift(); this._ride(s.floor).then(() => { if (this.moving === m && !m.steps.length) m.done(); }); }
    } else if (this.enabled && !this.focusMode) {
      const fwd = new THREE.Vector3(-ISO_DIR.x, 0, -ISO_DIR.z).normalize(); const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const v = new THREE.Vector3();
      if (this.keys["w"] || this.keys["arrowup"]) v.add(fwd); if (this.keys["s"] || this.keys["arrowdown"]) v.sub(fwd);
      if (this.keys["d"] || this.keys["arrowright"]) v.add(right); if (this.keys["a"] || this.keys["arrowleft"]) v.sub(right);
      if (v.lengthSq() > 0) { v.normalize(); mx = v.x; mz = v.z; p.x += v.x * SPEED * dt; p.z += v.z * SPEED * dt; moved = true; this.walkCost += SPEED * dt; if (this.walkCost > 14) { this.walkCost = 0; this.hooks.onCost && this.hooks.onCost(1); } }
    }
    const inLiftX = Math.abs(p.x) < 1.4;
    p.x = Math.max(-HALF_X + 0.3, Math.min(HALF_X - 0.3, p.x));
    p.z = Math.max(Z_MIN, Math.min(inLiftX ? Z_MAX : LIFT_Z - 1.4, p.z));
    if (moved) { const target = Math.atan2(mx, mz); this.player.rotation.y = lerpAngle(this.player.rotation.y, target, TURN_LERP); this.dir.set(mx, 0, mz); }
    animatePerson(this.player, dt, moved, this.focusMode === "phone");
    return moved;
  }

  _updateCamera() {
    const p = this.player.position; let target = p.clone(); let zt = 1;
    if (this.focusMode === "npc" && this.npcs.get(this.focusId)) {
      const n = this.npcs.get(this.focusId); const npos = n.group.position;
      target = p.clone().add(npos).multiplyScalar(0.5); zt = 2.2;
      const dir = new THREE.Vector3().subVectors(npos, p).setY(0).normalize();
      this.player.rotation.y = lerpAngle(this.player.rotation.y, Math.atan2(dir.x, dir.z), 0.15);
      n.group.rotation.y = lerpAngle(n.group.rotation.y, Math.atan2(-dir.x, -dir.z), 0.15);
    } else if (this.focusMode === "phone") { zt = 2.4; }
    else { zt = this.zoomTarget; }
    this.zoom += (zt - this.zoom) * 0.08;
    this.lookAt.lerp(target.setY(0.6), 0.1);
    const camPos = this.lookAt.clone().addScaledVector(ISO_DIR, 40);
    const shake = this.stress * 0.06;
    this.camera.position.set(camPos.x + (Math.random() - 0.5) * shake, camPos.y + (Math.random() - 0.5) * shake, camPos.z);
    this.camera.lookAt(this.lookAt);
    this._frustum();
    this.key.position.set(this.lookAt.x - 12, 22, this.lookAt.z + 8); this.key.target.position.copy(this.lookAt); this.key.target.updateMatrixWorld();
  }
  _frustum() {
    const h = 9 / this.zoom, a = this.aspect || 1.6;
    this.camera.left = -h * a; this.camera.right = h * a; this.camera.top = h; this.camera.bottom = -h; this.camera.updateProjectionMatrix();
  }

  focus(id) { this.focusId = id; this.focusMode = id ? "npc" : "phone"; this.keys = {}; this._cancelAuto(); }
  unfocus() { this.focusId = null; this.focusMode = null; for (const n of this.npcs.values()) n.bubble.classList.add("hidden"); this.ghostBubble.classList.add("hidden"); }

  _checkNear() {
    let near = null, best = 2.6;
    for (const n of this.npcs.values()) { if (n.floor !== this.floor) continue; const d = this.player.position.distanceTo(n.group.position); if (d < best) { best = d; near = n; } }
    const id = near ? near.id : null;
    if (id !== this.nearId) { this.nearId = id; this.hooks.onNear && this.hooks.onNear(id, near ? near.name : null); }
    const show = near && !this.moving && !this.focusMode;
    this.promptEl.classList.toggle("hidden", !show);
    if (show) this.promptEl.textContent = `E · talk to ${near.name}`;
    if (!this.focusMode) for (const n of this.npcs.values()) if (n.group.visible) { const want = n.id === id ? Math.atan2(this.player.position.x - n.group.position.x, this.player.position.z - n.group.position.z) : (n.group.userData.home ?? Math.PI / 2); n.group.rotation.y = lerpAngle(n.group.rotation.y, want, 0.05); }
  }

  _project(pos, out) { const r = this.canvas.getBoundingClientRect(); const v = pos.clone().project(this.camera); out.x = (v.x + 1) / 2 * r.width; out.y = (1 - v.y) / 2 * r.height; out.ok = v.z < 1; return out; }
  _updateLabels() {
    const o = {};
    for (const n of this.npcs.values()) {
      if (!n.group.visible) continue;
      const g = n.group.position;
      this._project(new THREE.Vector3(g.x, 2.05, g.z), o);
      n.label.style.transform = `translate(-50%, -100%) translate(${o.x}px, ${o.y}px)`; n.label.style.opacity = o.ok ? 1 : 0;
      if (!n.bubble.classList.contains("hidden")) { this._project(new THREE.Vector3(g.x, 2.5, g.z), o); n.bubble.style.transform = `translate(-50%, -100%) translate(${o.x}px, ${o.y - 34}px)`; }
    }
    const p = this.player.position;
    this._project(new THREE.Vector3(p.x, 0.1, p.z), o); this.ghostTag.style.transform = `translate(-50%, 0) translate(${o.x}px, ${o.y + 6}px)`;
    if (!this.ghostBubble.classList.contains("hidden")) { this._project(new THREE.Vector3(p.x, 2.3, p.z), o); this.ghostBubble.style.transform = `translate(-50%, -100%) translate(${o.x}px, ${o.y}px)`; }
  }

  _drawMinimap() {
    const c = this.minimap; if (!c) return; const g = c.getContext("2d"); const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H); g.fillStyle = "rgba(239,230,207,.94)"; g.fillRect(0, 0, W, H);
    const sx = (x) => W / 2 + x * 8, sz = (z) => H / 2 + z * 4.2;
    g.fillStyle = "#8fae9a"; g.fillRect(sx(-HALF_X), sz(Z_MIN), (2 * HALF_X) * 8, (Z_MAX - Z_MIN) * 4.2);
    g.fillStyle = "#6b8a76"; g.fillRect(sx(-1.4), sz(LIFT_Z - 1.2), 2.8 * 8, 2.4 * 4.2);
    for (let s = 0; s < 3; s++) { const room = WORLD.rooms.find(r => r.floor === this.floor && r.slot === s); g.fillStyle = room ? (this.known.has(room.id) ? (room.target ? "#e9b64f" : "#3e5a4c") : "#a3b5a8") : "#b7cbb9"; g.fillRect(sx(WEST_X) - 14, sz(SLOT_Z[s]) - 8, 14, 16); }
    for (const n of this.npcs.values()) { if (n.floor !== this.floor) continue; g.fillStyle = n.data.npc ? "#7a8a80" : "#1f2a26"; g.beginPath(); g.arc(sx(n.group.position.x), sz(n.z), 3, 0, Math.PI * 2); g.fill(); }
    const p = this.player.position; g.save(); g.translate(sx(p.x), sz(p.z)); g.rotate(-this.player.rotation.y + Math.PI); g.fillStyle = "#c84b3c"; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
    g.fillStyle = "#1f2a26"; g.font = "bold 11px Rajdhani, sans-serif"; g.fillText(this.floor === 1 ? "G" : "F" + this.floor, 6, 14);
  }

  _ambientStep(dt) {
    for (const a of this.ambient) { a.position.z += a.userData.dirz * 1.1 * dt; if (a.position.z > 15 || a.position.z < -16) a.userData.dirz *= -1; a.rotation.y = a.userData.dirz > 0 ? 0 : Math.PI; animatePerson(a, dt, true); }
  }

  _loop(t) {
    if (this.dead) return;
    const dt = Math.min(0.05, (t - this.clockT) / 1000 || 0); this.clockT = t;
    const moved = this._step(dt);
    this._checkNear();
    this._updateCamera();
    this._ambientStep(dt);
    for (const n of this.npcs.values()) if (n.group.visible) animatePerson(n.group, dt, false);
    this.renderer.render(this.scene, this.camera);
    this._updateLabels(); this._drawMinimap();
    if (this.hooks.onPosition) this.hooks.onPosition(this.floor, zToPx(this.player.position.z), this._atLift());
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const r = this.el.getBoundingClientRect(); const w = Math.max(320, r.width), h = Math.max(240, r.height);
    this.renderer.setSize(w, h, false); this.aspect = w / h; this._frustum();
  }
  setEnabled(on) { this.enabled = on; if (!on) this.keys = {}; this.el.classList.toggle("disabled", !on); }
}

function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

