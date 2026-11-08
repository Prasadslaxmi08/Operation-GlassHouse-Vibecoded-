// The referee: Gemini Flash scores a turn as JSON. Suspicion math is done locally in game.js.
import { ENDPOINTS } from "./config.js";
import { WORLD } from "./characters.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    audio: { type: "OBJECT", properties: {
      hesitation: { type: "NUMBER" }, filler_rate: { type: "NUMBER" }, pitch_rise: { type: "NUMBER" },
      over_politeness: { type: "NUMBER" }, pressure: { type: "NUMBER" }, speech_rate_shift: { type: "NUMBER" },
      score: { type: "NUMBER" } }, required: ["score"] },
    visual: { type: "OBJECT", properties: {
      gaze_aversion: { type: "NUMBER" }, reading_tell: { type: "NUMBER" }, brow_furrow: { type: "NUMBER" },
      lip_press: { type: "NUMBER" }, duping_delight: { type: "NUMBER" }, head_turn_away: { type: "NUMBER" },
      expression_mismatch: { type: "NUMBER" }, score: { type: "NUMBER" } }, required: ["score"] },
    story: { type: "OBJECT", properties: {
      contradiction: { type: "NUMBER" }, unverifiable: { type: "NUMBER" }, gossip_hit: { type: "NUMBER" },
      known_fact_error: { type: "NUMBER" }, score: { type: "NUMBER" } }, required: ["score"] },
    relief: { type: "NUMBER" },
    tell_summary: { type: "STRING" },
    new_facts_claimed: { type: "ARRAY", items: { type: "OBJECT", properties: { claim: { type: "STRING" }, verifiable_by: { type: "ARRAY", items: { type: "STRING" } } }, required: ["claim"] } },
    new_facts_learned: { type: "ARRAY", items: { type: "OBJECT", properties: { fact: { type: "STRING" }, room_id: { type: "STRING" } }, required: ["fact"] } },
    interrupt_now: { type: "BOOLEAN" },
    escalate: { type: "BOOLEAN" },
  },
  required: ["audio", "visual", "story", "relief", "tell_summary", "new_facts_claimed", "new_facts_learned", "interrupt_now", "escalate"],
};

const SYSTEM = `You are the referee of a voice heist game. A caller (the player) is trying to talk a staff member of Meridian Tower into helping them. You score ONE exchange: what the caller just said, and what the staff member replied.

Score every signal 0.0 to 1.0 (0 = not present, 1 = strong). Then give a combined score per group, also 0 to 1.
AUDIO: use the measured metrics given (hesitation seconds, filler count, words, speaking seconds) plus the transcript. hesitation over 1.5 s is notable, over 3 s is strong. pitch_rise: statements phrased like questions. over_politeness: excessive sir/ma'am/sorry/thank you. pressure: urgency, threats, name-dropping under pushback.
VISUAL: use the measured facial metrics if provided (fractions of the window). If none provided, all zeros and score 0. expression_mismatch: infer only if the metrics and words clearly conflict.
STORY: contradiction = conflicts with the caller's PRIOR CLAIMS. unverifiable = a claim this staff member could check but the caller gave nothing checkable. gossip_hit = the staff member already heard something about this caller that conflicts. known_fact_error = the caller stated a wrong building fact.
relief: 0 to 10. Give relief when the caller did something that matches this character's WEAKNESS, or answered a verifying question cleanly.
tell_summary: one sentence, second person, concrete, the single most damaging thing in this exchange (or "Nothing notable." if clean).
new_facts_claimed: every checkable claim the caller made about themselves this turn (name, company, role, ticket number, reason). Short.
new_facts_learned: every building fact the STAFF MEMBER revealed this turn. If it matches one of the known rooms, set room_id to that id, else omit room_id.
interrupt_now: true only if the staff member should cut the caller off right now (combined suspicion is very high or the caller became abusive).
escalate: true only if this exchange alone justifies reporting the caller to security.
Be strict but fair. Output JSON only.`;

export async function judgeTurn({ apiKey, model, character, transcriptYou, transcriptThem, audioMetrics, visualMetrics, priorClaims, heard, suspicion }) {
  const rooms = WORLD.rooms.map(r => `${r.id}: ${r.label} (floor ${r.floor})`).join("; ");
  const user = `CHARACTER: ${character.name}, ${character.role}. WEAKNESS/STRENGTH: ${character.blurb}
CURRENT SUSPICION: ${Math.round(suspicion)} / 100
KNOWN ROOMS: ${rooms}
PRIOR CLAIMS BY CALLER: ${priorClaims.length ? priorClaims.join(" | ") : "none"}
WHAT THIS CHARACTER HEARD FROM COLLEAGUES: ${heard.length ? heard.join(" | ") : "nothing"}
MEASURED AUDIO: ${JSON.stringify(audioMetrics)}
MEASURED FACE: ${visualMetrics ? JSON.stringify(visualMetrics) : "no video"}
CALLER SAID: "${transcriptYou || "(silence)"}"
STAFF REPLIED: "${transcriptThem || "(no reply yet)"}"`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.3 },
  };
  const res = await fetch(`${ENDPOINTS.rest}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Judge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts.map(p => p.text || "").join("");
  return JSON.parse(text);
}

// English subtitle for Telugu / Hindi lines. Short Flash call, plain text out.
export async function translateText({ apiKey, model, text }) {
  const body = {
    contents: [{ role: "user", parts: [{ text: `Translate the following spoken line into natural English. Output only the translation, nothing else.\n\n${text}` }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
  };
  const res = await fetch(`${ENDPOINTS.rest}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
}

// Preview mode: deterministic-ish fake verdicts so the UI can be exercised without a key.
export function fakeVerdict(i) {
  const bad = i % 3 === 2;
  return {
    audio: { hesitation: bad ? 0.7 : 0.1, filler_rate: 0.2, pitch_rise: 0, over_politeness: bad ? 0.5 : 0.1, pressure: 0, speech_rate_shift: 0, score: bad ? 0.55 : 0.12 },
    visual: { gaze_aversion: bad ? 0.8 : 0.1, reading_tell: 0, brow_furrow: 0.2, lip_press: bad ? 0.5 : 0, duping_delight: 0, head_turn_away: 0, expression_mismatch: 0, score: bad ? 0.6 : 0.1 },
    story: { contradiction: i === 4 ? 1 : 0, unverifiable: bad ? 0.6 : 0.2, gossip_hit: 0, known_fact_error: 0, score: i === 4 ? 0.9 : bad ? 0.4 : 0.1 },
    relief: bad ? 0 : 5,
    tell_summary: bad ? "You looked away when she asked for a callback number and never gave one." : "Nothing notable.",
    new_facts_claimed: i === 1 ? [{ claim: "works for SecureGate Systems", verifiable_by: ["dev"] }] : i === 4 ? [{ claim: "works for an audit firm", verifiable_by: ["anita"] }] : [],
    new_facts_learned: i === 0 ? [{ fact: "Keycard desk is on floor 2", room_id: "keycard" }] : i === 2 ? [{ fact: "IT helpdesk is on floor 4", room_id: "it" }] : [],
    interrupt_now: i === 5,
    escalate: i === 5,
  };
}
