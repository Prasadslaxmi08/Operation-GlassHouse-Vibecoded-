// HUD controller layered over the 3D world: contact card, story wall, phone, webcam PiP, captions, vignette,
// dialogue bar, cover panel, and 2D portraits generated from the same traits as the 3D people.
import { TRAITS } from "./world3d.js";

const hex = (n) => "#" + n.toString(16).padStart(6, "0");
export function portraitSvg(id) {
  const t = TRAITS[id] || TRAITS.ambient; const skin = hex(t.skin), hair = hex(t.hairColor), shirt = hex(t.shirt);
  const acc = t.acc || [];
  let hairSvg = "";
  if (t.hair === "short") hairSvg = `<path d="M30 40 Q50 18 70 40 L70 46 Q50 34 30 46 Z" fill="${hair}"/>`;
  if (t.hair === "messy") hairSvg = `<path d="M28 42 Q34 20 50 22 Q66 18 72 42 L72 48 Q50 30 28 48 Z" fill="${hair}"/><path d="M40 24 l4 -8 M52 20 l2 -8 M62 24 l5 -7" stroke="${hair}" stroke-width="3"/>`;
  if (t.hair === "long") hairSvg = `<path d="M26 44 Q50 14 74 44 L76 92 L64 92 L62 56 Q50 48 38 56 L36 92 L24 92 Z" fill="${hair}"/>`;
  if (t.hair === "bun") hairSvg = `<path d="M30 42 Q50 20 70 42 L70 48 Q50 36 30 48 Z" fill="${hair}"/><circle cx="50" cy="24" r="9" fill="${hair}"/>`;
  if (t.hair === "cap") hairSvg = `<path d="M28 42 Q50 16 72 42 Z" fill="${hair}"/><rect x="24" y="40" width="58" height="6" rx="2" fill="${hair}"/>`;
  if (t.hair === "bald") hairSvg = `<path d="M30 46 Q34 36 40 40 M70 46 Q66 36 60 40" stroke="${hair}" stroke-width="3" fill="none"/>`;
  const glasses = acc.includes("glasses") ? `<rect x="34" y="52" width="12" height="9" rx="2" fill="none" stroke="#0e0e10" stroke-width="2"/><rect x="54" y="52" width="12" height="9" rx="2" fill="none" stroke="#0e0e10" stroke-width="2"/><path d="M46 56 h8" stroke="#0e0e10" stroke-width="2"/>` : "";
  const mo = acc.includes("moustache") ? `<path d="M40 68 Q50 62 60 68 Q50 72 40 68 Z" fill="#2a1a10"/>` : "";
  const lan = acc.includes("lanyard") ? `<path d="M44 84 L50 100 L56 84" stroke="#f40009" stroke-width="2" fill="none"/>` : "";
  const apron = acc.includes("apron") ? `<rect x="36" y="86" width="28" height="14" fill="#f4f4f4"/>` : "";
  const sash = (acc.includes("sash") || acc.includes("saree")) ? `<path d="M30 100 L62 84 L70 90 L38 100 Z" fill="#e8e8ea"/>` : "";
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#dfe2e6"/>
    <path d="M18 100 Q50 72 82 100 Z" fill="${shirt}"/>${apron}${sash}${lan}
    <rect x="43" y="66" width="14" height="14" fill="${skin}"/>
    <ellipse cx="50" cy="52" rx="20" ry="24" fill="${skin}"/>
    <circle cx="42" cy="54" r="2.2" fill="#1a1a1e"/><circle cx="58" cy="54" r="2.2" fill="#1a1a1e"/>
    <path d="M44 64 Q50 68 56 64" stroke="#1a1a1e" stroke-width="1.5" fill="none"/>${mo}${glasses}${hairSvg}</svg>`;
}

export class Scene {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.hud = $("hud"); this.notes = $("notes"); this.monitorCall = $("monitorCall");
    this.ring = $("ring"); this.avatar = $("avatar"); this.whoName = $("whoName"); this.whoRole = $("whoRole");
    this.suspFill = $("suspFill"); this.whoState = $("whoState"); this.phone = $("phone"); this.phoneLabel = $("phoneLabel");
    this.phoneSub = $("phoneSub"); this.locLabel = $("locLabel"); this.vignette = $("vignette");
    this.pip = $("pip"); this.tells = $("tells"); this.captions = $("captions"); this.micFill = $("micFill");
    this.noteCount = 0; this._capTimer = null; this.state = "calm";
  }
  setLocation(locId, label) { this.locLabel.textContent = label; }
  setGhostState(state) { // calm | tense | sweating | caught
    this.state = state;
    this.vignette.className = `vignette ${state}`;
    window.dispatchEvent(new CustomEvent("ghoststate", { detail: state }));
  }
  ghostFromSuspicion(max) { this.setGhostState(max >= 85 ? "caught" : max >= 65 ? "sweating" : max >= 35 ? "tense" : "calm"); }
  showCall(ch, seen) {
    this.monitorCall.classList.add("hidden");
    this.avatar.textContent = ch.initial; this.whoName.textContent = ch.name;
    const isPhone = ch.id === "meera";
    this.currentId = isPhone ? null : ch.id;
    this.whoRole.textContent = ch.role + (isPhone ? " · on your phone" : seen ? " · sees you" : " · can't see you well");
    if (isPhone) { this.setLocation("phone", "Your phone · Meera"); this.setPhone("MEERA", "on call", "oncall"); }
    else this.setLocation(ch.loc.id, `Meridian Tower · ${ch.loc.label}`);
    const $ = (id) => document.getElementById(id);
    $("dialog").classList.remove("hidden");
    $("dlgPortrait").innerHTML = isPhone ? `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#1a1a1e"/><rect x="36" y="18" width="28" height="64" rx="6" fill="#f40009"/><rect x="40" y="26" width="20" height="44" fill="#dfe2e6"/></svg>` : portraitSvg(ch.id);
    $("dlgName").textContent = ch.name; $("dlgRole").textContent = this.whoRole.textContent;
    $("dlgLine").textContent = "…"; $("dlgSub").textContent = ""; $("dlgYou").textContent = ""; $("dlgText").value = "";
    $("dlgSpeaking").textContent = "● listening";
  }
  hideCall() {
    this.monitorCall.classList.add("hidden"); document.getElementById("dialog").classList.add("hidden");
    this.setPhone("no calls", "", ""); this.clearCaption(); this.setTells([]);
  }
  setSuspicion(v, state) {
    const pct = Math.max(0, Math.min(100, v));
    this.suspFill.style.width = pct + "%";
    this.ring.style.setProperty("--pct", pct);
    this.ring.style.setProperty("--ringcol", pct >= 70 ? "#f40009" : pct >= 40 ? "#ffffff" : "#c8ccd2");
    this.whoState.textContent = state; this.whoState.className = "state " + state;
    const f = document.getElementById("dlgMeterFill"), w = document.getElementById("dlgMeterWord");
    if (f) f.style.width = pct + "%";
    if (w) w.textContent = { cooperative: "at ease", stalling: "stalling", hostile: "hostile", escalated: "calling security" }[state] || state;
  }
  setCover(c) {
    const $ = (id) => document.getElementById(id);
    $("coverAvatar").innerHTML = portraitSvg("ghost");
    $("coverName").textContent = c.name || "Name unknown"; $("coverCo").textContent = c.company || (c.name ? "Visitor" : "No story on file");
    const st = $("coverStamp"); st.textContent = c.keycard ? "KEYCARD" : c.authorised ? "AUTHORISED" : c.logged ? "LOGGED" : "UNVERIFIED"; st.classList.toggle("ok", !!c.logged);
    $("ck1").classList.toggle("done", !!c.logged); $("ck2").classList.toggle("done", !!c.authorised); $("ck3").classList.toggle("done", !!c.keycard);
    if (c.brief) $("coverBrief").textContent = c.brief;
  }
  flashRing() { this.ring.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 350 }); }
  addNote(text, to, contradiction = false) {
    const n = document.createElement("div"); n.className = "note" + (contradiction ? " contradiction" : "");
    n.style.setProperty("--rot", `${((this.noteCount++ * 37) % 7) - 3}deg`);
    n.innerHTML = `${escapeHtml(text)}<span class="to">→ ${escapeHtml(to || "")}</span>`;
    this.notes.prepend(n);
    while (this.notes.children.length > 8) this.notes.removeChild(this.notes.lastChild);
    return n;
  }
  showPip(on) { this.pip.classList.toggle("hidden", !on); }
  setTells(list) { this.tells.innerHTML = list.map(t => `<span>${escapeHtml(t)}</span>`).join(""); }
  caption(who, text) {
    clearTimeout(this._capTimer);
    this.captions.innerHTML = `<small>${who === "you" ? "YOU" : escapeHtml(who).toUpperCase()}</small><div class="${who === "you" ? "you" : "them"}">${escapeHtml(text)}</div>`;
    this._capTimer = setTimeout(() => this.clearCaption(), 9000);
    const line = document.getElementById("dlgLine"), you = document.getElementById("dlgYou"), sp = document.getElementById("dlgSpeaking");
    if (who === "you") { if (you) you.textContent = text; if (sp) sp.textContent = "● listening"; window.dispatchEvent(new CustomEvent("npcline", { detail: { id: "ghost", text } })); }
    else { if (line) line.textContent = text; if (sp) sp.textContent = "● speaking"; const s = document.getElementById("dlgSub"); if (s) s.textContent = ""; if (this.currentId) window.dispatchEvent(new CustomEvent("npcline", { detail: { id: this.currentId, text } })); }
  }
  clearCaption() { this.captions.innerHTML = ""; this.subtitle(""); }
  subtitle(text) { const el = document.getElementById("subtitle"); if (el) el.textContent = text ? `EN · ${text}` : ""; const s = document.getElementById("dlgSub"); if (s) s.textContent = text ? `EN · ${text}` : ""; }
  setPhone(label, sub, mode) {
    this.phoneLabel.textContent = label; this.phoneSub.textContent = sub || "";
    this.phone.classList.toggle("ringing", mode === "ringing"); this.phone.classList.toggle("oncall", mode === "oncall");
  }
  ringPhone(on) { if (on) this.setPhone("MEERA", "incoming", "ringing"); else this.setPhone("no calls", "", ""); }
  micLevel(rms) { this.micFill.style.width = Math.min(100, rms * 600) + "%"; }
  setInventory(items) {
    const box = document.getElementById("inventory"), list = document.getElementById("invList");
    if (!box || !list) return;
    box.classList.toggle("hidden", !items.length);
    list.innerHTML = items.map(i => `<div class="inv-item ${i.kind}"><b>${escapeHtml(i.title)}</b>${escapeHtml(i.detail)}</div>`).join("");
  }
  resetNotes() { this.notes.innerHTML = ""; this.noteCount = 0; }
}

export function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }


