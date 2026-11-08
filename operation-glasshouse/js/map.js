// SVG tower map. Rooms light up as facts are learned.
import { WORLD } from "./characters.js";

const NS = "http://www.w3.org/2000/svg";
const W = 200, H = 420, FLOORS = 12, PAD = 14, FLOOR_H = (H - PAD * 2) / FLOORS;

export class TowerMap {
  constructor(container) {
    this.el = container; this.known = new Set(); this.miss = new Set(); this.route = [];
    this.render();
  }
  _svg(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  render() {
    this.el.innerHTML = "";
    const svg = this._svg("svg", { viewBox: `0 0 ${W} ${H}` });
    // outline
    svg.appendChild(this._svg("rect", { x: PAD, y: PAD, width: W - PAD * 2, height: H - PAD * 2, rx: 4, class: "floor-rect" }));
    // spire
    svg.appendChild(this._svg("path", { d: `M${W / 2 - 14},${PAD} L${W / 2},${2} L${W / 2 + 14},${PAD}`, class: "floor-rect" }));
    for (let f = 1; f <= FLOORS; f++) {
      const y = H - PAD - f * FLOOR_H;
      svg.appendChild(this._svg("line", { x1: PAD, y1: y, x2: W - PAD, y2: y, stroke: "#222226", "stroke-width": 1 }));
      const num = this._svg("text", { x: PAD + 4, y: y + FLOOR_H - 4, class: "floor-num" }); num.textContent = f; svg.appendChild(num);
      for (let s = 0; s < 3; s++) {
        const room = WORLD.rooms.find(r => r.floor === f && r.slot === s);
        const rx = PAD + 16 + s * 56, rw = 52, ry = y + 4, rh = FLOOR_H - 8;
        const rect = this._svg("rect", { x: rx, y: ry, width: rw, height: rh, rx: 2, class: "room" });
        if (room) {
          rect.dataset.id = room.id;
          if (this.known.has(room.id)) rect.classList.add(room.target ? "target" : "known");
          if (this.miss.has(room.id)) rect.classList.add("miss");
          svg.appendChild(rect);
          if (this.known.has(room.id)) {
            const t = this._svg("text", { x: rx + 3, y: ry + rh / 2 + 2.5, class: "room-label" }); t.textContent = room.label; svg.appendChild(t);
          }
        } else svg.appendChild(rect);
      }
    }
    if (this.route.length > 1) {
      const pts = this.route.map(id => WORLD.rooms.find(r => r.id === id)).filter(Boolean).map(r => {
        const y = H - PAD - r.floor * FLOOR_H + FLOOR_H / 2; const x = PAD + 16 + r.slot * 56 + 26; return `${x},${y}`;
      });
      svg.appendChild(this._svg("polyline", { points: pts.join(" "), class: "route" }));
    }
    this.el.appendChild(svg);
  }
  reveal(roomId) {
    if (!WORLD.rooms.find(r => r.id === roomId) || this.known.has(roomId)) return false;
    this.known.add(roomId); this.render(); return true;
  }
  markMiss(roomId) { this.miss.add(roomId); this.render(); }
  setRoute(ids) { this.route = ids; this.render(); }
  get knownCount() { return this.known.size; }
  cloneInto(container) { const m = new TowerMap(container); m.known = new Set(this.known); m.miss = new Set(this.miss); m.route = [...this.route]; m.render(); return m; }
  static matchRoom(text) {
    const t = (text || "").toLowerCase();
    for (const r of WORLD.rooms) if (r.keywords.some(k => t.includes(k))) return r.id;
    return null;
  }
}

