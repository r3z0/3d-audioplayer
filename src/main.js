import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

import { AudioReactive } from './audio.js';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

// ---------- Renderer ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05122f, 1);
app.appendChild(renderer.domElement);

// ---------- Scene / Camera ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06122c, 0.06);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0.9, 6.2);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.0;
controls.maxDistance = 14.0;
controls.enablePan = true;
controls.target.set(0, 0.6, 0);
controls.update();

// ---------- Background specks ----------
const speckCount = 4000;
const speckGeo = new THREE.BufferGeometry();
const stars = new Float32Array(speckCount * 3);
for (let i = 0; i < speckCount; i++) {
  const r = 20 * Math.pow(Math.random(), 0.8);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  stars[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  stars[i * 3 + 1] = THREE.MathUtils.randFloatSpread(8);
  stars[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
speckGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
const speckMat = new THREE.PointsMaterial({
  size: 0.03, color: 0x87b7ff, transparent: true, opacity: 0.7,
  depthWrite: false, blending: THREE.AdditiveBlending
});
const specks = new THREE.Points(speckGeo, speckMat);
scene.add(specks);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x203050, 0.4));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(5, 8, 6);
scene.add(dir);

// ---------- PostFX ----------
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, 0.85, 0.0
);
composer.addPass(bloomPass);

// Film grain (very subtle)
const filmPass = new FilmPass(
  /* noise intensity */ 0.18,
  /* scanline intensity */ 0.06,
  /* scanline count */ 648,
  /* grayscale */ false
);
composer.addPass(filmPass);

// Tiny chromatic aberration via RGB shift
const rgbShift = new ShaderPass(RGBShiftShader);
rgbShift.uniforms['amount'].value = 0.0009; // tiny!
composer.addPass(rgbShift);

// FXAA (last)
const fxaaPass = new ShaderPass(FXAAShader);
function setFXAAResolution() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  fxaaPass.uniforms['resolution'].value.set(1 / (window.innerWidth * dpr), 1 / (window.innerHeight * dpr));
}
setFXAAResolution();
composer.addPass(fxaaPass);

// ---------- Audio ----------
const audio = new AudioReactive();

// HUD refs
const micBtn = document.getElementById('micBtn');
const fileInput = document.getElementById('fileInput');
const playBtn = document.getElementById('playBtn');
const loopBtn = document.getElementById('loopBtn');
const scrubber = document.getElementById('scrubber');
const timeNow = document.getElementById('timeNow');
const timeRemain = document.getElementById('timeRemain');
const volume = document.getElementById('volume');
const volumeKnob = document.getElementById('volumeKnob');
const vuMeter = document.getElementById('vuMeter');
const volPct = document.getElementById('volPct');
const knobCtx = volumeKnob.getContext?.('2d');
const vuCtx = vuMeter.getContext?.('2d');
const trackTitle = document.getElementById('trackTitle');
const trackStatus = document.getElementById('trackStatus');
const miniSpec = document.getElementById('miniSpec');
const miniWave = document.getElementById('miniWave');
const specCtx  = miniSpec.getContext('2d');
const waveCtx  = miniWave.getContext('2d');
const dropzone = document.getElementById('dropzone');
const coverModal = document.getElementById('coverModal');
const coverModalImg = coverModal?.querySelector('img');
coverModal?.addEventListener('click', e => {
  if (e.target === coverModal) coverModal.style.display = 'none';
});
const btnFS = document.getElementById('btnFullscreen');
const btnSettings = document.getElementById('btnSettings');
const btnBeatConfig = document.getElementById('btnBeatConfig');
const smoothToggle = document.getElementById('smoothToggle');
let smoothTransition = false;
let loopMode = 'none'; // 'none' | 'playlist' | 'track'

// LEDs
const ledSub     = document.getElementById('ledSub');
const ledBass    = document.getElementById('ledBass');
const ledLowMid  = document.getElementById('ledLowMid');
const ledHighMid = document.getElementById('ledHighMid');
const ledHat     = document.getElementById('ledHat');
const ledRefs = { sub: ledSub, bass: ledBass, lowMid: ledLowMid, highMid: ledHighMid, hat: ledHat };
const ledTimers = { sub: 0, bass: 0, lowMid: 0, highMid: 0, hat: 0 };
const LED_RANGES = {
  sub: [40, 80],
  bass: [80, 200],
  lowMid: [200, 600],
  highMid: [2000, 5000],
  hat: [6000, 16000],
};
const LED_THRESHOLDS = { sub: 0.6, bass: 0.6, lowMid: 0.5, highMid: 0.5, hat: 0.45 };
function bumpLED(which, seconds=0.15){ ledTimers[which] = Math.max(ledTimers[which], seconds); }
function updateLEDs(dt){
  for (const k in ledTimers) ledTimers[k] = Math.max(0, ledTimers[k] - dt);
  for (const k in ledRefs) {
    const el = ledRefs[k];
    el.classList.toggle('on', ledTimers[k] > 0);
    el.classList.toggle('off', !(ledTimers[k] > 0));
  }
}

// ---------- Playlist panel (IndexedDB persistence) ----------
const playlistTpl = document.createElement('template');
playlistTpl.innerHTML = `
  <div id="playlistPanel" class="fixed right-3 top-3 z-[1000] w-64 max-h-[46vh] overflow-auto bg-slate-900/70 backdrop-blur text-blue-50 text-xs font-sans rounded-xl shadow-xl p-2.5">
    <div class="flex gap-1.5 items-center mb-1.5">
      <strong class="flex-1">Playlist</strong>
      <button id="pl-prev" title="Prev">⏮</button>
      <button id="pl-next" title="Next">⏭</button>
      <button id="pl-save" title="Save playlist">💾</button>
      <button id="pl-load" title="Load playlist">📂</button>
    </div>
    <div class="flex gap-1.5 mb-1.5">
      <input id="pl-file" type="file" accept="audio/*" multiple class="flex-1" />
    </div>
    <ul id="pl-list" class="list-none p-0 m-0 grid gap-1.5"></ul>
    <div class="mt-1.5 opacity-80 text-[11px]">Tip: drag items to reorder • N/P keys</div>
  </div>
`;
const playlistPanel = playlistTpl.content.firstElementChild;
document.body.appendChild(playlistPanel);

const hud = document.getElementById('appControls');
const btnPlaylist = document.getElementById('btnPlaylist');

drawVolumeKnob(parseFloat(volume.value||'0'));

function positionPlaylist() {
  const rect = hud.getBoundingClientRect();
  playlistPanel.style.top = `${rect.bottom + 12}px`;
}

positionPlaylist();
window.addEventListener('resize', positionPlaylist);

btnPlaylist?.addEventListener('click', () => {
  playlistPanel.hidden = !playlistPanel.hidden;
  if (!playlistPanel.hidden) positionPlaylist();
});

const plInput = playlistPanel.querySelector('#pl-file');
const plList  = playlistPanel.querySelector('#pl-list');
const plPrev  = playlistPanel.querySelector('#pl-prev');
const plNext  = playlistPanel.querySelector('#pl-next');
const plSave  = playlistPanel.querySelector('#pl-save');
const plLoad  = playlistPanel.querySelector('#pl-load');

function showCoverModal(url){
  if (!coverModal || !coverModalImg) return;
  coverModalImg.src = url;
  coverModal.style.display = 'flex';
}

let playlist = []; // [{name, file(Blob), id}]
let currentIndex = -1;
const FADE_TIME = 0.5;

async function makePlaylistItem(file){
  const it = {
    name: file.name,
    title: file.name,
    artist: '',
    file,
    id: crypto.randomUUID?.() || String(Math.random())
  };
  try {
    const tag = await new Promise((resolve, reject) => {
      jsmediatags.read(file, {
        onSuccess: resolve,
        onError: reject
      });
    });
    it.title = tag?.tags?.title || it.name;
    it.artist = tag?.tags?.artist || '';
    const pic = tag?.tags?.picture;
    if (pic) {
      const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
      it.coverUrl = URL.createObjectURL(blob);
    }
  } catch(err){
    console.warn('tag read failed', err);
  }
  return it;
}

// ---------- IndexedDB helpers ----------
const DB_NAME = 'three-audio-starter';
const DB_STORE = 'playlist';

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e=>{
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function savePlaylistToDB(){
  const db = await openDB();
  const tx = db.transaction(DB_STORE, 'readwrite');
  const st = tx.objectStore(DB_STORE);
  // store a single doc under id 'tracks'
  const data = await Promise.all(playlist.map(async p=>{
    // ensure Blob (File is Blob subclass)
    return { name: p.name, id: p.id, blob: p.file };
  }));
  await new Promise((res, rej)=>{
    st.put({ id: 'tracks', items: data }).onsuccess = ()=>res(); st.onerror = ()=>rej(st.error);
  });
  tx.oncomplete = ()=> db.close();
  console.log('Playlist saved:', playlist.length, 'items');
}
async function loadPlaylistFromDB(){
  const db = await openDB();
  const tx = db.transaction(DB_STORE, 'readonly');
  const st = tx.objectStore(DB_STORE);
  const { items } = await new Promise((res, rej)=>{
    const req = st.get('tracks');
    req.onsuccess = ()=> res(req.result || { items: [] });
    req.onerror = ()=> rej(req.error);
  });
  db.close();
  playlist = (items || []).map(r => ({
    name: r.name,
    title: r.name,
    artist: '',
    id: r.id,
    file: r.blob // Blob (or File)
  }));
  renderPlaylist();
  if (playlist.length && currentIndex < 0) await playIndex(0);
}

// ---------- Playlist UI ----------
function formatTime(sec){
  if(!isFinite(sec)) return '--:--';
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}
function buildPlaylistItem(it, idx){
  const li = document.createElement('li');
  li.draggable = true;
  li.dataset.idx = idx.toString();
  li.className = 'flex items-center gap-2 p-1.5 rounded-lg';
  if (idx === currentIndex) li.classList.add('bg-indigo-500/30');
  else li.classList.add('bg-white/5', 'hover:bg-white/10');

  const durStr = typeof it.duration === 'number' ? formatTime(it.duration) : '--:--';

  if (it.coverUrl) {
    const img = document.createElement('img');
    img.src = it.coverUrl;
    img.alt = '';
    img.className = 'w-10 h-10 object-cover rounded cursor-pointer flex-shrink-0';
    img.addEventListener('click', e => { e.stopPropagation(); showCoverModal(it.coverUrl); });
    li.appendChild(img);
  }

  const info = document.createElement('div');
  info.className = 'flex-1 overflow-hidden';
  const titleDiv = document.createElement('div');
  titleDiv.className = 'text-sm font-medium truncate';
  titleDiv.textContent = it.title || it.name;
  const artistDiv = document.createElement('div');
  artistDiv.className = 'text-xs text-slate-300 truncate';
  artistDiv.textContent = it.artist || '';
  info.append(titleDiv, artistDiv);
  li.appendChild(info);

  const durDiv = document.createElement('div');
  durDiv.className = 'text-xs text-slate-300 tabular-nums';
  durDiv.textContent = durStr;
  li.appendChild(durDiv);

  const actions = document.createElement('div');
  actions.className = 'flex gap-1 ml-2';
  const btns = [
    { act: 'play', label: '▶', title: 'Play' },
    { act: 'up', label: '↑', title: 'Move up' },
    { act: 'down', label: '↓', title: 'Move down' },
    { act: 'del', label: '✕', title: 'Remove' }
  ];
  btns.forEach(b => {
    const btn = document.createElement('button');
    btn.dataset.act = b.act;
    btn.title = b.title;
    btn.textContent = b.label;
    btn.className = 'px-1 text-sm hover:text-white';
    actions.appendChild(btn);
  });
  li.appendChild(actions);

  li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', idx.toString()); });
  li.addEventListener('dragover', e => { e.preventDefault(); });
  li.addEventListener('drop', async e => {
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const to = idx;
    if (from === to) return;
    const item = playlist.splice(from, 1)[0];
    playlist.splice(to, 0, item);
    if (currentIndex === from) currentIndex = to;
    else if (from < currentIndex && to >= currentIndex) currentIndex--;
    else if (from > currentIndex && to <= currentIndex) currentIndex++;
    renderPlaylist();
    await savePlaylistToDB();
  });
  li.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'play') await playIndex(idx);
    if (act === 'del') {
      playlist.splice(idx, 1);
      if (idx === currentIndex) { currentIndex = -1; }
      else if (idx < currentIndex) { currentIndex--; }
      renderPlaylist();
      await savePlaylistToDB();
    }
    if (act === 'up' && idx > 0) {
      [playlist[idx - 1], playlist[idx]] = [playlist[idx], playlist[idx - 1]];
      if (currentIndex === idx) currentIndex = idx - 1;
      else if (currentIndex === idx - 1) currentIndex = idx;
      renderPlaylist();
      await savePlaylistToDB();
    }
    if (act === 'down' && idx < playlist.length - 1) {
      [playlist[idx + 1], playlist[idx]] = [playlist[idx], playlist[idx + 1]];
      if (currentIndex === idx) currentIndex = idx + 1;
      else if (currentIndex === idx + 1) currentIndex = idx;
      renderPlaylist();
      await savePlaylistToDB();
    }
  });
  li.addEventListener('dblclick', async e => {
    if (e.target.closest('button')) return;
    await playIndex(idx);
  });

  return li;
}

function renderPlaylist(){
  plList.innerHTML = '';
  playlist.forEach((it, idx) => {
    if (it.file && typeof it.duration !== 'number') {
      try {
        const audioEl = new Audio();
        audioEl.preload = 'metadata';
        const url = URL.createObjectURL(it.file);
        audioEl.src = url;
        audioEl.addEventListener('loadedmetadata', () => {
          it.duration = audioEl.duration;
          URL.revokeObjectURL(url);
          renderPlaylist();
        });
        audioEl.addEventListener('error', () => {
          URL.revokeObjectURL(url);
        });
      } catch(err){
        console.warn('duration load failed', err);
      }
    }
    plList.appendChild(buildPlaylistItem(it, idx));
  });
}

plInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const f of files) {
    const it = await makePlaylistItem(f);
    playlist.push(it);
  }
  renderPlaylist();
  if (currentIndex < 0) await playIndex(0);
  await savePlaylistToDB();
});
plPrev.addEventListener('click', async ()=>{ if (!playlist.length) return; const i=(currentIndex-1+playlist.length)%playlist.length; await playIndex(i); });
plNext.addEventListener('click', async ()=>{ if (!playlist.length) return; const i=(currentIndex+1)%playlist.length; await playIndex(i); });
plSave.addEventListener('click', savePlaylistToDB);
plLoad.addEventListener('click', loadPlaylistFromDB);

async function playIndex(i){
  const item = playlist[i]; if (!item) return;
  await audio._ensureCtx?.();
  const g = audio.gain?.gain;
  const startVol = audio.getVolume();

  if (smoothTransition && g && audio.media?.el){
    const now = audio.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(startVol, now);
    g.linearRampToValueAtTime(0, now + FADE_TIME);
    await new Promise(r=>setTimeout(r, FADE_TIME*1000));
    audio.media.el.removeEventListener('ended', handleTrackEnded);
  } else if (audio.media?.el){
    audio.media.el.removeEventListener('ended', handleTrackEnded);
  }

  if (audio.ctx && audio.ctx.state==='suspended') await audio.ctx.resume();
  setDropText('Song loading… 0%');
  // item.file can be Blob or File
  const f = item.file instanceof File ? item.file : new File([item.file], item.name, { type: item.file.type || 'audio/*' });

  try {
    await audio.useFile(f, p => {
      setDropText(`Song loading… ${p}%`);
      console.log(`Loading progress: ${p}%`);
      if(p>=100) hideDrop();
    })
    .then((f, p) => {
      currentIndex = i;
      renderPlaylist();
      updateHUDState();
      hideDrop();
      if (audio.media?.el) {
        audio.media.el.onended = () => {
          if (loopMode === 'track') {
            playIndex(currentIndex);
          } else if (loopMode === 'playlist') {
            const next = (currentIndex + 1) % playlist.length;
            playIndex(next);
          } else {
            const next = currentIndex + 1;
            if (next < playlist.length) {
              playIndex(next);
            }
          }
        };
      }
    })
    .catch(err => {
      console.error('Error loading song.', err);
    });
  } catch(err){
    console.error('Error loading song.', err);
    return;
  }

  currentIndex = i;
  renderPlaylist();
  updateHUDState();
  hideDrop();

  if (audio.media?.el) audio.media.el.addEventListener('ended', handleTrackEnded);

  if (smoothTransition && g){
    const now = audio.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(startVol, now + FADE_TIME);
  } else if (g){
    g.setValueAtTime(startVol, audio.ctx.currentTime);
  }
}

async function handleTrackEnded(){
  if (!playlist.length) return;
  const i = (currentIndex + 1) % playlist.length;
  await playIndex(i);
}

// Attempt to load saved playlist on start
loadPlaylistFromDB().catch(()=>{});

// ---------- Settings Panel ----------
const settings = {
  theme: 'deep',
  bloomStrength: 0.55,
  fogDensity: 0.06,
  fxaa: true,
  film: true,
  rgb: true,
  beatTimeline: false,
  beatThresholds: { kick: 0.6, snare: 0.5, hat: 0.45 },
  beatRanges: {
    kick: [40, 200],
    snare1: [120, 250],
    snare2: [2000, 5000],
    hat: [6000, 16000],
  },
};
const settingsPanel = document.getElementById('settingsPanel');
const themeSel = document.getElementById('themeSel');
const bloomStrength = document.getElementById('bloomStrength');
const bloomVal = document.getElementById('bloomVal');
const fogDensity = document.getElementById('fogDensity');
const fogVal = document.getElementById('fogVal');
const fxaaToggle = document.getElementById('fxaaToggle');
const filmToggle = document.getElementById('filmToggle');
const rgbToggle = document.getElementById('rgbToggle');
const beatToggle = document.getElementById('beatToggle');
const clearBeatsBtn = document.getElementById('clearBeats');
const beatPanel = document.getElementById('beatPanel');
const beatSave = document.getElementById('beatSave');
const beatCancel = document.getElementById('beatCancel');
const beatClose = document.getElementById('beatClose');
const kickFrom = document.getElementById('kickFrom');
const kickTo = document.getElementById('kickTo');
const kickTh = document.getElementById('kickTh');
const kickThVal = document.getElementById('kickThVal');
const snareLowFrom = document.getElementById('snareLowFrom');
const snareLowTo = document.getElementById('snareLowTo');
const snareHighFrom = document.getElementById('snareHighFrom');
const snareHighTo = document.getElementById('snareHighTo');
const snareTh = document.getElementById('snareTh');
const snareThVal = document.getElementById('snareThVal');
const hatFrom = document.getElementById('hatFrom');
const hatTo = document.getElementById('hatTo');
const hatTh = document.getElementById('hatTh');
const hatThVal = document.getElementById('hatThVal');
const eqSliders = Array.from(document.querySelectorAll('.eq-slider'));
const eqPresetBtns = Array.from(document.querySelectorAll('.eq-preset'));

const hpfSlider = document.getElementById('hpfSlider');
const lpfSlider = document.getElementById('lpfSlider');
const hpfAudioToggle = document.getElementById('hpfAudioToggle');
const hpfLedToggle = document.getElementById('hpfLedToggle');
const lpfAudioToggle = document.getElementById('lpfAudioToggle');
const lpfLedToggle = document.getElementById('lpfLedToggle');
const eqOverlayToggle = document.getElementById('eqOverlayToggle');
const eqAudioToggle = document.getElementById('eqAudioToggle');
const eqLedToggle = document.getElementById('eqLedToggle');

const EQ_PRESETS = {
  flat: new Array(10).fill(0),
  rock: [4,3,2,1,0,0,1,2,3,4],
  pop:  [-1,0,1,3,5,3,1,0,-1,-2]
};


function applyEqGains(values){
  values.forEach((v,i)=>{
    if(eqSliders[i]){
      eqSliders[i].value = v;
      audio.setEqGain(i, parseFloat(v));
    }
  });
}

function applyEq(data){
  applyEqGains(data.gains || EQ_PRESETS.flat);
  if(hpfSlider){
    hpfSlider.value = data.hpf?.freq ?? 20;
    audio.setHighpass(parseFloat(hpfSlider.value));
  }
  if(hpfAudioToggle){
    hpfAudioToggle.checked = data.hpf?.audio ?? true;
    audio.setHpfAudioEnabled(hpfAudioToggle.checked);
  }
  if(hpfLedToggle){
    hpfLedToggle.checked = data.hpf?.led ?? true;
    audio.setHpfLedEnabled(hpfLedToggle.checked);
  }
  if(lpfSlider){
    lpfSlider.value = data.lpf?.freq ?? 20000;
    audio.setLowpass(parseFloat(lpfSlider.value));
  }
  if(lpfAudioToggle){
    lpfAudioToggle.checked = data.lpf?.audio ?? true;
    audio.setLpfAudioEnabled(lpfAudioToggle.checked);
  }
  if(lpfLedToggle){
    lpfLedToggle.checked = data.lpf?.led ?? true;
    audio.setLpfLedEnabled(lpfLedToggle.checked);
  }
  if(eqOverlayToggle){
    eqOverlayToggle.checked = data.overlay ?? false;
  }
  if(eqAudioToggle){
    eqAudioToggle.checked = data.audio ?? true;
    audio.setEqAudioEnabled(eqAudioToggle.checked);
  }
  if(eqLedToggle){
    eqLedToggle.checked = data.leds ?? true;
    audio.setEqLedEnabled(eqLedToggle.checked);
  }
}
function saveEq(){
  const data = {
    gains: eqSliders.map(s=> parseFloat(s.value)),
    hpf: {
      freq: parseFloat(hpfSlider?.value || 20),
      audio: hpfAudioToggle?.checked ?? true,
      led: hpfLedToggle?.checked ?? true,
    },
    lpf: {
      freq: parseFloat(lpfSlider?.value || 20000),
      audio: lpfAudioToggle?.checked ?? true,
      led: lpfLedToggle?.checked ?? true,
    },
    overlay: eqOverlayToggle?.checked || false,
    audio: eqAudioToggle?.checked ?? true,
    leds: eqLedToggle?.checked ?? true
  };
  localStorage.setItem('eqSettings', JSON.stringify(data));
}
function loadEq(){
  const stored = localStorage.getItem('eqSettings');
  const data = stored ? JSON.parse(stored) : {
    gains: EQ_PRESETS.flat,
    hpf: { freq:20, audio:true, led:true },
    lpf: { freq:20000, audio:true, led:true },
    overlay:false,
    audio:true,
    leds:true
  };
  audio._ensureCtx?.().then(()=> applyEq(data));
}
eqSliders.forEach((sl,i)=>{
  sl.addEventListener('input', ()=>{ audio.setEqGain(i, parseFloat(sl.value)); saveEq(); });
});

hpfSlider?.addEventListener('input', ()=>{ audio.setHighpass(parseFloat(hpfSlider.value)); saveEq(); });
lpfSlider?.addEventListener('input', ()=>{ audio.setLowpass(parseFloat(lpfSlider.value)); saveEq(); });
eqOverlayToggle?.addEventListener('change', saveEq);

eqPresetBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const preset = btn.dataset.preset;
    const vals = EQ_PRESETS[preset];
    if(vals){ applyEqGains(vals); saveEq(); }
  });
});
loadEq();

hpfAudioToggle?.addEventListener('change', ()=>{
  audio.setHpfAudioEnabled(hpfAudioToggle.checked); // enable/disable HPF in audio path
  saveEq();
});
hpfLedToggle?.addEventListener('change', ()=>{
  audio.setHpfLedEnabled(hpfLedToggle.checked); // use HPF data for LEDs
  saveEq();
});
lpfAudioToggle?.addEventListener('change', ()=>{
  audio.setLpfAudioEnabled(lpfAudioToggle.checked); // enable/disable LPF in audio path
  saveEq();
});
lpfLedToggle?.addEventListener('change', ()=>{
  audio.setLpfLedEnabled(lpfLedToggle.checked); // use LPF data for LEDs
  saveEq();
});
eqAudioToggle?.addEventListener('change', ()=>{ audio.setEqAudioEnabled(eqAudioToggle.checked); saveEq(); });
eqLedToggle?.addEventListener('change', ()=>{ audio.setEqLedEnabled(eqLedToggle.checked); saveEq(); });

function syncBeatInputs(){
  const r = settings.beatRanges;
  kickFrom.value = r.kick[0];
  kickTo.value = r.kick[1];
  snareLowFrom.value = r.snare1[0];
  snareLowTo.value = r.snare1[1];
  snareHighFrom.value = r.snare2[0];
  snareHighTo.value = r.snare2[1];
  hatFrom.value = r.hat[0];
  hatTo.value = r.hat[1];
  kickTh.value = settings.beatThresholds.kick; kickThVal.textContent = settings.beatThresholds.kick.toFixed(2);
  snareTh.value = settings.beatThresholds.snare; snareThVal.textContent = settings.beatThresholds.snare.toFixed(2);
  hatTh.value = settings.beatThresholds.hat; hatThVal.textContent = settings.beatThresholds.hat.toFixed(2);
}
syncBeatInputs();


function applyBeatInputs(){
  const r = settings.beatRanges;
  r.kick[0] = parseFloat(kickFrom.value)||0;
  r.kick[1] = parseFloat(kickTo.value)||0;
  r.snare1[0] = parseFloat(snareLowFrom.value)||0;
  r.snare1[1] = parseFloat(snareLowTo.value)||0;
  r.snare2[0] = parseFloat(snareHighFrom.value)||0;
  r.snare2[1] = parseFloat(snareHighTo.value)||0;
  r.hat[0] = parseFloat(hatFrom.value)||0;
  r.hat[1] = parseFloat(hatTo.value)||0;
  const th = settings.beatThresholds;
  th.kick = parseFloat(kickTh.value)||0;
  th.snare = parseFloat(snareTh.value)||0;
  th.hat = parseFloat(hatTh.value)||0;
}

btnBeatConfig?.addEventListener('click', ()=> {
  beatPanel.hidden = !beatPanel.hidden;
  if (!beatPanel.hidden) syncBeatInputs();
});

beatCancel?.addEventListener('click', ()=> { syncBeatInputs(); beatPanel.hidden = true; });
beatSave?.addEventListener('click', ()=> { applyBeatInputs(); beatPanel.hidden = true; });
kickTh.addEventListener('input', ()=>{ kickThVal.textContent = (parseFloat(kickTh.value)||0).toFixed(2); });
snareTh.addEventListener('input', ()=>{ snareThVal.textContent = (parseFloat(snareTh.value)||0).toFixed(2); });
hatTh.addEventListener('input', ()=>{ hatThVal.textContent = (parseFloat(hatTh.value)||0).toFixed(2); });
beatClose?.addEventListener('click', ()=> { beatPanel.hidden = true; });
kickFrom.addEventListener('change', ()=>{ settings.beatRanges.kick[0] = parseFloat(kickFrom.value)||0; });
kickTo.addEventListener('change', ()=>{ settings.beatRanges.kick[1] = parseFloat(kickTo.value)||0; });
kickTh.addEventListener('input', ()=>{ const v=parseFloat(kickTh.value)||0; settings.beatThresholds.kick=v; kickThVal.textContent=v.toFixed(2); });
snareLowFrom.addEventListener('change', ()=>{ settings.beatRanges.snare1[0] = parseFloat(snareLowFrom.value)||0; });
snareLowTo.addEventListener('change', ()=>{ settings.beatRanges.snare1[1] = parseFloat(snareLowTo.value)||0; });
snareHighFrom.addEventListener('change', ()=>{ settings.beatRanges.snare2[0] = parseFloat(snareHighFrom.value)||0; });
snareHighTo.addEventListener('change', ()=>{ settings.beatRanges.snare2[1] = parseFloat(snareHighTo.value)||0; });
snareTh.addEventListener('input', ()=>{ const v=parseFloat(snareTh.value)||0; settings.beatThresholds.snare=v; snareThVal.textContent=v.toFixed(2); });
hatFrom.addEventListener('change', ()=>{ settings.beatRanges.hat[0] = parseFloat(hatFrom.value)||0; });
hatTo.addEventListener('change', ()=>{ settings.beatRanges.hat[1] = parseFloat(hatTo.value)||0; });
hatTh.addEventListener('input', ()=>{ const v=parseFloat(hatTh.value)||0; settings.beatThresholds.hat=v; hatThVal.textContent=v.toFixed(2); });


btnSettings.addEventListener('click', ()=> {
  settingsPanel.hidden = !settingsPanel.hidden;
});

themeSel.addEventListener('change', ()=>{
  settings.theme = themeSel.value;
  if (settings.theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');

  // adjust renderer bg & fog base
  if (settings.theme === 'dark') {
    renderer.setClearColor(0x0a0a0a, 1);
    scene.fog.color.set(0x0e0e0e);
  } else {
    renderer.setClearColor(0x05122f, 1);
    scene.fog.color.set(0x06122c);
  }
});
bloomStrength.addEventListener('input', ()=>{
  const v = parseFloat(bloomStrength.value);
  bloomPass.strength = settings.bloomStrength = v;
  bloomVal.textContent = v.toFixed(2);
});
fogDensity.addEventListener('input', ()=>{
  const v = parseFloat(fogDensity.value);
  scene.fog.density = settings.fogDensity = v;
  fogVal.textContent = v.toFixed(2);
});
fxaaToggle.addEventListener('change', ()=> { settings.fxaa = fxaaToggle.checked; fxaaPass.enabled = settings.fxaa; });
filmToggle.addEventListener('change', ()=> { settings.film = filmToggle.checked; filmPass.enabled = settings.film; });
rgbToggle.addEventListener('change', ()=> { settings.rgb = rgbToggle.checked; rgbShift.enabled = settings.rgb; });
beatToggle.addEventListener('change', ()=> { settings.beatTimeline = beatToggle.checked; });
clearBeatsBtn.addEventListener('click', ()=> beatMarks.length = 0);

// ---------- Fullscreen ----------
btnFS.addEventListener('click', ()=>{
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

// ---------- HUD helpers ----------
function fmtTime(sec){ if(!isFinite(sec)) sec=0; sec=Math.max(0,Math.floor(sec)); const m=Math.floor(sec/60),s=sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }
function updateHUDState(){
  trackTitle.textContent = audio.getTitle();
  const state = audio.getState();
  trackStatus.textContent = audio.isActive() ? state : 'stopped';
  playBtn.textContent = (state === 'running') ? '⏸' : '⏵';
  loopBtn.textContent = loopMode === 'none' ? '🔁 Off' : loopMode === 'playlist' ? '🔁 All' : '🔂 One';
  loopBtn.title = `Loop Mode: ${loopMode}`;
  const dur = audio.getDuration();
  scrubber.max = dur ? dur.toString() : '0';
  scrubber.disabled = !audio.isSeekable();
  if (!audio.isSeekable()) { scrubber.value = '0'; }
  const v = audio.getVolume();
  volume.value = v.toFixed(2);
  volPct.textContent = `${Math.round(v * 100)}%`;
}
function fitCanvasToDisplay(canvas){
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.floor(canvas.clientWidth || 260);
  const cssH = Math.floor(canvas.clientHeight || 60);
  if (canvas.width !== cssW*dpr || canvas.height !== cssH*dpr){
    canvas.width = cssW*dpr; canvas.height = cssH*dpr;
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  return { w: cssW, h: cssH };
}
function drawMiniSpectrum(freqData){
  if (!specCtx) return;
  const { w, h } = fitCanvasToDisplay(miniSpec);
  specCtx.clearRect(0,0,w,h);
  const bars = Math.max(40, Math.floor(w/4));
  const step = Math.max(1, Math.floor(freqData.length / bars));
  for (let i=0;i<bars;i++){
    let sum=0,c=0;
    for (let k=0;k<step;k++){ const idx=i*step+k; if (idx>=freqData.length) break; sum+=freqData[idx]; c++; }
    const mag = (c?sum/c:0)/255;
    const barW = Math.max(1, (w/bars)*0.9);
    const x = (i*w/bars) + (w/bars - barW)*0.5;
    const y = h - mag*h;
    specCtx.globalAlpha=0.95; specCtx.fillStyle='#cfe8ff';
    specCtx.fillRect(x,y,barW,h-y);
  }
  if(eqOverlayToggle?.checked){
    const gains = audio.getEqSettings();
    const freqs = audio.getEqFreqs();
    const sr = audio.ctx?.sampleRate || 44100;
    const ny = sr/2;
    const points = gains.map((g,i)=>{
      const f = freqs[i];
      const x = Math.log2(f/20) / Math.log2(ny/20) * w;
      const y = h - ((g + 12) / 24) * h;
      return {x,y};
    });
    specCtx.globalAlpha = 1.0;
    specCtx.strokeStyle = '#ffea00';
    specCtx.lineWidth = 2;
    if(points.length){
      specCtx.beginPath();
      specCtx.moveTo(0, points[0].y);
      points.forEach(p=> specCtx.lineTo(p.x, p.y));
      specCtx.stroke();
    }
  }
}
function drawMiniWave(timeData){
  if (!waveCtx || !timeData.length) return;
  const { w, h } = fitCanvasToDisplay(miniWave);
  waveCtx.clearRect(0,0,w,h);
  waveCtx.globalAlpha = 1.0;
  waveCtx.lineWidth = 2;
  waveCtx.strokeStyle = '#bfe6ff';
  waveCtx.beginPath();
  const N = timeData.length;
  for (let i=0;i<N;i++){
    const t = i/(N-1);
    const x = t * w;
    const y = (0.5 - timeData[i]*0.5) * h;
    if (i===0) waveCtx.moveTo(x,y); else waveCtx.lineTo(x,y);
  }
  waveCtx.stroke();
}

// Volume knob + VU meter
function drawVolumeKnob(val){
  if (!knobCtx) return;
  const { w, h } = fitCanvasToDisplay(volumeKnob);
  const r = Math.min(w, h) / 2 - 2;
  knobCtx.clearRect(0,0,w,h);
  knobCtx.fillStyle = '#1a2b4a';
  knobCtx.beginPath();
  knobCtx.arc(w/2, h/2, r, 0, Math.PI*2);
  knobCtx.fill();
  const ang = (val * 270 - 135) * Math.PI/180;
  const x = w/2 + Math.cos(ang)*(r-6);
  const y = h/2 + Math.sin(ang)*(r-6);
  knobCtx.strokeStyle = '#ffffff';
  knobCtx.lineWidth = 3;
  knobCtx.beginPath();
  knobCtx.moveTo(w/2, h/2);
  knobCtx.lineTo(x, y);
  knobCtx.stroke();
}

function updateVUMeter(level){
  if (!vuCtx) return;
  const { w, h } = fitCanvasToDisplay(vuMeter);
  vuCtx.clearRect(0,0,w,h);
  vuCtx.fillStyle = '#8fb3ff';
  const barH = h * Math.max(0, Math.min(1, level));
  vuCtx.fillRect(0, h - barH, w, barH);
}

// ---------- UI events ----------
micBtn.addEventListener('click', async () => {
  try{
    await audio._ensureCtx?.();
    if (audio.isMicActive && audio.isMicActive()){
      await audio.stopMic(); micBtn.textContent='🎙️ Mic';
    } else {
      if (audio.ctx && audio.ctx.state==='suspended') await audio.ctx.resume();
      await audio.useMic(); micBtn.textContent='🛑 Stop Mic';
    }
    updateHUDState();
  } catch { alert('Microphone permission denied or unavailable.'); }
});
fileInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const f of files) playlist.push({ name: f.name, file: f, id: crypto.randomUUID?.() || String(Math.random()) });
  renderPlaylist();
  if (currentIndex < 0) await playIndex(0);
  await savePlaylistToDB();
});
playBtn.addEventListener('click', async ()=>{ try{ await audio.toggle(); updateHUDState(); } catch{} });
loopBtn.addEventListener('click', ()=>{
  loopMode = loopMode === 'none' ? 'playlist' : loopMode === 'playlist' ? 'track' : 'none';
  updateHUDState();
});
scrubber.addEventListener('input', ()=>{ if (audio.isSeekable()){ const t=parseFloat(scrubber.value||'0'); audio.seek(Number.isFinite(t)?t:0); }});
volume.addEventListener('input', ()=>{
  const v=parseFloat(volume.value);
  audio.setVolume(v);
  volPct.textContent=`${Math.round((audio.getVolume()||0)*100)}%`;
  drawVolumeKnob(v);
});

smoothToggle?.addEventListener('click', ()=>{
  smoothTransition = !smoothTransition;
  smoothToggle.textContent = smoothTransition ? 'Smooth ✓' : 'Smooth';
});

let knobDragging = false;
function setKnobFromEvent(e){
  const rect = volumeKnob.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width/2;
  const y = e.clientY - rect.top - rect.height/2;
  let deg = Math.atan2(y, x) * 180/Math.PI + 180 - 135;
  deg = Math.max(0, Math.min(270, deg));
  const val = deg / 270;
  volume.value = val.toFixed(2);
  volume.dispatchEvent(new Event('input'));
}
volumeKnob.addEventListener('pointerdown', e=>{ knobDragging=true; volumeKnob.setPointerCapture(e.pointerId); setKnobFromEvent(e); });
volumeKnob.addEventListener('pointermove', e=>{ if(knobDragging) setKnobFromEvent(e); });
volumeKnob.addEventListener('pointerup', e=>{ knobDragging=false; volumeKnob.releasePointerCapture(e.pointerId); });
window.addEventListener('keydown', (e)=>{
  const k = e.key.toLowerCase();
  if (k==='arrowup' || k==='arrowdown'){
    e.preventDefault();
    const delta = k==='arrowup' ? 0.05 : -0.05;
    const v = Math.max(0, Math.min(1, (audio.getVolume()||0)+delta));
    audio.setVolume(v);
    volume.value=v.toFixed(2);
    volPct.textContent=`${Math.round(v*100)}%`;
    drawVolumeKnob(v);
  }
  if (k==='n') { plNext.click(); }
  if (k==='p') { plPrev.click(); }
});

// Drag & drop → fill playlist
function showDrop(e){ 
  e.preventDefault();
  e.stopPropagation(); 
  if(dropzone) dropzone.style.display='grid'; 
  console.log('show drop zone', dropzone); 
}

function hideDrop(e){
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if(dropzone) dropzone.style.display='none';
  console.log('hide drop zone', dropzone);
}

['dragenter','dragover'].forEach(ev=>window.addEventListener(ev,showDrop,{passive:false}));

['dragleave','drop'].forEach(ev=>window.addEventListener(ev,hideDrop,{passive:false}));

window.addEventListener('dragover', e=>{ e.preventDefault(); }, {passive:false});

window.addEventListener('drop', async e=>{
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files || []);
  const items = files.filter(f=>f.type.startsWith('audio/'));
  if (!items.length) return;
  for (const f of items) {
    const it = await makePlaylistItem(f);
    playlist.push(it);
  }
  renderPlaylist();
  if (currentIndex < 0) await playIndex(0);
  await savePlaylistToDB();
});

function setDropText(text){ 
  if(!dropzone) return; 
  console.log('set drop text', text);
  dropzone.style.display='grid'; 
  dropzone.innerHTML = `<div>${text}</div>`; 
}

// ---------- Resize ----------
window.addEventListener('resize', onResize);
function onResize(){
  const w=window.innerWidth, h=window.innerHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); composer.setSize(w,h);
  setFXAAResolution();
  fitCanvasToDisplay(miniSpec);
  fitCanvasToDisplay(miniWave);
  controls.update();
}
onResize();

// ---------- Beat timeline (simple DSP events) ----------
const beatMarks = []; // seconds where onset detected
let lastBeatAt = -10;
function updateBeatTimeline(onsets){
  if (!settings.beatTimeline) return;
  const t = audio.getCurrentTime();
  const r = settings.beatRanges;
  const kickVol = audio.getRangeVolume(r.kick[0], r.kick[1]);
  const snareVol = Math.max(
    audio.getRangeVolume(r.snare1[0], r.snare1[1]),
    audio.getRangeVolume(r.snare2[0], r.snare2[1])
  );
  const hatVol = audio.getRangeVolume(r.hat[0], r.hat[1]);
  const th = settings.beatThresholds;
  const hit =
    (onsets.kick  && kickVol  >= th.kick) ||
    (onsets.snare && snareVol >= th.snare) ||
    (onsets.hat   && hatVol   >= th.hat);
  if (hit && (t - lastBeatAt) > 0.12) {
    beatMarks.push(t);
    lastBeatAt = t;
  }
}

// OPTIONAL: visualize beat markers on the scrubber (tiny ticks)
function drawBeatTicks(){
  const dur = audio.getDuration(); if (!dur || !beatMarks.length) return;
  const parent = scrubber.parentElement;
  // remove old ticks
  parent.querySelectorAll('.beatTick').forEach(n=>n.remove());
  const rect = scrubber.getBoundingClientRect();
  const W = rect.width;
  beatMarks.forEach(s=>{
    const x = (s/dur) * W;
    const tick = document.createElement('div');
    tick.className = 'beatTick';
    tick.style.cssText = `position:absolute; height:6px; width:2px; background:#89f0ff; top:-6px; left:${Math.max(0, x-1)}px; opacity:.6;`;
    parent.style.position = 'relative';
    parent.appendChild(tick);
  });
}

// ---------- Loop ----------
const clock = new THREE.Clock();
function tick(){
  const dt = Math.min(0.05, clock.getDelta());
  const t  = clock.elapsedTime;

  // background motion
  specks.rotation.y += 0.0006;
  specks.rotation.x = Math.sin(t * 0.05) * 0.04;

  // Audio analysis
  const spectrum = audio.getSpectrumArray();
  const timeData = audio.getTimeDomainArray();
  const on = audio.getOnsets ? audio.getOnsets() : {kick:false,snare:false,hat:false,any:false};
  const lv = {
    sub:     audio.getRangeVolume(...LED_RANGES.sub),
    bass:    audio.getRangeVolume(...LED_RANGES.bass),
    lowMid:  audio.getRangeVolume(...LED_RANGES.lowMid),
    highMid: audio.getRangeVolume(...LED_RANGES.highMid),
    hat:     audio.getRangeVolume(...LED_RANGES.hat)
  };
  for (const k in lv) if (lv[k] >= LED_THRESHOLDS[k]) bumpLED(k);
  updateLEDs(dt);
  const level = audio.getBands ? audio.getBands().overall : 0;
  updateVUMeter(level);
  drawMiniSpectrum(spectrum);
  drawMiniWave(timeData);
  updateBeatTimeline(on);

  if (audio.isSeekable()){
    const cur = audio.getCurrentTime(), dur = audio.getDuration();
    if (dur>0){
      if (document.activeElement !== scrubber) scrubber.value = cur.toFixed(2);
      timeNow.textContent = fmtTime(cur);
      timeRemain.textContent = `-${fmtTime(Math.max(0, dur - cur))}`;
    }
  }
  drawBeatTicks();

  controls.update();
  composer.render();
  requestAnimationFrame(tick);
}
updateHUDState();
tick();
