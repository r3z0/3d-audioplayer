// src/audio.js
// Lightweight Web Audio helper: file/mic input, analyser (fft), onset flags, bands,
// play/pause/toggle, seek, volume, sensitivity. No external deps.

export class AudioReactive {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.sourceNode = null;
    this.media = { el: null, src: null, stream: null };

    // graph
    this.analyser = null;   // visual tap (pre-volume)
    this.data = null;
    this.fftSize = 2048;

    // state
    this._title = 'No track';
    this._state = 'stopped'; // 'running' | 'paused' | 'stopped'
    this._isSeekable = false;
    this._duration = 0;

    // bands / onset
    this.sensitivity = 1.0;
    this._lastOnset = { kick: false, snare: false, hat: false, any: false };

    // temp buffers
    this._timeData = null;
    this._spectrum = null;
  }

  async _ensureCtx() {
    if (!this.ctx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.gain = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this._timeData = new Float32Array(this.analyser.fftSize);
      this._spectrum = new Uint8Array(this.analyser.frequencyBinCount);
      this.gain.gain.value = 0.8;

      // master
      this.analyser.connect(this.gain);
      this.gain.connect(ctx.destination);
    }
  }

  // ----------------- Inputs -----------------
  async useFile(file, onProgress) {
    await this._ensureCtx();

    // Clean mic if active
    if (this.isMicActive && this.isMicActive()) await this.stopMic();

    // Build media element
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.src = url;
    el.loop = false;
    el.preload = 'auto';
    el.addEventListener('canplay', ()=> {
      this._duration = Number.isFinite(el.duration) ? el.duration : 0;
      this._isSeekable = isFinite(this._duration) && this._duration > 0;
    });

    // Optional fake progress (browser hides decode progress)
    if (onProgress) {
      let p = 0;
      const id = setInterval(()=> {
        p = Math.min(100, p + 5 + Math.random()*7);
        onProgress(p|0);
        if (p >= 100) clearInterval(id);
      }, 80);
    }

    await el.play().catch(()=>{}); // kick decode

    // Hook graph
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.analyser);

    // Swap current source
    this._disconnectSource();
    this.sourceNode = src;
    this.media = { el, src: url, stream: null };
    this._title = file.name || 'Audio file';
    this._state = 'running';

    // Autoplay with user gesture contexts:
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    el.play().catch(()=>{}); // ignore autoplay fail; user can press Play
  }

  async useMic() {
    await this._ensureCtx();
    // stop element if any
    if (this.media?.el) { try { this.media.el.pause(); } catch {} }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(this.analyser);

    this._disconnectSource();
    this.sourceNode = src;
    this.media = { el: null, src: null, stream };
    this._title = 'Microphone';
    this._isSeekable = false;
    this._duration = 0;
    this._state = 'running';
  }

  async stopMic() {
    if (this.media?.stream) {
      this.media.stream.getTracks().forEach(t => t.stop());
      this.media.stream = null;
      this._state = 'stopped';
    }
  }

  _disconnectSource() {
    if (this.sourceNode && this.sourceNode.disconnect) {
      try { this.sourceNode.disconnect(); } catch {}
    }
    // release element url
    if (this.media?.src) {
      try { URL.revokeObjectURL(this.media.src); } catch {}
    }
  }

  // ----------------- Transport -----------------
  async toggle() {
    if (!this.ctx) return;
    if (this.media?.el) {
      if (this._state === 'running') { this.media.el.pause(); this._state = 'paused'; }
      else { if (this.ctx.state === 'suspended') await this.ctx.resume(); await this.media.el.play(); this._state = 'running'; }
    } else if (this.media?.stream) {
      // mic cannot pause; just mark state
      this._state = (this._state === 'running') ? 'paused' : 'running';
    }
  }
  seek(t) { if (this.media?.el && Number.isFinite(t)) { try { this.media.el.currentTime = Math.max(0, t); } catch {} } }
  getCurrentTime() { return this.media?.el ? (this.media.el.currentTime || 0) : 0; }
  getDuration() { return this._duration || (this.media?.el?.duration || 0); }
  isSeekable() { return !!this._isSeekable; }
  getTitle() { return this._title; }
  getState() { return this._state; }
  isActive() { return !!this.sourceNode; }
  isMicActive() { return !!this.media?.stream; }

  setVolume(v) { if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v)); }
  getVolume() { return this.gain ? this.gain.gain.value : 0; }
  setSensitivity(s) { this.sensitivity = Math.max(0.1, Math.min(4, s)); }

  // ----------------- Analysis -----------------
  getSpectrumArray() {
    if (!this.analyser) return new Uint8Array(0);
    this.analyser.getByteFrequencyData(this._spectrum);
    return this._spectrum;
    // NOTE: caller should not hold this buffer long-term
  }

  // return { overall, bass, mid, treble } in 0..1
  getBands() {
    const spec = this.getSpectrumArray();
    if (!spec.length) return { overall:0, bass:0, mid:0, treble:0 };

    const len = spec.length;
    const band = (from, to) => {
      let s=0,c=0;
      for (let i=from;i<to;i++){ s += spec[i]; c++; }
      return c? (s/c)/255 : 0;
    };
    // simple bins
    const bass   = band(  0, Math.floor(len*0.10));
    const mid    = band(Math.floor(len*0.10), Math.floor(len*0.45));
    const treble = band(Math.floor(len*0.45), len);
    const overall = (bass*0.5 + mid*0.35 + treble*0.15);
    const s = this.sensitivity;
    return { overall: overall*s, bass: bass*s, mid: mid*s, treble: treble*s };
  }

  // very lightweight onset flags (kick/snare/hat) — heuristics
  getOnsets() {
    if (!this.analyser) return { kick:false, snare:false, hat:false, any:false };
    // get time-domain for zero-crossing / transient-ish detection
    this.analyser.getFloatTimeDomainData(this._timeData);
    // RMS + simple band spikes
    const spec = this._spectrum; // already filled in getBands()
    const n = this._timeData.length;
    let rms=0; for (let i=0;i<n;i++){ const v=this._timeData[i]; rms += v*v; }
    rms = Math.sqrt(rms/n);

    const len = spec.length;
    const pick = (a,b)=> {
      let m=0; for (let i=a;i<b;i++) m = Math.max(m, spec[i]||0);
      return m/255;
    };
    const bass   = pick(0, Math.floor(len*0.10));
    const mid    = pick(Math.floor(len*0.10), Math.floor(len*0.45));
    const treble = pick(Math.floor(len*0.45), len);

    const k = bass > 0.55 && rms > 0.05;
    const s = mid  > 0.55 && rms > 0.035;
    const h = treble > 0.55 && rms > 0.02;

    const out = { kick:k, snare:s, hat:h, any: k||s||h };
    this._lastOnset = out;
    return out;
  }
}
