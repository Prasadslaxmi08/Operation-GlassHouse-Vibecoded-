// Thin wrapper over the Gemini Live API WebSocket (BidiGenerateContent).
import { ENDPOINTS } from "./config.js";

export class LiveSession {
  /**
   * @param {object} opts
   *  apiKey, model, voice, systemInstruction, tools (functionDeclarations[]), video (bool)
   *  handlers: onAudio(b64), onInputText(text), onOutputText(text), onTurnComplete(), onInterrupted(),
   *            onToolCall(calls[]), onOpen(), onClose(reason), onError(err)
   */
  constructor(opts) {
    this.o = opts; this.ws = null; this.ready = false; this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `${ENDPOINTS.live}?key=${encodeURIComponent(this.o.apiKey)}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      const setup = {
        setup: {
          model: `models/${this.o.model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.o.voice || "Kore" } } },
          },
          systemInstruction: { parts: [{ text: this.o.systemInstruction || "" }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: { automaticActivityDetection: {} },
        },
      };
      if (this.o.tools && this.o.tools.length) setup.setup.tools = [{ functionDeclarations: this.o.tools }];

      ws.onopen = () => { ws.send(JSON.stringify(setup)); };
      ws.onerror = (e) => { this.o.onError && this.o.onError(e); if (!this.ready) reject(new Error("Live socket error")); };
      ws.onclose = (e) => {
        this.closed = true;
        this.o.onClose && this.o.onClose(e.reason || `code ${e.code}`);
        if (!this.ready) reject(new Error(`Live socket closed before setup: ${e.code} ${e.reason || ""}`));
      };
      ws.onmessage = async (ev) => {
        let text = ev.data;
        if (text instanceof Blob) text = await text.text();
        let msg; try { msg = JSON.parse(text); } catch { return; }
        if (msg.setupComplete) { this.ready = true; this.o.onOpen && this.o.onOpen(); resolve(); return; }
        if (msg.toolCall && msg.toolCall.functionCalls) { this.o.onToolCall && this.o.onToolCall(msg.toolCall.functionCalls); return; }
        if (msg.goAway) { this.o.onClose && this.o.onClose("goAway"); return; }
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.interrupted) { this.o.onInterrupted && this.o.onInterrupted(); }
        if (sc.inputTranscription && sc.inputTranscription.text) this.o.onInputText && this.o.onInputText(sc.inputTranscription.text);
        if (sc.outputTranscription && sc.outputTranscription.text) this.o.onOutputText && this.o.onOutputText(sc.outputTranscription.text);
        if (sc.modelTurn && sc.modelTurn.parts) {
          for (const p of sc.modelTurn.parts) {
            if (p.inlineData && p.inlineData.data) this.o.onAudio && this.o.onAudio(p.inlineData.data, p.inlineData.mimeType || "");
            if (p.text) this.o.onOutputText && this.o.onOutputText(p.text);
          }
        }
        if (sc.turnComplete) this.o.onTurnComplete && this.o.onTurnComplete();
      };
    });
  }

  _send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  sendAudio(b64) { this._send({ realtimeInput: { audio: { data: b64, mimeType: "audio/pcm;rate=16000" } } }); }
  sendVideoFrame(b64jpeg) { this._send({ realtimeInput: { video: { data: b64jpeg, mimeType: "image/jpeg" } } }); }
  audioStreamEnd() { this._send({ realtimeInput: { audioStreamEnd: true } }); }
  // Text turn. turnComplete=true interrupts any generation in progress.
  sendText(text, role = "user") { this._send({ clientContent: { turns: [{ role, parts: [{ text }] }], turnComplete: true } }); }
  sendToolResponse(responses) { this._send({ toolResponse: { functionResponses: responses } }); }
  close() { this.closed = true; try { this.ws && this.ws.close(); } catch {} }
}
