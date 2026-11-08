// HUD, contacts, feed, toast, report rendering.
import { CHARACTERS, stateWord, LANG_LABEL } from "./characters.js";
import { escapeHtml } from "./scene.js";

const OBJECTIVES = [
  { id: "lobby", floor: 1, where: "Ground · Lobby", who: "Priya Nair, reception", what: "Get Priya to log you as a visitor. She prints your visitor pass.",
    weak: "Authority. Name someone senior from the org chart with confidence: \"I'm here for Dev Reddy in IT\" or \"Anita Rao is expecting me\".",
    strong: "She remembers faces and stories. The name and company you give her are locked in for the whole day.",
    how: "Decide your name and company before you walk up. Say them first. Give a callback number without pausing. Look at the camera.", done: (s) => s.visitorLog.length > 0 },
  { id: "desk", floor: 2, where: "Floor 2 · Keycard desk", who: "Ramesh Goud, security · Telugu only", what: "Collect the keycard.",
    weak: "Sympathy, and any effort to speak Telugu. Try \"namaskaram\" or \"koncham help cheyandi\". Sound like a person having a long day, not a salesman.",
    strong: "The visitor log and the authorisation list. He never bends. Same name, same spelling, on both.",
    how: "Show your visitor pass, that's his ID check. Only come here after Dev or Anita has authorised you.", done: (s) => s.keycardObtained },
  { id: "fac", floor: 3, where: "Floor 3 · Facilities", who: "K. Kulkarni, facilities · Telugu-English", what: "Let Kulkarni talk.",
    weak: "Anyone who asks about him instead of the building. His daughter in Melbourne, the AC, the sambar. Accept the chai.",
    strong: "None. He is the leak.",
    how: "Just listen. He'll tell you Rajan is in Singapore, where the server room is, the desk hours. Stay four or five turns and he lets slip something about your Handler. Never ask about access directly.", done: (s) => s.secretRevealed || s.facts.filter(f => f.from === "Mr. Kulkarni").length >= 2 },
  { id: "it", floor: 4, where: "Floor 4 · IT helpdesk", who: "Dev Reddy, IT lead · Kavya, intern (corridor)", what: "Get Dev to authorise a keycard under your name.",
    weak: "Urgency plus jargon. \"P1 access ticket MT-48213, SecureGate vendor, visitor keycard pickup on 2.\" Say it like you've said it a hundred times.",
    strong: "Procedure. He wants a ticket starting with MT- and checks it. Mumble or say \"um\" and he stalls.",
    how: "Kavya tells you the ticket format if you sound senior, but she may mention you to Dev. Either Dev or Anita can authorise. You need one, not both.", done: (s) => s.authorized.length > 0 },
  { id: "server", floor: 7, where: "Floor 7 · Corridor", who: "Lakshmi, housekeeping · Telugu only", what: "Optional intel.",
    weak: "Politeness and respect. Greet her properly, ask if you're in her way.",
    strong: "None, but she's wary of strangers on this floor.",
    how: "She knows the red door and who goes through it, and about the \"audit man\" who took photos.", done: (s) => s.talked.has("lakshmi") },
  { id: "cfo", floor: 11, where: "Floor 11 · CFO suite", who: "Anita Rao, EA to the CFO", what: "Other route: Anita authorises on the CFO's behalf.",
    weak: "The calendar. \"I know Rajan's in Singapore till Friday, I'm coordinating with you in his absence.\" Only after Kulkarni or Priya told you that.",
    strong: "She reads faces better than anyone. Any nervousness on camera and she probes.",
    how: "Hold eye contact with the camera. Speak slowly. Don't smile at odd moments.", done: (s) => s.authorized.length > 0 },
  { id: "phone", floor: 0, where: "Your phone · any time", who: "Meera Iyer, security lead. She calls you.", what: "Survive the call.",
    weak: "Consistency. If your story matches everything you said all day, she lets you go with a warning.",
    strong: "Any contradiction, long pause, or aggression ends the run.",
    how: "Invent nothing new on that call. Repeat your name, company, and who you're here for, in the same words you used with Priya.", done: (s) => s.meeraDone },
  { id: "always", floor: 0, where: "Always", who: "", what: "One name, one company, one reason, all day.",
    weak: "", strong: "",
    how: "Never say \"audit firm\", the building remembers the last one. Silence is a tell, answer within a second. Walking and lifts cost minutes.", done: () => false },
];

export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.clockEl = $("clock"); this.dayFill = $("dayFill"); this.contacts = $("contacts"); this.feed = $("feed");
    this.ratingChip = $("ratingChip"); this.hint = $("hint"); this.toastEl = $("toast"); this.mapCount = $("mapCount");
    this.hangupBtn = $("hangupBtn"); this.muteBtn = $("muteBtn"); this.doubleCrossBtn = $("doubleCrossBtn");
    this.onCall = null; this._toastTimer = null;
  }
  show(screen) { document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === screen)); }
  setClock(minutes) { // minutes since 00:00
    const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
    const h12 = ((h + 11) % 12) + 1;
    this.clockEl.textContent = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    this.clockEl.nextElementSibling.textContent = h >= 12 ? "PM" : "AM";
    this.dayFill.style.width = `${Math.max(0, Math.min(100, ((minutes - 540) / 540) * 100))}%`;
  }
  renderContacts(state, busy) {
    this.contacts.innerHTML = "";
    const groups = [["Staff", ["priya", "ramesh", "dev", "anita", "kulkarni"]], ["Others", ["kavya", "lakshmi"]]];
    for (const [title, ids] of groups) {
      const g = document.createElement("div"); g.className = "group"; g.textContent = title; this.contacts.appendChild(g);
      for (const id of ids) {
        const ch = CHARACTERS[id]; const s = state.characters[id];
        const div = document.createElement("div"); div.className = "contact" + (busy ? " locked" : "") + (ch.npc ? " minor" : "");
        const heard = s.heard.length ? `<div class="heard">has heard: ${escapeHtml(s.heard[s.heard.length - 1])}</div>` : "";
        const lang = ch.lang && ch.lang !== "en" ? `<span class="lang">${LANG_LABEL[ch.lang]}</span>` : "";
        div.innerHTML = `<div class="top"><div><b>${ch.name}</b>${lang}<small>${ch.role} · ${ch.loc.label}</small></div><small>${stateWord(s.suspicion)}</small></div>
          <div class="bar"><i style="width:${s.suspicion}%"></i></div>
          <div class="btns"><button data-id="${id}" ${busy ? "disabled" : ""}>Walk there and talk</button></div>${heard}`;
        div.querySelectorAll("button").forEach(b => b.addEventListener("click", () => this.onCall && this.onCall(b.dataset.id)));
        this.contacts.appendChild(div);
      }
    }
  }
  renderObjectives(state, floor) {
    const chart = `<div class="orgchart"><div class="where">Org chart · from the Handler</div>
      <table><tr><td>Rajan Mehta</td><td>CFO, Meridian Capital</td><td>Floor 11 · in Singapore till Friday</td></tr>
      <tr><td>Anita Rao</td><td>Executive Assistant to the CFO</td><td>Floor 11</td></tr>
      <tr><td>Meera Iyer</td><td>Security Lead</td><td>Floor 2 · never approach</td></tr>
      <tr><td>Dev Reddy</td><td>IT Helpdesk Lead</td><td>Floor 4</td></tr>
      <tr><td>K. Kulkarni</td><td>Facilities Manager</td><td>Floor 3</td></tr>
      <tr><td>Ramesh Goud</td><td>Security, Keycard Desk</td><td>Floor 2</td></tr>
      <tr><td>Priya Nair</td><td>Reception</td><td>Ground</td></tr></table>
      <div class="how">Access vendor: SecureGate Systems. IT tickets look like MT-48213.</div></div>`;
    const html = chart + OBJECTIVES.map(o => `<div class="obj${o.done(state) ? " done" : ""}${o.floor === floor ? " here" : ""}">
      <div class="where">${o.where}${o.floor === floor ? " · you are here" : ""}</div>
      ${o.who ? `<div class="who-line">${escapeHtml(o.who)}</div>` : ""}
      <div class="what">${escapeHtml(o.what)}</div>
      ${o.weak ? `<div class="ws"><b>Weakness</b> ${escapeHtml(o.weak)}</div>` : ""}
      ${o.strong ? `<div class="ws"><b>Watch out</b> ${escapeHtml(o.strong)}</div>` : ""}
      <div class="how"><b>The move</b> ${escapeHtml(o.how)}</div></div>`).join("");
    const el = this.$("objectives"); if (el) el.innerHTML = html;
    const h = this.$("hudObjList"); if (h) h.innerHTML = html;
  }
  toggleObjectives(force) { const el = this.$("hudObj"); const show = force != null ? force : el.classList.contains("hidden"); el.classList.toggle("hidden", !show); return show; }
  setWalkStatus(text) { const el = this.$("walkStatus"); if (el.textContent !== text) el.textContent = text; }
  setTalking(on) { document.querySelector(".scene-wrap").classList.toggle("talking", on); }
  log(kind, text) {
    const d = document.createElement("div"); d.className = `ev ${kind}`; d.textContent = text;
    this.feed.appendChild(d); this.feed.scrollTop = this.feed.scrollHeight;
    while (this.feed.children.length > 120) this.feed.removeChild(this.feed.firstChild);
    const hl = this.$("hudLog");
    if (hl) { const e = d.cloneNode(true); hl.appendChild(e); while (hl.children.length > 5) hl.removeChild(hl.firstChild); setTimeout(() => { if (e.parentNode) e.style.opacity = "0.35"; }, 12000); }
  }
  toast(text, ms = 2600) {
    this.toastEl.textContent = text; this.toastEl.classList.remove("hidden");
    clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => this.toastEl.classList.add("hidden"), ms);
  }
  setRating(text) { this.ratingChip.textContent = `Ghost · ${text}`; }
  setHint(text) { this.hint.textContent = text; }
  setCallControls(active) { this.hangupBtn.disabled = !active; this.muteBtn.disabled = !active; }
  setMapCount(n) { this.mapCount.textContent = `${n} room${n === 1 ? "" : "s"} known`; }

  renderReport(r) {
    const $ = this.$;
    $("endingTitle").textContent = r.ending.title;
    $("endingLine").textContent = r.ending.line;
    $("finalRating").textContent = `Ghost · ${r.rating}`;
    $("rTimeline").innerHTML = r.timeline.map(t => `<li><b>${t.clock}</b> ${escapeHtml(t.text)}</li>`).join("") || "<li>No calls made.</li>";
    $("rTells").innerHTML = r.tells.length ? r.tells.map(t => `<div class="rt"><b>${escapeHtml(t.who)}</b> · +${t.delta} at ${t.clock}<br/>${escapeHtml(t.text)}</div>`).join("") : "<p>Nobody stopped believing you. Suspicious in itself.</p>";
    $("rLedger").innerHTML = r.ledger.map(l => `<li${l.contradicted ? ' style="color:#ffb3b3"' : ""}>${escapeHtml(l.claim)} <small>→ ${escapeHtml(l.to)}</small>${l.contradicted ? " · contradicted" : ""}</li>`).join("") || "<li>You claimed nothing checkable. Bold.</li>";
    $("rGossip").innerHTML = r.gossip.map(g => `<li>${escapeHtml(g)}</li>`).join("") || "<li>Nothing travelled. Either you were quick, or nobody cared.</li>";
    $("rCurves").innerHTML = Object.entries(r.curves).map(([id, pts]) => {
      const ch = CHARACTERS[id]; if (!pts.length) return "";
      const w = 300, h = 40; const step = pts.length > 1 ? w / (pts.length - 1) : w;
      const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`).join(" ");
      return `<div class="curve"><div class="lbl">${ch.name} · peak ${Math.max(...pts)}</div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#c8ccd2" stroke-width="2"/><line x1="0" y1="${h * 0.3}" x2="${w}" y2="${h * 0.3}" stroke="#f40009" stroke-dasharray="3 3" stroke-width="1"/></svg></div>`;
    }).join("") || "<p>No calls, no curves.</p>";
  }
}





