# Operation Glasshouse

**A live heist story game where the characters hear your voice, see your face, and decide whether to believe you.**
Google DeepMind Hyderabad Hackathon, 26 Sept 2026. Track: **Problem Statement 2, Next-Gen Voice & Real-Time Audio.**

> No script. No dialogue tree. You talk, they listen, they watch, and the story bends around how convincing you actually are.

---

## 1. One-paragraph pitch

You are Ghost, a con artist with one workday to talk your way into Meridian Tower and walk out with a keycard. You phone and video-call the building's staff, each a live Gemini character with a personality, a weakness, and a suspicion meter. They hear your hesitation, see your face on video calls, remember every claim you made, and gossip with each other between calls. The building map reveals itself as you extract facts. Push too hard and a character hangs up on you mid-sentence. Push too far and the Security Lead calls you back. It is a dynamic story game with no branches written in advance: the branches are whatever you say, and how you look while saying it. Every run ends with a Mission Report that replays the exact moment you gave yourself away.

---

## 2. Why it fits Problem Statement 2

| Judges' bar | How Glasshouse meets it |
|---|---|
| Mid-sentence interruptions | Characters cut you off when suspicion spikes. Meera's callback rings in over whatever you are doing. You can interrupt them too. |
| Read vocal tone | Hesitation, pitch rise, filler words, and over-politeness are game tells that raise suspicion. |
| Real-time translation | Kulkarni only speaks Telugu. You hear him through Live Translate, with the lag as part of the tension. |
| Messy multi-speaker audio into structured action | Every call becomes a fact ledger, suspicion deltas, a map update, gossip between characters, and a timestamped Mission Report. |
| Fails if typed into a chatbox | The game is about how you sound and how you look. Typed, there is no game. |

The camera adds a second real-time channel that no chat interface can replicate. Audio remains the primary medium, so the track fit stays clean.

### Google tech coverage
The game uses 9 of the 12 models on the hackathon list, plus MediaPipe, Firebase, and Flutter. Only Gemma 4 (offline track), Antigravity (agents track), and Omni Flash video editing are left out, and Omni Flash is used for cutscenes if time allows. Judges should see every model doing a visible job on screen.

---

## 3. Google-only stack, using the hackathon's model list

| Piece | Model / product | Notes |
|---|---|---|
| Character conversations, barge-in, tone reading, seeing your face | **Gemini 3.8 Live** (`gemini-3.8-live`) | One Live session per active call. Audio in and out. Camera frames streamed at 1 fps during video calls. |
| Scripted dramatic voices: Handler briefings, Meera's callback, ending narration | **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`) | Multi-speaker TTS for pre-scripted beats. Distinct voices per character. |
| Kulkarni's Telugu calls | **Gemini 3.5 Live Translate** (`gemini-3.5-live-translate-preview`) | Telugu to English for you, English to Telugu for him. |
| Speaker-labelled, timestamped transcript | **Gemini 3.5 Transcribe** (`gemini-3.5-transcribe`) | Feeds the ledger, the judge, and the Mission Report replay. |
| Suspicion judge, consistency checker, gossip graph, map generation, Mission Report | **Gemini 3.8 Flash** (`gemini-3.8-flash`) | Structured JSON output. Runs after every turn in the background. |
| Facial signals, continuous and cheap | **MediaPipe Face Landmarker** | 52 blendshapes on-device at 30 fps. Gaze, brow, lip press, smile, head turn. Feeds the judge as numbers. |
| Character portraits, floor tiles, TPP scene layers, ending posters | **Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`) | Under 2 seconds per image. Generated at mission start and on state change. |
| Adaptive soundtrack | **Lyria 3.5** (`lyria-3.5`) | Tension score driven by max suspicion. Hold music. Ending stings. |
| Opening and ending cutscenes | **Gemini Omni Flash** (`gemini-omni-1.1-flash`) | 8-second cinematic for the mission intro and one per ending, generated from the run's own facts. Last hour. |
| Game state, gossip graph, leaderboard, session history | **Firebase Firestore** | |
| Live demo URL (required by submission) | **Firebase Hosting** | Cloud Run for the Live-session relay if needed. |
| Frontend | **Flutter Web** (or Angular) | 2.5D third-person scene, picture-in-picture camera, map panel. |
| 3D safehouse option | **`<model-viewer>`** (Google web component) | Only if the team wants real 3D. Not required. |

Not used on purpose: Gemma 4. Problem Statement 5 demands 100% offline, which conflicts with Live. Do not mix tracks.

---

## 4. Story

### Interaction model (decided 26 Sept)
Ghost is physically inside the tower. Every conversation is face to face: the player walks up to a character and talks through the laptop mic and speaker, and the webcam is the player's face as the character sees it. There are no phone calls to staff. The single phone call in the game is Meera ringing the player's mobile when things escalate. Camera off means "they can't see your face well" and the character starts warier.

### Movement (added 26 Sept)
The tower is a third-person 3D interior (Three.js). Ghost is a walking character seen from behind, GTA-style: WASD relative to the camera, mouse drag to orbit, click-to-walk, a lift alcove at the end of each corridor, floor-specific props, NPCs standing at their posts with floating name tags and suspicion bars, an over-the-shoulder camera during conversations, a front camera with a phone pose for Meera's call, camera shake and a red vignette as suspicion climbs, and a minimap. Movement costs game minutes. An objectives panel says what to do on each floor. Three minor NPCs add intel and texture: Suresh at the lobby chai counter (Hindi), Kavya the IT intern on 4 (English), Lakshmi from housekeeping on 7 (Telugu). Ramesh speaks Telugu. Non-English lines get an English subtitle via Flash.

### Setting
Meridian Tower, Financial District, Hyderabad. 12 floors. A fintech called Meridian Capital occupies floors 3 to 11. The keycard desk is on floor 2, behind the lobby. Server room on 7. CFO suite on 11.

### Your role
Ghost, a con artist for hire. Your Handler wants a physical keycard issued under a fake name and collected from the lobby before 6 PM. Nobody tells you how. You have a phone, a webcam, an org chart with three names, and your own nerve.

### The day
- 9:00 AM. Handler briefing. You get the org chart with three names and a hint: "Kulkarni likes to talk."
- Each call costs 15 to 40 game minutes depending on length. Hesitation costs real seconds and the characters notice.
- 6:00 PM. Hard stop. Clock-out ending.

### Acts
1. **Recon.** Get facts without asking for anything. Kulkarni, Priya. Facts light up the map.
2. **Pretext.** Pick a cover story. Vendor, new hire, auditor, IT contractor. Everything you claim goes into the ledger and can be checked later.
3. **Escalation.** Use what you know to get Dev or Anita to authorise a keycard. Video call needed for at least one of them.
4. **Collection.** Convince Ramesh at the desk to hand it over. He checks the visitor log.
5. **Meera.** If cumulative suspicion crosses the threshold at any point, the Security Lead calls you back. One chance to talk your way out.

### Endings
Each ending gets an Omni Flash cutscene and a Nano Banana poster generated from the run's own facts, so no two players see the same ending.
- **Clean.** Keycard collected, nobody suspected a thing. Rare. Ghost walks out the front door.
- **Flagged.** Keycard collected, but someone filed a note. You made it, barely. Ghost looks over their shoulder.
- **Burned.** Meera caught you. The report shows the exact moment.
- **Clock-out.** 6 PM with nothing. The report shows where the day went.
- **Double-cross.** You find out mid-run that the Handler lied about who you are working for. You can finish the job or call Meera yourself and sell the Handler out. Secret ending, unlocked only if Kulkarni rambles long enough.

---

## 5. Characters

Every character has: a voice, a personality prompt, a weakness, a strength, a suspicion weight profile, and a call type (audio, video, or both).

| Character | Role | Voice feel | Weakness | Strength | Call type |
|---|---|---|---|---|---|
| **Priya** | Receptionist, lobby video intercom | Warm, quick, multitasking | Authority. A name from the org chart softens her. | Remembers voices and faces. Two stories from one face ends it. | Video |
| **Ramesh** | Security guard, desk on 2 | Bored, slow, suspicious of polish | Sympathy. Responds to someone having a bad day. | Follows the visitor log to the letter. | Audio |
| **Dev** | IT helpdesk | Fast, technical, rushed | Urgency plus jargon. | Asks for an employee ID and checks it against Firestore. | Audio or video |
| **Anita** | Executive assistant to the CFO | Sharp, protective, not charmed | Her calendar. Know the CFO is in Singapore and she believes you. | Reads faces. Highest facial weight in the game. | Video only |
| **Mr. Kulkarni** | Facilities manager | Talkative, lonely, Telugu | Anyone who lets him ramble. | None. He is the leak. | Audio, via Live Translate |
| **The Handler** | Your employer, never seen | Dry, deadpan, hiding something | n/a | n/a | TTS only, between acts |
| **Meera** | Security Lead | Calm, cold, precise | n/a | Calls you. Never the other way. | Audio, TTS opener then Live |

### Gossip graph
Edges with a probability that information travels before your next call.

```
Priya  -> Dev      0.4   "a vendor called about access today"
Priya  -> Anita    0.6   "someone asked about the CFO"
Dev    -> Meera    0.5   "an ID didn't check out"
Kulkarni -> anyone 0.1   he forgets
Anita  -> Meera    0.8   anything odd
Ramesh -> Meera    0.7   log mismatch
```

You can exploit this. Seed a rumour with Kulkarni and it may reach Anita as "fact".

---

## 6. The Suspicion Matrix

Each character keeps a suspicion score 0 to 100. It is updated after every turn by the Flash judge from three signal groups. Each character weights the groups differently.

### Signal groups

**Audio signals** (from Live tone reading and Transcribe timestamps)
- `hesitation`: pauses over 1.5 s before answering a direct question
- `filler_rate`: um, uh, like, per minute
- `pitch_rise`: rising pitch on statements (sounds like a question)
- `over_politeness`: excessive sir/ma'am, thanking, apologising
- `pressure`: urgency words, threats, name-dropping under pushback
- `speech_rate_shift`: sudden speed-up or slow-down mid-call

**Visual signals** (video calls only, from MediaPipe blendshapes at 30 fps, aggregated per turn, plus a Live frame read at 1 fps)
- `gaze_aversion`: eyes off-camera during an answer (`eyeLookOut`, `eyeLookDown`)
- `reading_tell`: eyes tracking left-right as if reading a script
- `brow_furrow`: `browDownLeft/Right` sustained
- `lip_press`: `mouthPressLeft/Right`, a classic suppression tell
- `duping_delight`: micro-smile right after a claim (`mouthSmile` spike under 400 ms)
- `self_touch`: hand to face, from pose landmarks
- `head_turn_away`: yaw over 25 degrees while speaking
- `expression_mismatch`: Live's holistic read of "face does not match words" (e.g. saying "my boss will be furious" while smiling)

**Story signals** (from the ledger and Flash consistency check)
- `contradiction`: a claim conflicts with an earlier claim, any character
- `unverifiable`: a claim the character could check and you cannot back
- `gossip_hit`: the character already heard about you from another character
- `known_fact_error`: you state something wrong about the building (wrong floor, wrong name)

### Per-character weights

| Character | Audio | Visual | Story |
|---|---|---|---|
| Priya | 0.3 | 0.4 | 0.3 |
| Ramesh | 0.6 | 0.0 | 0.4 |
| Dev | 0.3 | 0.2 | 0.5 |
| Anita | 0.2 | 0.6 | 0.2 |
| Kulkarni | 0.2 | 0.0 | 0.1 (he barely cares) |
| Meera | 0.4 | 0.3 | 0.3 |

### Update rule (run by Flash, returned as JSON)

```
delta = 100 * ( w_audio * audio_score + w_visual * visual_score + w_story * story_score )
        - relief
suspicion = clamp(suspicion + delta, 0, 100)
```

`audio_score`, `visual_score`, `story_score` are 0 to 1 from the judge. `relief` is 0 to 10 when you did something that matches the character's weakness (name-drop for Priya, sympathy for Ramesh, jargon for Dev, calendar fact for Anita, letting Kulkarni talk).

### Thresholds
- Under 40: cooperative.
- 40 to 70: stalling, asks verifying questions, character's voice gets cooler.
- 70 to 85: character may interrupt you mid-sentence and end the call.
- Over 85: escalates to Meera. Meera calls back within 1 game-hour.
- Global: if any two characters are over 60, Meera calls regardless.

### Judge output schema

```json
{
  "character": "priya",
  "turn": 7,
  "audio": { "hesitation": 0.6, "filler_rate": 0.2, "pitch_rise": 0.1, "over_politeness": 0.5, "pressure": 0.0, "speech_rate_shift": 0.3, "score": 0.38 },
  "visual": { "gaze_aversion": 0.7, "reading_tell": 0.2, "brow_furrow": 0.1, "lip_press": 0.4, "duping_delight": 0.0, "self_touch": 0.3, "head_turn_away": 0.0, "expression_mismatch": 0.5, "score": 0.41 },
  "story": { "contradiction": 0.0, "unverifiable": 0.5, "gossip_hit": 0.0, "known_fact_error": 0.0, "score": 0.25 },
  "relief": 6,
  "delta": 26.8,
  "suspicion_after": 58,
  "state": "stalling",
  "tell_summary": "Looked away when asked for a callback number. Claimed 'IT contractor' but gave no ticket ID.",
  "new_facts_claimed": [{ "claim": "works for NetSecure Pvt Ltd", "verifiable_by": ["dev", "anita"] }],
  "new_facts_learned": [{ "fact": "CFO is in Singapore until Friday", "source": "priya", "map_update": null }],
  "interrupt_now": false,
  "escalate": false
}
```

The `tell_summary` lines are what the Mission Report replay is built from.

---

## 7. The camera: how characters "see" you

Narrative justification: Meridian uses a video intercom in the lobby and Google Meet for staff. Some characters insist on video. You choose audio or video per call.

- **Audio call:** safer. No visual signals. But Priya and Anita trust audio-only callers less, so their base suspicion starts at 20 instead of 0.
- **Video call:** your webcam is live in a picture-in-picture window. Base suspicion 0, but every facial tell counts.

Pipeline during a video call:
1. Browser webcam to MediaPipe Face Landmarker in a web worker. 30 fps. Blendshapes aggregated into per-turn features.
2. One frame per second sent to the Gemini 3.8 Live session so the character can react in character ("You look nervous. Everything alright?").
3. At turn end, the aggregated visual features plus the transcript segment go to the Flash judge.

Privacy line for the writeup: frames never leave the session, nothing is stored, the Mission Report keeps only the feature values and timestamps.

---

## 8. Third-person perspective (TPP) presentation

The game is shown from over the agent's shoulder, not first-person. This matters: the player sees their own character react, and the judges see the whole system at once.

### Scene layout
```
+----------------------------------------------------------+
|  MERIDIAN TOWER MAP (reveals as facts arrive)   | CLOCK  |
|                                                 | 11:40  |
+-------------------------------------------------+--------+
|                                                          |
|   [Over-the-shoulder view of Ghost in the safehouse]     |
|   Desk. Phone in hand. Wall of sticky notes = ledger.    |
|   Monitor on the desk = the character you're calling,    |
|   portrait + suspicion ring around it.                   |
|   Small PiP in the corner = your real webcam feed        |
|   (only during video calls).                             |
|                                                          |
+----------------------------------------------------------+
| PRIYA  ████████░░ 58  stalling     | LEDGER  7 claims    |
| DEV    ███░░░░░░░ 22  cooperative  | GOSSIP  1 hop fired |
+----------------------------------------------------------+
```

### How the TPP is built in a day
- **2.5D layers, not a 3D engine.** Nano Banana 2 Lite generates the safehouse background, the Ghost character from behind in four states (calm, tense, sweating, caught), the desk, and the monitor frame. Layers are composited in Flutter with parallax on mouse move.
- **Ghost's state** follows the max suspicion value, so the player watches themselves get tense.
- **Sticky notes** on the wall are the ledger. A new claim spawns a note. A contradiction turns two notes red and draws a string between them.
- **The monitor** shows the character's portrait. The ring around it is their suspicion meter. On interrupt, the ring flashes and the portrait cuts to black.
- **Meera's callback** slides a second phone into frame with a ringtone. The whole scene desaturates.
- Optional: `<model-viewer>` for a real 3D safehouse if a teammate wants it. Do not start there.

### Map reveal
Building starts as a black silhouette with 12 floor outlines. Each `map_update` in the judge output lights a room and labels it. Flash generates the SVG from the fact ledger after each call. End of mission: the map shows your route in green and every near-miss as a red dot with a timestamp.

---

## 9. Audio design

- One Gemini 3.8 Live session per active call. Voice per character set in session config.
- Barge-in both ways. Player can interrupt. Character interrupts when `interrupt_now` is true.
- Hold music when a character puts you on hold. This is when the gossip graph fires. Hold music from Lyria 3.5 if time allows, otherwise a TTS "please hold".
- Ambient beds per character location: lobby echo, helpdesk keyboard clatter, guard booth radio, Kulkarni's ceiling fan.
- Lyria 3.5 tension bed driven by max suspicion: calm under 40, pulse 40 to 70, drone over 70.
- Meera's callback: ringtone interrupts current audio, TTS opener ("This is Meera from Security. You called my reception desk twice today."), then Live takes over.
- Headphones mandatory for the demo. Echo cancellation on the mic track. Without this the mic hears the speakers and triggers barge-in on itself.

---

## 10. Mission Report (the ending screen)

Shown at every ending, styled like a case file. This is the "structured action" proof for the judges and the thing players screenshot.

- Ending poster from Nano Banana 2 Lite, generated from the run's facts (which character caught you, which floor you reached).
- Timeline of every call with duration and game-clock cost.
- Per character: the suspicion curve, and the single turn with the largest delta, with the `tell_summary` and a 5-second audio replay of it. "This is where Priya stopped believing you."
- Facial tells table for video calls: which tell, at which timestamp. "You looked away for 1.8 seconds when she asked for a callback number."
- Story ledger: every lie you told, who heard it, and which one contradicted which.
- Gossip trail: which rumour travelled where, and whether it helped or sank you.
- The map with your route in green and every near-miss as a red dot.
- Ghost's rating: Amateur, Grifter, Operator, Phantom.
- Share card, and export to Google Docs via the Docs API for the leaderboard writeup.

---

## 11. Architecture

```
Browser (Flutter Web)
 ├─ Mic ──────────────► Gemini 3.8 Live (character session) ◄──── 1 fps camera frames
 │                               │ audio out, tone events
 ├─ Webcam ─► MediaPipe Face Landmarker (worker) ─► per-turn visual features
 │
 ├─ Transcript ◄──── Gemini 3.5 Transcribe (speaker labels + timestamps)
 │
 └─ Turn end ─► Cloud Run "judge" ─► Gemini 3.8 Flash (JSON)
                    │                      │
                    │                      ├─ suspicion delta, tells
                    │                      ├─ ledger updates, contradictions
                    │                      ├─ gossip propagation
                    │                      └─ map SVG
                    ▼
               Firestore (mission state, ledger, gossip, suspicion, history)
                    │
                    ├─ Meera trigger ─► Gemini 3.8 Flash TTS ─► ringtone + callback
                    ├─ Kulkarni calls ─► Gemini 3.5 Live Translate (te ↔ en)
                    ├─ Mission start ─► Nano Banana 2 Lite (portraits, layers, tiles)
                    └─ Suspicion max ─► Lyria 3.5 (tension bed)
```

Why Flash is load-bearing: the judge runs after every turn, in the background, while the Live conversation continues. Judge latency must stay under roughly 1.5 s or the interrupt arrives too late to feel causal.

---

## 12. Firestore data model

```
missions/{missionId}
  startedAt, gameClock, status, ending
  characters/{name}
    suspicion, state, weights, callsReceived, lastCallAt
  ledger/{claimId}
    claim, toldTo[], verifiableBy[], contradictedBy, turnRef
  facts/{factId}
    fact, source, mapUpdate {floor, room, label}
  gossip/{edgeId}
    from, to, fired, payload
  turns/{turnId}
    character, transcriptSegment, audioFeatures, visualFeatures, judgeOutput
  map
    svg, revealedRooms[]
users/{uid}/history/{missionId}
    ending, rating, bestTell, floorsReached, gameClockAtEnd
```

---

## 13. Build order for today

| # | Slice | Time | Demo-critical |
|---|---|---|---|
| 1 | Live session with Priya, audio only, plus Flash judge returning the JSON above | 2 h | Yes |
| 2 | Ledger and contradiction check, sticky notes on the wall | 1 h | Yes |
| 3 | Webcam PiP, MediaPipe blendshapes, video-call mode for Priya | 1 h | Yes, this is the wow |
| 4 | Dev as second character plus one gossip edge | 45 min | Yes |
| 5 | Meera's TTS callback at threshold | 30 min | Yes, demo climax |
| 6 | Map reveal from facts | 45 min | Nice |
| 7 | TPP scene layers from Nano Banana 2 Lite, Ghost state changes | 45 min | Nice |
| 8 | Mission Report screen with ending poster | 30 min | Yes |
| 9 | Kulkarni via Live Translate | 1 h | If time |
| 10 | Lyria soundtrack | 30 min | If time |
| 11 | Omni Flash intro and ending cutscenes | 30 min | If time |
| 12 | Firebase Hosting deploy, README, Kaggle writeup | 1 h | Required |

If slice 3 is not working by 2 PM, ship audio-only and describe the camera as roadmap. A working audio game with a real Mission Report beats a broken video one.

---

## 14. Demo script (3 minutes)

1. 0:00. Omni Flash intro cutscene, 8 seconds. Handler briefing over it. Map is black. "Get a keycard by 6 PM."
2. 0:20. Judge volunteers. Headphones on. Video-calls Priya.
3. 0:30 to 1:30. Judge improvises a cover story. Priya asks for a callback number. Judge hesitates and looks away. Suspicion ring jumps, sticky note appears, Ghost on screen starts sweating, Lyria tightens.
4. 1:30. Judge pushes too hard. Priya interrupts mid-sentence and hangs up.
5. 1:45. Second phone slides in. Meera calls. Judge has 30 seconds.
6. 2:20. Burned ending. Cutscene and poster generated from this exact run. Mission Report: the moment, the gaze-aversion timestamp, the replay, Ghost rated "Amateur".
7. 2:45. Close: "Nine Gemini models, one phone call, and the story only exists because of how they talked."

---

## 15. Kaggle writeup outline (under 1,500 words)

1. Title and subtitle.
2. The idea in three sentences. Story games have dialogue trees. Ours has none. The characters listen, watch, and decide in real time.
3. What we built. The game in one paragraph, the Mission Report in one paragraph.
4. Architecture diagram plus the model table from section 3, with a line on what each of the nine models does on screen.
5. The Suspicion Matrix. Signals, weights, update rule, the JSON. Judges want to see this is engineering, not a prompt.
6. Three challenges we hit and how we solved them. Candidates: barge-in echo, judge latency in the background, aligning blendshape windows with transcript timestamps.
7. Why audio and video were the only mediums that work.
8. Privacy stance: frames never stored.
9. Roadmap: more buildings and heists, two-player mode where a friend plays Meera, Gemma offline mode for train journeys.
10. Links: repo, live demo.

---

## 16. Risks and honest answers

- **"Isn't this just a prompt?"** The voices are prompts. The game is not. Turn-taking, the suspicion matrix, the ledger, the gossip graph, the map, and the Mission Report are state and code. Say this before they ask.
- **Latency.** Judge must run in the background and finish under 1.5 s. Use Flash, small context, JSON schema output.
- **Echo.** Headphones for the demo, always.
- **Face reading accuracy.** Blendshapes are noisy. Aggregate per turn, threshold conservatively, and never show a raw value on screen, only the tell name.
- **Venue noise.** Have one rehearsed recording of a full mission ready to play if the room is too loud.
- **Framing.** It is a heist story game, full stop. Characters, company, and building are fictional. No real company names, no real-world scripts. If asked about misuse, the answer is that the characters are fictional and the game rewards story, not technique.

---

## 17. Repo layout

```
operation-glasshouse/
  DESIGN.md                 this file
  README.md                 setup, run, demo instructions
  app/                      Flutter Web
    lib/scene/              TPP layers, parallax, Ghost states
    lib/calls/              Live session, barge-in, PiP camera
    lib/vision/             MediaPipe worker bridge, feature aggregation
    lib/map/                SVG map panel
    lib/report/             Mission Report, ending poster, share card
  functions/                Cloud Run judge service
    judge.py                Flash judge, JSON schema
    gossip.py
    mapgen.py
    cutscenes.py            Omni Flash intro and endings, Nano Banana posters
    prompts/                character personas, judge rubric, report
  assets/generated/         Nano Banana outputs
  firebase.json, firestore.rules
```
