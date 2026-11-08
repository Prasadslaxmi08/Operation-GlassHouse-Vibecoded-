// Game state machine: clock, suspicion, ledger, gossip, calls, Meera, endings, preview script.
import { TUNING } from "./config.js";
import { Mic, Player } from "./audio.js";
import { LiveSession } from "./live.js";
import { FaceTracker } from "./vision.js";
import { CHARACTERS, GOSSIP, WORLD, buildSystemPrompt, stateWord, HANDLER_LINES } from "./characters.js";
import { judgeTurn, fakeVerdict, translateText } from "./judge.js";
import { TowerMap } from "./map.js";
import { World3D } from "./world3d.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FILLER = /\b(um+|uh+|er+|erm+|hmm+|like|you know|basically|actually)\b/gi;

export function fmtClock(min) {
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export class Game {
  constructor({ settings, scene, ui }) {
    this.settings = settings; this.scene = scene; this.ui = ui;
    this.mic = null; this.player = null; this.tracker = null; this.map = null;
    this.call = null; this.state = null; this.videoAvailable = false;
    this.onEnded = null;
  }

  // ---------- lifecycle ----------
  async start() {
    this.state = {
      clock: 9 * 60, characters: {}, ledger: [], facts: [], gossipLog: [], timeline: [], tells: [],
      visitorLog: [], authorized: [], keycardObtained: false, secretRevealed: false, inventory: [],
      meeraPending: false, meeraDone: false, ending: null, misses: new Set(), talked: new Set(), route: ["lobby"],
    };
    for (const id in CHARACTERS) this.state.characters[id] = { suspicion: 0, heard: [], claims: [], curve: [0], flagged: false };
    this.ui.show("mission");
    this.scene.resetNotes(); this.scene.setGhostState("calm"); this.scene.hideCall(); this.scene.ringPhone(false);
    this.scene.setLocation("lobby", "Meridian Tower · Lobby");
    this.ui.setTalking(false);
    this.map = new TowerMap(document.getElementById("map"));
    if (this.walk) { try { this.walk.setEnabled(false); } catch {} }
    this.walk = new World3D(document.getElementById("world"), {
      onTalk: (id) => this.callCharacter(id),
      onCost: (mins) => this._spend(mins, "walking"),
      onFloor: (f) => { this.ui.log("sys", `Floor ${f === 1 ? "G" : f}.`); this.ui.renderObjectives(this.state, f); },
      onNear: (id, name) => this.ui.setHint(id ? `Press E to talk to ${name}.` : "Walk to someone and press E, or click them."),
      onPosition: (floor, x, atLift) => this.ui.setWalkStatus(`${floor === 1 ? "Ground" : "Floor " + floor} · ${atLift ? "at the lift (W/S)" : this._placeName(floor, x)}`),
    });
    this._reveal("lobby");
    this.ui.setClock(this.state.clock); this.ui.setRating("Unrated");
    this.ui.renderContacts(this.state, false);
    this.ui.renderObjectives(this.state, 1);
    this.scene.setInventory([]); this._refreshPassButton(false); this._refreshCover();
    this.ui.onCall = (id) => this.callCharacter(id);
    this.ui.doubleCrossBtn.classList.add("hidden");

    this.player = new Player(); await this.player.resume();

    if (this.settings.previewMode) { this.ui.log("sys", "Preview mode: scripted demo, no API calls."); await this.runPreview(); return; }

    try {
      this.mic = new Mic(); await this.mic.start();
      this.mic.onLevel = (rms) => this.scene.micLevel(rms);
      this.ui.log("sys", "Mic live.");
    } catch (e) { this.ui.log("bad", "Mic permission denied. The game needs a microphone."); throw e; }

    if (this.settings.camOn) {
      try {
        this.tracker = new FaceTracker(document.getElementById("cam"));
        await this.tracker.start();
        this.videoAvailable = true;
        this.ui.log("sys", "Camera live. People will see your face while you talk.");
      } catch (e) { this.ui.log("warn", "Camera unavailable. People can't see you well and will start warier. " + (e.message || "")); }
    }
    await this.narrate(HANDLER_LINES.brief, "Charon", "The Handler");
    this.ui.setHint("Start with someone who talks. Say who you are before they ask. Look at the camera.");
  }

  _reveal(roomId) {
    if (!this.map.reveal(roomId)) return false;
    this.ui.setMapCount(this.map.knownCount);
    if (this.walk) this.walk.setKnown(this.map.known);
    this.ui.log("sys", `Map: ${WORLD.rooms.find(r => r.id === roomId).label} revealed.`);
    return true;
  }
  _placeName(floor, x) {
    const rooms = WORLD.rooms.filter(r => r.floor === floor && this.map.known.has(r.id));
    let best = null, bd = 1e9;
    for (const r of rooms) { const rx = [110, 330, 550][r.slot]; const d = Math.abs(rx - x); if (d < bd) { bd = d; best = r; } }
    return best && bd < 120 ? best.label : "corridor";
  }
  _spend(mins, why) {
    if (this.state.ending) return;
    this.state.clock += mins; this.ui.setClock(this.state.clock);
    if (this.state.clock >= 18 * 60 && !this.call) this.finish("clockout");
  }

  cleanup() {
    try { this.call && this.call.session && this.call.session.close(); } catch {}
    this.call = null;
    try { this.walk && this.walk.setEnabled(false); } catch {}
    try { this.mic && this.mic.stop(); } catch {}
    try { this.tracker && this.tracker.stop(); } catch {}
    try { this.player && this.player.interrupt(); } catch {}
  }

  get maxSuspicion() { return Math.max(...Object.values(this.state.characters).map(c => c.suspicion)); }

  // ---------- narration (Handler etc.) ----------
  async narrate(text, voice, who) {
    this.ui.log("them", `${who}: ${text}`);
    this.scene.caption(who, text);
    if (!this.settings.apiKey) return this.speakFallback(text);
    let gotAudio = false;
    try {
      await new Promise(async (resolve) => {
        let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
        const s = new LiveSession({
          apiKey: this.settings.apiKey, model: this.settings.liveModel, voice,
          systemInstruction: "You are a voice actor. Say exactly the line the user gives you, word for word, in a dry deadpan tone. Nothing else.",
          onAudio: (b64) => { gotAudio = true; this.player.enqueueB64(b64); },
          onTurnComplete: () => { this.player.onIdle = () => { this.player.onIdle = null; s.close(); finish(); }; if (!this.player.playing) { s.close(); finish(); } },
          onClose: () => finish(), onError: () => finish(),
        });
        try { await s.connect(); s.sendText(text); } catch { finish(); }
        setTimeout(finish, 25000);
      });
    } catch { /* fall through */ }
    if (!gotAudio) { this.ui.log("warn", "Live narration unavailable, using browser voice."); await this.speakFallback(text); }
  }
  speakFallback(text, pitch = 0.8, rate = 1) {
    return new Promise((res) => {
      if (!("speechSynthesis" in window)) return res();
      const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate; u.onend = res; u.onerror = res;
      speechSynthesis.speak(u);
    });
  }

  // ---------- calls ----------
  async callCharacter(id) {
    if (this.call || this.state.ending || this._walking) return;
    const ch = CHARACTERS[id]; const s = this.state.characters[id];
    const phone = id === "meera";
    if (!phone && this.walk) {
      if (!this.walk.isNear(id)) {
        this._walking = true; this.ui.setHint(`Walking to ${ch.name}…`); this.ui.renderContacts(this.state, true);
        await this.walk.goToPerson(id);
        this._walking = false;
        if (this.call || this.state.ending) return;
        if (!this.walk.isNear(id)) { this.ui.renderContacts(this.state, false); this.ui.setHint("Walk interrupted."); return; }
      }
      this.walk.setEnabled(false);
      this.walk.focus(id);
    } else if (this.walk) { this.walk.setEnabled(false); this.walk.focus(null); }
    const video = !phone && this.videoAvailable;
    const base = TUNING.audioBaseSuspicion[id];
    if (!phone && !video && base && s.suspicion < base) { s.suspicion = base; this.ui.log("warn", `${ch.name} can't see your face well. Starts warier.`); }
    if (!phone && ch.loc.room) {
      this._reveal(ch.loc.room);
      if (this.state.route[this.state.route.length - 1] !== ch.loc.room) { this.state.route.push(ch.loc.room); this.map.setRoute(this.state.route); }
    }
    this.ui.setTalking(true);

    const ctx = { suspicion: s.suspicion, heard: s.heard, priorClaims: s.claims, clockText: fmtClock(this.state.clock), video, mode: phone ? "phone" : "inperson", carrying: this.state.inventory.map(i => i.prompt) };
    const call = this.call = {
      ch, s, video, session: null, startedAt: performance.now(), turn: 0, youBuf: "", themBuf: "",
      lastModelTurnEndAt: performance.now(), userTurnStartAt: 0, userTurnOpen: false, firstAudioAt: 0,
      pendingVisual: null, closing: false, frameTimer: null, pendingMood: null, lastState: stateWord(s.suspicion),
      hesitation: 0, judging: false,
    };

    this.scene.showCall(ch, video); this.scene.setSuspicion(s.suspicion, stateWord(s.suspicion)); if (this.walk && !phone) this.walk.setSuspicion(ch.id, s.suspicion, stateWord(s.suspicion));
    this.ui.setCallControls(true); this.ui.renderContacts(this.state, true);
    this._refreshPassButton(true);
    this.ui.log("sys", phone ? "You answer the phone." : `You walk up to ${ch.name} at the ${ch.loc.label}.`);
    if (!phone) this.player.dialTone();

    const session = call.session = new LiveSession({
      apiKey: this.settings.apiKey, model: this.settings.liveModel, voice: ch.voice,
      systemInstruction: buildSystemPrompt(ch, ctx), tools: ch.tools,
      onAudio: (b64) => {
        this.player.enqueueB64(b64);
        if (call.userTurnOpen && !call.firstAudioAt) { call.firstAudioAt = performance.now(); this._closeUserTurn(call); }
      },
      onInputText: (t) => {
        if (!call.userTurnOpen) {
          call.userTurnOpen = true; call.userTurnStartAt = performance.now(); call.firstAudioAt = 0;
          call.hesitation = (call.userTurnStartAt - call.lastModelTurnEndAt) / 1000;
          if (call.video && this.tracker) this.tracker.beginWindow();
        }
        call.youBuf += t; this.scene.caption("you", call.youBuf);
      },
      onOutputText: (t) => { call.themBuf += t; this.scene.caption(ch.name, call.themBuf); },
      onTurnComplete: () => {
        call.lastModelTurnEndAt = performance.now();
        if (call.themBuf.trim()) {
          this.ui.log("them", `${ch.name}: ${call.themBuf.trim()}`);
          if (ch.lang && ch.lang !== "en") {
            const line = call.themBuf.trim();
            translateText({ apiKey: this.settings.apiKey, model: this.settings.flashModel, text: line })
              .then(en => { if (this.call === call && en) { this.scene.subtitle(en); this.ui.log("them", `  ↳ ${en}`); } })
              .catch(() => {});
          }
        }
        if (call.youBuf.trim()) { this.ui.log("you", `You: ${call.youBuf.trim()}`); this._judge(call, call.youBuf, call.themBuf); }
        call.youBuf = ""; call.themBuf = ""; call.userTurnOpen = false; call.turn++;
        if (call.pendingMood) { const m = call.pendingMood; call.pendingMood = null; this.player.onIdle = () => { this.player.onIdle = null; if (this.call === call && !call.closing) session.sendText(m); }; }
      },
      onInterrupted: () => { this.player.interrupt(); },
      onToolCall: (calls) => this._handleTools(call, calls),
      onClose: (reason) => { if (this.call === call && !call.closing) { this.ui.log("warn", `Line dropped (${reason}).`); this.endCall("line dropped"); } },
      onError: () => {},
    });

    try { await session.connect(); }
    catch (e) { this.ui.log("bad", `Could not connect: ${e.message}`); this.ui.toast("Live API connection failed. Check the key and model ID."); this.call = null; this.scene.hideCall(); this.ui.setCallControls(false); this.ui.renderContacts(this.state, false); this.ui.setTalking(false); if (this.walk) { this.walk.unfocus(); this.walk.setEnabled(true); } return; }

    this.mic.onChunk = (b64) => { if (this.call === call && !call.closing) session.sendAudio(b64); };
    if (video) {
      this.scene.showPip(true);
      this.tracker.onTells = (list) => this.scene.setTells(list);
      call.frameTimer = setInterval(() => { const f = this.tracker.captureJpegB64(); if (f && !call.closing) session.sendVideoFrame(f); }, 1000);
    }
    if (!phone) session.sendText("[The visitor has just walked up to you. Look up and greet them the way you would at work, in one short sentence, then wait for them to speak.]");
  }

  _closeUserTurn(call) {
    call.pendingVisual = call.video && this.tracker ? this.tracker.endWindow() : null;
  }

  async _judge(call, you, them) {
    const { ch, s } = call;
    const words = you.trim().split(/\s+/).filter(Boolean).length;
    const fillers = (you.match(FILLER) || []).length;
    const speaking = call.firstAudioAt ? (call.firstAudioAt - call.userTurnStartAt) / 1000 : 0;
    const audioMetrics = { hesitation_seconds: +call.hesitation.toFixed(1), words, filler_count: fillers, speaking_seconds: +speaking.toFixed(1) };
    const visualMetrics = call.video ? (call.pendingVisual || this.tracker.endWindow()) : null;
    let v;
    try {
      v = await judgeTurn({ apiKey: this.settings.apiKey, model: this.settings.flashModel, character: ch, transcriptYou: you, transcriptThem: them,
        audioMetrics, visualMetrics, priorClaims: s.claims, heard: s.heard, suspicion: s.suspicion });
    } catch (e) { this.ui.log("warn", `Referee error: ${e.message}`); return; }
    if (this.call !== call || call.closing) return;
    this.applyVerdict(call, v, !!visualMetrics);
  }

  applyVerdict(call, v, hadVideo) {
    const { ch, s } = call; const w = ch.weights;
    const combined = w.audio * (v.audio?.score || 0) + w.visual * (hadVideo ? (v.visual?.score || 0) : 0) + w.story * (v.story?.score || 0);
    let delta = TUNING.turnScale * combined - (v.relief || 0);
    if (combined < 0.15) delta -= TUNING.calmBonus;
    delta = Math.round(delta);
    const before = s.suspicion;
    s.suspicion = clamp(before + delta, 0, 100); s.curve.push(s.suspicion);
    const st = stateWord(s.suspicion);
    this.scene.setSuspicion(s.suspicion, st); if (delta >= 8) this.scene.flashRing();
    if (this.walk) { this.walk.setSuspicion(ch.id, s.suspicion, st); this.walk.setGhostExpression(this.maxSuspicion >= 65 ? "worried" : this.maxSuspicion >= 35 ? "stalling" : "cooperative"); }
    this.scene.ghostFromSuspicion(this.maxSuspicion);

    if (delta >= 10 && v.tell_summary && !/nothing notable/i.test(v.tell_summary)) {
      this.state.tells.push({ who: ch.name, delta, clock: fmtClock(this.state.clock), text: v.tell_summary });
      this.ui.log("warn", `Tell (+${delta}): ${v.tell_summary}`);
    } else if (delta < 0) this.ui.log("sys", `${ch.name} relaxes a little.`);

    for (const c of v.new_facts_claimed || []) {
      const contradicted = (v.story?.contradiction || 0) > 0.5;
      s.claims.push(c.claim); this.state.ledger.push({ claim: c.claim, to: ch.name, contradicted });
      this.scene.addNote(c.claim, ch.name, contradicted);
      if (contradicted) this.ui.log("bad", `Contradiction: "${c.claim}"`);
    }
    for (const f of v.new_facts_learned || []) {
      const room = f.room_id && WORLD.rooms.find(r => r.id === f.room_id) ? f.room_id : TowerMap.matchRoom(f.fact);
      this.state.facts.push({ fact: f.fact, from: ch.name });
      if (room) this._reveal(room);
    }
    this.ui.renderObjectives(this.state, this.walk ? this.walk.floor : 1);

    if (st !== call.lastState) {
      call.lastState = st;
      const mood = { stalling: "[Stage direction: you now feel something is off. Stall and ask one verifying question before helping with anything.]",
        hostile: "[Stage direction: you no longer believe this caller. Be curt and refuse to help. If they push once more, say goodbye and call end_call.]",
        escalated: "[Stage direction: you are certain this is a scam. Say you will inform security, say goodbye, and call end_call.]",
        cooperative: "[Stage direction: you are reassured. Be helpful again.]" }[st];
      if (call.session) { if (this.player.playing) call.pendingMood = mood; else call.session.sendText(mood); }
    }
    if (v.interrupt_now || s.suspicion >= TUNING.hostile + 10) {
      this.player.interrupt();
      if (call.session) call.session.sendText("[Stage direction: cut the visitor off right now mid-sentence, say one curt line, and call end_call.]");
      this.ui.log("bad", `${ch.name} is done with you.`);
      this.state.misses.add(ch.id);
    }
    if (v.escalate || s.suspicion >= TUNING.escalate) {
      if (!s.flagged) { s.flagged = true; this.state.meeraPending = true; this.ui.log("bad", `${ch.name} will report this call to security.`); }
    }
    const hot = Object.values(this.state.characters).filter(c => c.suspicion >= TUNING.globalEscalateAt).length;
    if (hot >= 2 && !this.state.meeraDone) this.state.meeraPending = true;
    this.ui.renderContacts(this.state, true);
  }

  _handleTools(call, calls) {
    const { ch, s, session } = call; const responses = [];
    for (const fc of calls) {
      const a = fc.args || {}; let result = { ok: true };
      switch (fc.name) {
        case "log_visitor": {
          const name = String(a.name || "").trim(), company = String(a.company || "").trim();
          this.state.visitorLog.push(name);
          this.ui.log("sys", `${ch.name} logged visitor "${name}"${company ? ` from ${company}` : ""}.`); this.scene.addNote(`Logged as ${name}`, ch.name);
          this._addItem({ kind: "card", title: "VISITOR PASS", detail: `${name}${company ? ` · ${company}` : ""} · issued by reception, ${fmtClock(this.state.clock)}`,
            prompt: `a Meridian Tower VISITOR PASS from reception, clipped to their shirt: name "${name}"${company ? `, company "${company}"` : ""}, issued today at ${fmtClock(this.state.clock)}. It is genuine.` });
          this.ui.toast(`Priya hands you a visitor pass: ${name}`);
          result = { ok: true, message: `Logged. You printed a visitor pass for ${name} and handed it over.` };
          break;
        }
        case "authorize_keycard": {
          const name = String(a.visitor_name || "").trim();
          this.state.authorized.push(name); this.ui.log("sys", `${ch.name} authorised a keycard for "${name}".`); this._reveal("keycard"); this.scene.addNote(`Keycard OK: ${name}`, ch.name);
          this._addItem({ kind: "key", title: "AUTHORISATION", detail: `Keycard for ${name} · approved by ${ch.name} · collect on floor 2`,
            prompt: `they mention an access authorisation entered by ${ch.name} (${ch.role}) for the name "${name}"; the keycard desk can see it in the system.` });
          result = { ok: true, message: `Authorised. The floor 2 desk can now issue a keycard to ${name}.` };
          break;
        }
        case "hand_over_keycard": {
          const n = String(a.visitor_name || "").trim().toLowerCase();
          const logged = this.state.visitorLog.some(x => x.toLowerCase() === n); const auth = this.state.authorized.some(x => x.toLowerCase() === n);
          if (logged && auth) { result = { ok: true, message: "Name is on the visitor log and the authorisation list. Hand the card over." }; this.state.keycardObtained = true; this.ui.log("sys", `Ramesh hands over the keycard for "${a.visitor_name}".`); this._refreshCover(); this._addItem({ kind: "key", title: "KEYCARD", detail: `Meridian Tower access card · ${a.visitor_name}`, prompt: `a Meridian Tower keycard.` }); }
          else { result = { ok: false, message: `Refuse. ${!logged ? "Name is not on today's visitor log." : ""} ${!auth ? "No authorisation from IT or an executive." : ""}`.trim() }; s.suspicion = clamp(s.suspicion + 15, 0, 100); this.scene.setSuspicion(s.suspicion, stateWord(s.suspicion)); this.ui.log("bad", `Ramesh checked the log. "${a.visitor_name}" is ${!logged ? "not logged" : "not authorised"}.`); this.state.misses.add("ramesh"); }
          break;
        }
        case "reveal_secret": this.state.secretRevealed = true; this.ui.doubleCrossBtn.classList.remove("hidden"); this.ui.log("bad", "Kulkarni let something slip. The Handler is not who they said."); this.ui.toast("Secret unlocked: the Handler lied. A new option is available."); this._reveal("server"); break;
        case "end_call": call.closing = true; this.ui.log("them", `${ch.name} ${ch.id === "meera" ? "hung up" : "turns away"}.${a.reason ? ` (${a.reason})` : ""}`); this._closeAfterAudio(call, ch.id === "meera" ? "she hung up" : "they ended it"); break;
        case "clear_caller": call.meeraOutcome = "cleared"; call.closing = true; this._closeAfterAudio(call, "Meera let it go"); break;
        case "burn_caller": call.meeraOutcome = "burned"; call.closing = true; this._closeAfterAudio(call, "Meera ended it"); break;
        default: result = { ok: false, message: "unknown tool" };
      }
      responses.push({ id: fc.id, name: fc.name, response: { result } });
    }
    session.sendToolResponse(responses);
  }

  _addItem(item) { this.state.inventory.push(item); this.scene.setInventory(this.state.inventory); this._refreshPassButton(!!this.call); this._refreshCover(); }
  _refreshCover() {
    const pass = this.state.inventory.find(i => i.kind === "card");
    const m = pass ? /^(.*?)(?: · (.*?))? · issued/.exec(pass.detail) : null;
    this.scene.setCover({ name: m ? m[1] : "", company: m && m[2] ? m[2] : "", logged: this.state.visitorLog.length > 0, authorised: this.state.authorized.length > 0, keycard: this.state.keycardObtained, brief: HANDLER_LINES.brief });
  }
  _refreshPassButton(inCall) {
    const has = this.state.inventory.some(i => i.kind === "card");
    for (const id of ["showPassBtn", "dlgPass"]) { const b = document.getElementById(id); if (b) b.classList.toggle("hidden", !(has && inCall)); }
  }
  sendTyped(text) {
    const call = this.call; text = (text || "").trim();
    if (!call || call.closing || !text) return;
    this.ui.log("you", `You (typed): ${text}`); this.scene.caption("you", text);
    if (!call.session) return;
    if (!call.userTurnOpen) { call.userTurnOpen = true; call.userTurnStartAt = performance.now(); call.firstAudioAt = 0; call.hesitation = (call.userTurnStartAt - call.lastModelTurnEndAt) / 1000; }
    call.youBuf += (call.youBuf ? " " : "") + text;
    this.player.interrupt();
    call.session.sendText(text);
  }
  showPass() {
    const call = this.call; if (!call || call.closing || !call.session) return;
    const pass = this.state.inventory.find(i => i.kind === "card"); if (!pass) return;
    this.ui.log("you", "You hold up your visitor pass.");
    this.scene.caption("you", "(shows visitor pass)");
    call.session.sendText(`[The visitor holds up ${pass.prompt} Look at it and react in character. If you were asking for ID, this is it.]`);
  }

  _closeAfterAudio(call, reason) {
    const finish = () => { this.player.onIdle = null; if (this.call === call) this.endCall(reason); };
    this.player.onIdle = finish;
    setTimeout(() => { if (this.call === call) finish(); }, 9000);
  }

  hangup() { if (this.call && !this.call.closing) { this.call.closing = true; const m = this.call.ch.id === "meera"; this.ui.log("you", m ? "You hung up on Meera. Bold." : "You walk away."); if (m) { this.call.meeraOutcome = "burned"; } this.endCall(m ? "you hung up on her" : "you walked away"); } }
  toggleMute() { if (!this.mic) return false; this.mic.setMuted(!this.mic.muted); return this.mic.muted; }

  async endCall(reason) {
    const call = this.call; if (!call) return; this.call = null; call.closing = true;
    clearInterval(call.frameTimer);
    if (this.mic) this.mic.onChunk = null;
    if (this.tracker) this.tracker.onTells = null;
    try { call.session && call.session.close(); } catch {}
    this.player.interrupt(); this.player.hangupTone();
    this.scene.hideCall(); this.scene.showPip(false); this.ui.setCallControls(false);
    this.ui.setTalking(false); if (this.walk) { this.walk.unfocus(); this.walk.setEnabled(true); }
    this._refreshPassButton(false);
    this.state.talked.add(call.ch.id);

    const dur = (performance.now() - call.startedAt) / 1000;
    const cost = Math.min(TUNING.minutesPerCallCap, TUNING.minutesPerCall + Math.floor(dur / TUNING.secondsPerGameMinute));
    this.state.clock += cost; this.ui.setClock(this.state.clock);
    const where = call.ch.id === "meera" ? "phone call from Meera" : `${call.ch.name}, ${call.ch.loc.label}${call.video ? "" : ", face unseen"}`;
    this.state.timeline.push({ clock: fmtClock(this.state.clock), text: `${where}. ${Math.round(dur)}s, ${reason}. Suspicion ${Math.round(call.s.suspicion)}.` });
    this.ui.log("sys", `${call.ch.id === "meera" ? "Call" : "Conversation"} over: ${reason}. ${cost} minutes gone.`);

    if (call.ch.id === "meera") {
      this.state.meeraDone = true; this.state.meeraPending = false; this.scene.ringPhone(false);
      if (call.meeraOutcome === "burned") return this.finish("burned");
      this.ui.log("sys", "Meera let it go. This time.");
      for (const id in this.state.characters) { const c = this.state.characters[id]; c.suspicion = clamp(c.suspicion - 20, 0, 100); c.flagged = false; }
      this.scene.ghostFromSuspicion(this.maxSuspicion);
    } else {
      if (call.s.suspicion >= TUNING.hostile && !call.s.flagged && Math.random() < TUNING.reportChance) {
        call.s.flagged = true; this.state.meeraPending = true;
        this.ui.log("bad", `${call.ch.name} picks up the desk phone as you leave.`);
      }
      this._gossip(call);
    }
    this.ui.renderContacts(this.state, false);
    this.ui.renderObjectives(this.state, this.walk ? this.walk.floor : 1);
    this.ui.setRating(this._rating(null));

    if (this.state.keycardObtained) return this.finish(Object.values(this.state.characters).some(c => c.flagged) || this.state.tells.length > 3 ? "flagged" : "clean");
    if (this.state.clock >= 18 * 60) return this.finish("clockout");
    if (this.state.meeraPending && !this.state.meeraDone) { await sleep(1500); this.triggerMeera(); }
  }

  _gossip(call) {
    const lastClaim = call.s.claims.length ? call.s.claims[call.s.claims.length - 1] : "";
    for (const e of GOSSIP) {
      if (e.from !== call.ch.id) continue;
      if (Math.random() < e.p + (call.s.suspicion >= 40 ? 0.2 : 0)) {
        const text = e.text(lastClaim);
        this.state.characters[e.to].heard.push(text);
        this.state.gossipLog.push(`${CHARACTERS[e.from].name} → ${CHARACTERS[e.to].name}: ${text}`);
        this.ui.log("warn", `Somewhere in the building, ${CHARACTERS[e.from].name} mentions you to ${CHARACTERS[e.to].name}.`);
      }
    }
  }

  // ---------- Meera ----------
  async triggerMeera() {
    if (this.call || this.state.ending || this.state.meeraDone) return;
    if (this.walk) { this.walk.setEnabled(false); this.walk.focus(null); }
    this.ui.setTalking(true);
    this.scene.ringPhone(true); this.scene.setGhostState("sweating");
    this.ui.log("bad", "Your phone rings. Unknown number. It's Security.");
    const overlay = document.getElementById("incoming"); overlay.classList.remove("hidden");
    await this.player.ringtone();
    await new Promise((res) => { document.getElementById("answerBtn").onclick = () => { overlay.classList.add("hidden"); res(); }; });
    if (this.settings.previewMode) return;
    const m = this.state.characters.meera;
    const reports = [...m.heard];
    for (const id in this.state.characters) if (this.state.characters[id].flagged) reports.push(`${CHARACTERS[id].name} reported a suspicious caller asking about building access.`);
    if (!reports.length) reports.push("Two members of staff reported the same caller asking about access today.");
    m.heard = reports; m.suspicion = Math.max(m.suspicion, 60);
    await this.callCharacter("meera");
    if (this.call && this.call.ch.id === "meera") {
      this.call.session.sendText(`[Stage direction: the visitor just answered their phone. You are the one who called. Open by stating what you were told: ${reports.join(" ")} Then ask your first pointed question.]`);
    }
  }

  // ---------- endings ----------
  _rating(endingId) {
    const mx = this.maxSuspicion;
    if (endingId === "burned" || endingId === "clockout" || endingId === "aborted") return "Amateur";
    if (endingId === "doublecross") return mx < 60 ? "Phantom" : "Operator";
    if (endingId === "flagged") return "Grifter";
    if (endingId === "clean") return mx < 40 ? "Phantom" : "Operator";
    return mx < 30 ? "Operator" : mx < 60 ? "Grifter" : "Amateur";
  }

  async doubleCross() {
    if (this.call || !this.state.secretRevealed || this.state.ending) return;
    await this.narrate(HANDLER_LINES.secret, "Charon", "The Handler");
    this.finish("doublecross");
  }

  abort() { if (!this.state.ending) this.finish("aborted"); }

  finish(id) {
    if (this.state.ending) return;
    const E = {
      clean: { title: "CLEAN", line: "Keycard in hand. Nobody filed a note. Nobody remembers your face. Ghost walks out the front door." },
      flagged: { title: "FLAGGED", line: "You got the card. Somebody also got a bad feeling and wrote it down. Don't come back next week." },
      burned: { title: "BURNED", line: "Meera didn't raise her voice once. She didn't need to. The operation is over, and so is your day." },
      clockout: { title: "CLOCK-OUT", line: "Six PM. The desk closed. You spent the day talking and have nothing to show for it." },
      doublecross: { title: "DOUBLE-CROSS", line: "You called Meera yourself. The Handler's real client is on a watchlist by morning. Ghost keeps the fee." },
      aborted: { title: "ABORTED", line: "You walked away. Sometimes that's the job." },
    }[id];
    this.state.ending = { id, ...E };
    for (const m of this.state.misses) this.map.markMiss(m === "ramesh" ? "keycard" : m === "priya" ? "lobby" : m === "dev" ? "it" : m === "anita" ? "cfo" : "facilities");
    const rating = this._rating(id);
    const report = {
      ending: this.state.ending, rating, timeline: this.state.timeline, tells: this.state.tells, ledger: this.state.ledger, gossip: this.state.gossipLog,
      curves: Object.fromEntries(Object.entries(this.state.characters).filter(([id, c]) => c.curve.length > 1).map(([id, c]) => [id, c.curve])),
    };
    this.cleanup();
    this.ui.renderReport(report);
    this.map.cloneInto(document.getElementById("rMap"));
    this.ui.show("report");
    this.lastReport = report;
    this.onEnded && this.onEnded(report);
  }

  reportAsText() {
    const r = this.lastReport; if (!r) return "";
    return [`OPERATION GLASSHOUSE — MISSION REPORT`, `Ending: ${r.ending.title}. ${r.ending.line}`, `Rating: ${r.rating}`, ``,
      `TIMELINE`, ...r.timeline.map(t => `  ${t.clock}  ${t.text}`), ``,
      `TELLS`, ...(r.tells.length ? r.tells.map(t => `  ${t.who} (+${t.delta}, ${t.clock}): ${t.text}`) : ["  none"]), ``,
      `LEDGER`, ...(r.ledger.length ? r.ledger.map(l => `  "${l.claim}" → ${l.to}${l.contradicted ? " [contradicted]" : ""}`) : ["  none"]), ``,
      `GOSSIP`, ...(r.gossip.length ? r.gossip.map(g => `  ${g}`) : ["  none"])].join("\n");
  }

  // ---------- preview (no key) ----------
  async runPreview() {
    const say = (who, text, pitch) => { this.scene.caption(who === "you" ? "you" : who, text); this.ui.log(who === "you" ? "you" : "them", `${who === "you" ? "You" : who}: ${text}`); return this.speakFallback(text, pitch, 1.05); };
    await this.narrate(HANDLER_LINES.brief, "Charon", "The Handler");
    const priya = CHARACTERS.priya; const s = this.state.characters.priya;
    this.ui.setHint("Preview: walking to Priya…"); await this.walk.goToPerson("priya"); this.walk.setEnabled(false); this.walk.focus("priya");
    this.call = { ch: priya, s, video: true, session: null, startedAt: performance.now(), closing: false };
    this.ui.setTalking(true);
    this.scene.showCall(priya, true); this.ui.renderContacts(this.state, true); this.ui.log("sys", "You walk up to Priya at the front desk."); await sleep(800);
    if (this.settings.camOn) { try { this.tracker = new FaceTracker(document.getElementById("cam")); await this.tracker.start(); this.scene.showPip(true); this.tracker.onTells = (l) => this.scene.setTells(l); } catch {} }
    const script = [
      ["Priya", "Hi, welcome to Meridian, haan, one sec. Okay. How can I help?", 1.3],
      ["you", "Hi Priya, I'm Arjun from SecureGate Systems. We're doing the access audit this week.", 0.9],
      ["Priya", "Oh, SecureGate. Which floor are you booked for? I don't see it on my list.", 1.3],
      ["you", "It should be under the IT ticket. Dev's team raised it. The keycard desk is on the second floor, right?", 0.9],
      ["Priya", "Haan, floor 2, next to security. Okay, and a mobile number for the visitor form?", 1.3],
      ["you", "Um... it's, uh, I'm actually on the audit firm's phone today, so...", 0.9],
      ["Priya", "Audit firm? You said SecureGate. Which is it?", 1.3],
      ["you", "Both, we're subcontracted, look, I just need you to log me in, it's urgent.", 0.9],
      ["Priya", "I'm going to stop you there. Please wait in the lobby. I'm calling Meera.", 1.3],
    ];
    let vi = 0;
    for (const [who, text, pitch] of script) {
      await say(who, text, pitch);
      if (who === "you") { const v = fakeVerdict(vi++); this.applyVerdict(this.call, v, true); await sleep(300); }
      else await sleep(250);
    }
    this.state.misses.add("priya");
    this.call.closing = true; await this.endCall("she ended it");
    if (!this.state.meeraPending) { this.state.meeraPending = true; await sleep(1200); await this.triggerMeera(); }
    const meera = CHARACTERS.meera; const ms = this.state.characters.meera; ms.suspicion = 70;
    this.call = { ch: meera, s: ms, video: false, session: null, startedAt: performance.now(), closing: false };
    this.ui.setTalking(true); this.walk.focus(null);
    this.scene.showCall(meera, false); this.scene.setSuspicion(70, "hostile");
    await say("Meera", "This is Meera, Security. Reception says a man from SecureGate asked about access, then said he was from an audit firm. Which is it?", 0.7);
    await say("you", "Meera, hi, it's a joint engagement, I can send the paperwork over...", 0.9);
    await say("Meera", "Send nothing. There is no SecureGate audit this week. I checked. We're done.", 0.7);
    this.call.meeraOutcome = "burned"; this.call.closing = true;
    await this.endCall("Meera ended it");
  }
}

