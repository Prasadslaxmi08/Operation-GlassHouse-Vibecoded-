# Operation Glasshouse — browser prototype

A live heist story game. You are inside Meridian Tower, walking up to staff and talking to them through the laptop mic and speaker. Each character is a Gemini Live session that hears your voice, sees your face through the webcam, remembers your claims, and gossips with the others. The only phone call in the game is the one you don't want: Meera, Security, ringing your mobile. Third-person scene, a tower map that reveals itself, and a Mission Report at the end.

Design doc: `DESIGN.md`.

## Run it

Needs a browser with mic and camera (Chrome recommended) and a Gemini API key.

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\operation-glasshouse"
.\run.ps1
```

Then open http://localhost:8080, paste the API key in Setup, and press **Start Mission**.

`run.ps1` just runs `python -m http.server 8080`. Any static server works. The page must be served over http://localhost or https, or the browser blocks the mic and camera.

## Playing

- **Third-person 3D.** You are Ghost, seen from behind. **W A S D** or the arrows walk relative to the camera. **Drag the mouse** to orbit. Click the floor, a door, or a person and Ghost walks there, riding the lift if the person is on another floor. Walking and lifts cost game minutes.
- **Lift.** Walk into the lift alcove at the south end of the corridor and press W or S to go up or down a floor.
- **Talk** by pressing E next to someone, clicking them, or using the button in the People panel. The camera drops to an over-the-shoulder shot facing them. When Meera calls, Ghost takes the phone out and the camera comes round to the front.
- **HUD.** Name tags with suspicion bars float over people. Your story-so-far notes stack top-left. Minimap top-right. Webcam PiP bottom-right during conversations. The screen edges go red as people stop believing you.
- **Renderer.** Three.js for the 3D world. Everything AI is Gemini; the renderer is not part of the hackathon's stack requirement.
- **Objectives** on the left say what to do on each floor and tick off as you do it.
- **Languages.** Ramesh (keycard desk) and Lakshmi (housekeeping) speak Telugu. Kulkarni mixes Telugu into English. Everyone else is English. Non-English lines get an English subtitle under the captions, translated by Flash.
- **Meera** calls your phone when one person gets to 75 suspicion, when two people are above 55, or with a 70% chance when you leave someone who is hostile (70 or more).

## No key yet?

Tick **Preview mode** on the start screen. It plays a scripted conversation with a fake referee so you can see the scene, the story wall, the map reveal, the interruption, Meera's phone call, and the report. Voices use the browser's built-in speech synthesis in preview mode only.

## What talks to what

| Piece | Google tech |
|---|---|
| Conversations, barge-in, tone, seeing your face | Gemini 3.8 Live (`gemini-3.8-live`) over WebSocket, audio in/out, 1 fps JPEG webcam frames while you talk |
| Referee: suspicion scoring, contradiction check, fact extraction | Gemini 3.8 Flash (`gemini-3.8-flash`), JSON schema output |
| Facial tells | MediaPipe Face Landmarker (blendshapes + head pose), on-device |
| Meera's callback and Handler briefing | Live session with a scripted opener (Flash TTS slot is stubbed for the hackathon build) |
| Kulkarni's Telugu | Persona speaks Telugu-mixed English in this build; Live Translate integration is the next slice |

Model IDs are editable on the start screen.

## Files

```
index.html          screens: start (rules + setup), mission (map / TPP scene / contacts), report
css/style.css
js/main.js          wiring
js/game.js          state machine: clock, suspicion, ledger, gossip, calls, Meera, endings, preview script
js/live.js          Gemini Live WebSocket wrapper
js/judge.js         Flash referee + fake verdicts for preview
js/audio.js         mic capture (16 kHz PCM), playback (24 kHz), synthesized ringtone
js/vision.js        webcam + MediaPipe blendshape aggregation
js/characters.js    world facts, cast, tools, gossip graph, prompt builder
js/map.js           SVG tower map (report view + known-room tracking)
js/world3d.js       third-person 3D tower (Three.js): corridors, lift, props per floor, NPCs, camera, minimap
js/scene.js         HUD controller layered over the 3D view
js/ui.js            HUD, contacts, feed, report
js/config.js        settings + tuning constants
```

## Tuning

`js/config.js` → `TUNING`. `turnScale` is the max suspicion one bad turn can add. Thresholds: 40 stalling, 70 hostile, 85 escalate.

## Known gaps in this build

- Flash TTS and Live Translate are not wired; both are one function each once the key is in.
- Nano Banana scene art, Lyria soundtrack, and Omni Flash cutscenes are not wired; the scene is CSS-drawn.
- No Firebase; state is in memory for the session.

