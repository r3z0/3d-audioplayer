// src/audio.js
export class AudioReactive {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.sourceNode = null;
    this.media = { el: null, src: null, stream: null };

    this.analyser = null;
    this.data = null;
    this.fftSize = 2048;

    this._title = 'No track';
    this._state = 'stopped';
    this._isSeekable = false;
    this._duration = 0;

    this.sensitivity = 1.0;
    this._lastOnset = { kick:false, snare:false, hat:false, any:false };

    this._timeData = null;
    this._spectrum = null;
    this.hpf = null;
    this.lpf = null;
    this.filters = [];
    this.eqFreqs = [];
  }

  async _ensureCtx() {
    if (!this.ctx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.gain = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;
      this._timeData = new Float32Array(this.analyser.fftSize);
      this._spectrum = new Uint8Array(this.analyser.frequencyBinCount);
      this.gain.gain.value = 0.8;

        // create HPF/LPF and EQ filters
        this.hpf = ctx.createBiquadFilter();
        this.hpf.type = 'highpass';
        this.hpf.frequency.value = 20;
        this.hpf.Q.value = 0.707;

        this.lpf = ctx.createBiquadFilter();
        this.lpf.type = 'lowpass';
        this.lpf.frequency.value = 20000;
        this.lpf.Q.value = 0.707;

        const freqs = [32,64,125,250,500,1000,2000,4000,8000,16000];
        this.eqFreqs = freqs;
        this.filters = freqs.map(f => {
          const bi = ctx.createBiquadFilter();
          bi.type = 'peaking';
          bi.frequency.value = f;
          bi.Q.value = 1.0;
          bi.gain.value = 0;
          return bi;
        });
        // chain filters: hpf -> filters -> lpf -> analyser -> gain -> destination
        let prev = this.hpf;
        this.filters.forEach(f => { prev.connect(f); prev = f; });
        prev.connect(this.lpf);
        this.lpf.connect(this.analyser);
        this.analyser.connect(this.gain);
        this.gain.connect(ctx.destination);
      }
    }

  async useFile(file, onProgress) {
    await this._ensureCtx();
    if (this.isMicActive && this.isMicActive()) await this.stopMic();

    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.src = url;
    el.preload = 'auto';
    el.loop = false;
    el.addEventListener('canplay', ()=> {
      this._duration = Number.isFinite(el.duration) ? el.duration : 0;
      this._isSeekable = isFinite(this._duration) && this._duration > 0;
    });

    if (onProgress) {
      let p = 0;
      const id = setInterval(()=> {
        p = Math.min(100, p + 5 + Math.random()*7);
        onProgress(p|0);
        if (p >= 100) clearInterval(id);
      }, 80);
    }

    await el.play().catch(()=>{});
      const src = this.ctx.createMediaElementSource(el);
      const target = this.hpf || this.filters[0] || this.analyser;
      src.connect(target);

    this._disconnectSource();
    this.sourceNode = src;
    this.media = { el, src: url, stream: null };
    this._title = file.name || 'Audio file';
    this._state = 'running';

    if (this.ctx.state === 'suspended') await this.ctx.resume();
    el.play().catch(()=>{});
  }

  async useMic() {
    await this._ensureCtx();
    if (this.media?.el) { try { this.media.el.pause(); } catch {} }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const src = this.ctx.createMediaStreamSource(stream);
      const target = this.hpf || this.filters[0] || this.analyser;
      src.connect(target);

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
    if (this.media?.src) { try { URL.revokeObjectURL(this.media.src); } catch {} }
  }

  async toggle() {
    if (!this.ctx) return;
    if (this.media?.el) {
      if (this._state === 'running') { this.media.el.pause(); this._state = 'paused'; }
      else { if (this.ctx.state === 'suspended') await this.ctx.resume(); await this.media.el.play(); this._state = 'running'; }
    } else if (this.media?.stream) {
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

  setEqGain(band, dB) {
    if (!this.filters?.length) return;
    const f = this.filters[band];
    if (f) f.gain.value = Math.max(-12, Math.min(12, dB));
  }

  getEqSettings(){
    return this.filters?.map(f => f.gain.value) || [];
  }

  setHighpass(freq){ if (this.hpf) this.hpf.frequency.value = Math.max(20, Math.min(1000, freq)); }
  setLowpass(freq){ if (this.lpf) this.lpf.frequency.value = Math.min(this.ctx?.sampleRate/2 || 22050, Math.max(1000, freq)); }
  getCutSettings(){ return { hpf: this.hpf?.frequency.value || 0, lpf: this.lpf?.frequency.value || 0 }; }
  getEqFreqs(){ return this.eqFreqs; }

  getSpectrumArray() {
    if (!this.analyser) return new Uint8Array(0);
    this.analyser.getByteFrequencyData(this._spectrum);
    return this._spectrum;
  }

  getTimeDomainArray() {
    if (!this.analyser) return new Float32Array(0);
    this.analyser.getFloatTimeDomainData(this._timeData);
    return this._timeData;
  }

  getBands() {
    const spec = this.getSpectrumArray();
    if (!spec.length) return { overall:0, bass:0, mid:0, treble:0 };

    const len = spec.length;
    const band = (from, to) => {
      let s=0,c=0; for (let i=from;i<to;i++){ s += spec[i]; c++; }
      return c? (s/c)/255 : 0;
    };
    const bass   = band(0, Math.floor(len*0.10));
    const mid    = band(Math.floor(len*0.10), Math.floor(len*0.45));
    const treble = band(Math.floor(len*0.45), len);
    const overall = (bass*0.5 + mid*0.35 + treble*0.15);
    const s = this.sensitivity;
    return { overall: overall*s, bass: bass*s, mid: mid*s, treble: treble*s };
  }

  getOnsets() {
    if (!this.analyser) return { kick:false, snare:false, hat:false, any:false };
    this.analyser.getFloatTimeDomainData(this._timeData);
    const spec = this._spectrum;
    const n = this._timeData.length;
    let rms=0; for (let i=0;i<n;i++){ const v=this._timeData[i]; rms += v*v; }
    rms = Math.sqrt(rms/n);

    const len = spec.length;
    const pick = (a,b)=>{ let m=0; for (let i=a;i<b;i++) m=Math.max(m, spec[i]||0); return m/255; };
    const bass   = pick(0, Math.floor(len*0.10));
    const mid    = pick(Math.floor(len*0.10), Math.floor(len*0.45));
    const treble = pick(Math.floor(len*0.45), len);

    const k = bass > 0.55 && rms > 0.05;
    const s = mid  > 0.55 && rms > 0.035;
    const h = treble > 0.55 && rms > 0.02;

    return { kick:k, snare:s, hat:h, any: k||s||h };
  }
}
