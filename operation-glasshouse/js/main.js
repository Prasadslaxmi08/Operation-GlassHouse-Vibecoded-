import { loadSettings, saveSettings } from "./config.js";
import { Scene } from "./scene.js";
import { UI } from "./ui.js";
import { Game } from "./game.js";

const $ = (id) => document.getElementById(id);
const settings = loadSettings();
$("apiKey").value = settings.apiKey; $("liveModel").value = settings.liveModel; $("flashModel").value = settings.flashModel;
$("camOn").checked = settings.camOn; $("previewMode").checked = settings.previewMode;

const scene = new Scene();
const ui = new UI();
let game = null;

function readSettings() {
  settings.apiKey = $("apiKey").value.trim(); settings.liveModel = $("liveModel").value.trim() || "gemini-3.8-live";
  settings.flashModel = $("flashModel").value.trim() || "gemini-3.8-flash"; settings.camOn = $("camOn").checked; settings.previewMode = $("previewMode").checked;
  saveSettings(settings);
}

$("startBtn").addEventListener("click", async () => {
  readSettings();
  const status = $("startStatus");
  if (!settings.previewMode && !settings.apiKey) { status.textContent = "Paste a Gemini API key, or tick Preview mode."; status.className = "status err"; return; }
  if (!window.isSecureContext) { status.textContent = "Open this page via http://localhost or https, or the browser will block the mic."; status.className = "status err"; return; }
  status.textContent = "Starting…"; status.className = "status";
  $("startBtn").disabled = true;
  game = new Game({ settings, scene, ui });
  try { await game.start(); }
  catch (e) { status.textContent = "Could not start: " + (e.message || e); status.className = "status err"; ui.show("start"); }
  finally { $("startBtn").disabled = false; }
});

$("hangupBtn").addEventListener("click", () => game && game.hangup());
$("muteBtn").addEventListener("click", () => { if (!game) return; const m = game.toggleMute(); $("muteBtn").textContent = m ? "Unmute" : "Mute"; });
$("abortBtn").addEventListener("click", () => { if (game && confirm("Abort the mission?")) game.abort(); });
$("objBtn").addEventListener("click", () => ui.toggleObjectives());
window.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && document.getElementById("mission").classList.contains("active")) { e.preventDefault(); ui.toggleObjectives(); }
  if (e.key === "Escape") ui.toggleObjectives(false);
});
$("doubleCrossBtn").addEventListener("click", () => game && game.doubleCross());
$("showPassBtn").addEventListener("click", () => game && game.showPass());
$("dlgPass").addEventListener("click", () => game && game.showPass());
$("dlgLeave").addEventListener("click", () => game && game.hangup());
$("dlgMute").addEventListener("click", () => { if (!game) return; const m = game.toggleMute(); $("dlgMute").textContent = m ? "Unmute microphone" : "Mute microphone"; $("muteBtn").textContent = m ? "Unmute" : "Mute"; });
$("dlgForm").addEventListener("submit", (e) => { e.preventDefault(); if (!game) return; game.sendTyped($("dlgText").value); $("dlgText").value = ""; });
$("listenBrief").addEventListener("click", () => { if (game && !game.call) game.narrate($("coverBrief").textContent, "Charon", "The Handler"); });
$("againBtn").addEventListener("click", () => { ui.show("start"); });
$("copyReportBtn").addEventListener("click", async () => { if (!game) return; try { await navigator.clipboard.writeText(game.reportAsText()); ui.toast("Report copied."); } catch { ui.toast("Clipboard blocked by the browser."); } });

window.addEventListener("beforeunload", () => { try { game && game.cleanup(); } catch {} });
