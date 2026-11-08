// Webcam + MediaPipe Face Landmarker. Aggregates facial "tells" over a window and captures JPEG frames.
const MP_VERSION = "0.10.14";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export class FaceTracker {
  constructor(videoEl) {
    this.video = videoEl; this.landmarker = null; this.stream = null; this.running = false;
    this.samples = []; this.collecting = false; this.onTells = null;
    this.canvas = document.createElement("canvas"); this.canvas.width = 320; this.canvas.height = 240;
    this.lastSmile = 0; this.smileSpikes = 0; this.lastEyeX = 0; this.eyeFlips = 0; this.lastEyeDir = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
    this.video.srcObject = this.stream;
    await this.video.play();
    const { FaceLandmarker, FilesetResolver } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    this.landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO", numFaces: 1,
      outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    });
    this.running = true;
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    const tick = () => {
      if (!this.running) return;
      try {
        if (this.video.readyState >= 2) {
          const res = this.landmarker.detectForVideo(this.video, performance.now());
          this._ingest(res);
        }
      } catch {}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _ingest(res) {
    const present = res && res.faceBlendshapes && res.faceBlendshapes.length > 0;
    const s = { t: performance.now(), present, gaze: 0, brow: 0, lip: 0, smile: 0, yaw: 0, jaw: 0 };
    if (present) {
      const m = {};
      for (const c of res.faceBlendshapes[0].categories) m[c.categoryName] = c.score;
      const g = (k) => m[k] || 0;
      s.gaze = Math.max(g("eyeLookOutLeft"), g("eyeLookOutRight"), g("eyeLookDownLeft"), g("eyeLookDownRight"), g("eyeLookInLeft"), g("eyeLookInRight"));
      s.brow = (g("browDownLeft") + g("browDownRight")) / 2;
      s.lip = (g("mouthPressLeft") + g("mouthPressRight")) / 2;
      s.smile = (g("mouthSmileLeft") + g("mouthSmileRight")) / 2;
      s.jaw = g("jawOpen");
      const mat = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
      if (mat && mat.data) { const d = mat.data; s.yaw = Math.atan2(d[8], d[10]) * 180 / Math.PI; }
      // micro-smile spike detection (duping delight): fast rise then fall
      if (s.smile - this.lastSmile > 0.25) this.smileSpikes++;
      this.lastSmile = s.smile;
      // reading tell: lateral eye direction flipping quickly
      const eyeX = g("eyeLookOutLeft") - g("eyeLookOutRight");
      const dir = Math.sign(eyeX - this.lastEyeX);
      if (dir !== 0 && dir !== this.lastEyeDir && Math.abs(eyeX - this.lastEyeX) > 0.08) this.eyeFlips++;
      if (dir !== 0) this.lastEyeDir = dir;
      this.lastEyeX = eyeX;
    }
    if (this.collecting) this.samples.push(s);
    this._liveTells(s);
  }

  _liveTells(s) {
    if (!this.onTells) return;
    const tells = [];
    if (!s.present) tells.push("face off camera");
    else {
      if (s.gaze > 0.55) tells.push("looking away");
      if (s.brow > 0.45) tells.push("brow furrow");
      if (s.lip > 0.4) tells.push("lip press");
      if (Math.abs(s.yaw) > 25) tells.push("head turned");
    }
    this.onTells(tells);
  }

  beginWindow() { this.samples = []; this.smileSpikes = 0; this.eyeFlips = 0; this.collecting = true; }
  endWindow() {
    this.collecting = false;
    const n = this.samples.length;
    if (!n) return null;
    const avg = (k) => this.samples.reduce((a, s) => a + (s[k] || 0), 0) / n;
    const frac = (f) => this.samples.filter(f).length / n;
    const seconds = Math.max(0.5, (this.samples[n - 1].t - this.samples[0].t) / 1000);
    return {
      face_missing: +frac(s => !s.present).toFixed(2),
      gaze_aversion: +frac(s => s.present && s.gaze > 0.5).toFixed(2),
      brow_furrow: +avg("brow").toFixed(2),
      lip_press: +avg("lip").toFixed(2),
      head_turn_away: +frac(s => s.present && Math.abs(s.yaw) > 25).toFixed(2),
      duping_delight: +Math.min(1, this.smileSpikes / 3).toFixed(2),
      reading_tell: +Math.min(1, this.eyeFlips / (seconds * 3)).toFixed(2),
      window_seconds: +seconds.toFixed(1),
    };
  }

  captureJpegB64() {
    if (!this.video || this.video.readyState < 2) return null;
    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
  }

  stop() {
    this.running = false;
    try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch {}
    try { this.landmarker && this.landmarker.close(); } catch {}
    this.stream = null; this.landmarker = null;
  }
}
