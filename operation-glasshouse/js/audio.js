// Mic capture (16 kHz PCM16 base64 chunks) and 24 kHz PCM playback with barge-in support.

const WORKLET_SRC = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const out = new Int16Array(ch.length);
    let sum = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      sum += s * s;
    }
    this.port.postMessage({ pcm: out.buffer, rms: Math.sqrt(sum / ch.length) }, [out.buffer]);
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
`;

export function b64FromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function bufferFromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export class Mic {
  constructor() {
    this.ctx = null; this.stream = null; this.node = null;
    this.onChunk = null; this.onLevel = null;
    this.muted = false; this.pending = []; this.pendingLen = 0;
    this.speaking = false; this.lastVoiceAt = 0; this.onVoiceStart = null; this.onVoiceEnd = null;
    this.threshold = 0.02;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-processor");
    this.node.port.onmessage = (e) => this._onFrame(e.data);
    src.connect(this.node);
    // Keep the graph alive without routing mic to speakers.
    const sink = this.ctx.createGain(); sink.gain.value = 0;
    this.node.connect(sink); sink.connect(this.ctx.destination);
  }
  _onFrame({ pcm, rms }) {
    if (this.onLevel) this.onLevel(rms);
    const now = performance.now();
    if (rms > this.threshold) {
      this.lastVoiceAt = now;
      if (!this.speaking) { this.speaking = true; this.onVoiceStart && this.onVoiceStart(now); }
    } else if (this.speaking && now - this.lastVoiceAt > 700) {
      this.speaking = false; this.onVoiceEnd && this.onVoiceEnd(now);
    }
    if (this.muted) return;
    this.pending.push(new Int16Array(pcm));
    this.pendingLen += pcm.byteLength / 2;
    if (this.pendingLen >= 2048) {
      const merged = new Int16Array(this.pendingLen);
      let o = 0;
      for (const p of this.pending) { merged.set(p, o); o += p.length; }
      this.pending = []; this.pendingLen = 0;
      this.onChunk && this.onChunk(b64FromBuffer(merged.buffer));
    }
  }
  setMuted(m) { this.muted = m; }
  async resume() { if (this.ctx && this.ctx.state !== "running") await this.ctx.resume(); }
  stop() {
    try { this.node && this.node.disconnect(); } catch {}
    try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch {}
    try { this.ctx && this.ctx.close(); } catch {}
    this.ctx = null; this.stream = null; this.node = null;
  }
}

export class Player {
  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.nextTime = 0; this.sources = new Set(); this.onIdle = null; this._idleTimer = null;
    this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination);
  }
  async resume() { if (this.ctx.state !== "running") await this.ctx.resume(); }
  enqueueB64(b64, rate = 24000) {
    const i16 = new Int16Array(bufferFromB64(b64));
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
    const buf = this.ctx.createBuffer(1, f32.length, rate);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.connect(this.gain);
    const t = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
    src.start(t);
    this.nextTime = t + buf.duration;
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); this._checkIdle(); };
  }
  _checkIdle() {
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => { if (this.sources.size === 0 && this.onIdle) this.onIdle(); }, 120);
  }
  get playing() { return this.sources.size > 0; }
  interrupt() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear(); this.nextTime = 0;
  }
  // Simple synthesized sounds so the prototype has no external assets.
  ringtone(seconds = 2.2) {
    const t0 = this.ctx.currentTime;
    for (let r = 0; r < 2; r++) {
      const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
      osc.type = "square"; osc.frequency.value = 880;
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
      lfo.frequency.value = 20; lg.gain.value = 300; lfo.connect(lg); lg.connect(osc.frequency);
      g.gain.setValueAtTime(0, t0 + r * 1.2); g.gain.linearRampToValueAtTime(0.08, t0 + r * 1.2 + 0.05);
      g.gain.setValueAtTime(0.08, t0 + r * 1.2 + 0.7); g.gain.linearRampToValueAtTime(0, t0 + r * 1.2 + 0.8);
      osc.connect(g); g.connect(this.gain); osc.start(t0 + r * 1.2); lfo.start(t0 + r * 1.2);
      osc.stop(t0 + r * 1.2 + 0.85); lfo.stop(t0 + r * 1.2 + 0.85);
    }
    return new Promise(res => setTimeout(res, seconds * 1000));
  }
  dialTone() { this._beep(440, 0.25, 0.05); }
  hangupTone() { this._beep(320, 0.12, 0.06); setTimeout(() => this._beep(240, 0.18, 0.06), 140); }
  alarm() { this._beep(160, 0.5, 0.12, "sawtooth"); }
  _beep(freq, dur, vol, type = "sine") {
    const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + dur);
  }
}
