// Settings persisted in localStorage. Model IDs default to the hackathon's list.
const KEY = "glasshouse.settings.v1";

export const DEFAULTS = {
  apiKey: "",
  liveModel: "gemini-3.8-live",
  flashModel: "gemini-3.8-flash",
  ttsModel: "gemini-3.8-flash-tts",
  camOn: true,
  previewMode: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export const ENDPOINTS = {
  live: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
  rest: "https://generativelanguage.googleapis.com/v1beta/models",
};

// Suspicion tuning
export const TUNING = {
  turnScale: 35,        // max suspicion gained in one bad turn
  calmBonus: 3,         // suspicion shed on a clean turn
  stalling: 40,
  hostile: 70,
  escalate: 75,         // a single character this suspicious reports you
  reportChance: 0.7,    // chance a hostile (>=70) character reports you when the conversation ends
  globalEscalateAt: 55, // if two characters are above this, Meera calls
  audioBaseSuspicion: { priya: 20, anita: 20 }, // audio-only callers trusted less by these two
  minutesPerCall: 15,
  minutesPerCallCap: 40,
  secondsPerGameMinute: 20, // beyond base cost, 1 game minute per 20 real seconds on the call
};
