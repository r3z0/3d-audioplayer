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
const scrubber = document.getElementById('scrubber');
const timeNow = document.getElementById('timeNow');
const timeRemain = document.getElementById('timeRemain');
const volume = document.getElementById('volume');
const volPct = document.getElementById('volPct');
const trackTitle = document.getElementById('trackTitle');
const trackStatus = document.getElementById('trackStatus');
const miniSpec = document.getElementById('miniSpec');
const miniWave = document.getElementById('miniWave');
const specCtx  = miniSpec.getContext('2d');
const waveCtx  = miniWave.getContext('2d');
const dropzone = document.getElementById('dropzone');
const btnFS = document.getElementById('btnFullscreen');
const btnSettings = document.getElementById('btnSettings');

// LEDs
const ledKick  = document.getElementById('ledKick');
const ledSnare = document.getElementById('ledSnare');
const ledHat   = document.getElementById('ledHat');
const ledTimers = { kick: 0, snare: 0, hat: 0 };
function bumpLED(which, seconds=0.15){ ledTimers[which] = Math.max(ledTimers[which], seconds); }
function updateLEDs(dt){
  for (const k of ['kick','snare','hat']) ledTimers[k] = Math.max(0, ledTimers[k] - dt);
  ledKick.classList.toggle('on', ledTimers.kick>0);  ledKick.classList.toggle('off', !(ledTimers.kick>0));
  ledSnare.classList.toggle('on', ledTimers.snare>0);ledSnare.classList.toggle('off', !(ledTimers.snare>0));
  ledHat.classList.toggle('on', ledTimers.hat>0);    ledHat.classList.toggle('off', !(ledTimers.hat>0));
}

// ---------- Playlist panel (IndexedDB persistence) ----------
const playlistPanel = document.createElement('div');
playlistPanel.id = 'playlistPanel';
playlistPanel.style.cssText = `
  position:fixed; right:12px; top:12px; z-index:1000;
  width: 260px; max-height: 46vh; overflow:auto;
  background: rgba(13,19,33,0.7); backdrop-filter: blur(6px);
  color:#e8f0ff; font:12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;
  border-radius:12px; box-shadow:0 6px 24px rgba(0,0,0,0.35); padding:10px;
`;
playlistPanel.innerHTML = `
  <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
    <strong style="flex:1;">Playlist</strong>
    <button id="pl-prev" title="Prev">⏮</button>
    <button id="pl-next" title="Next">⏭</button>
    <button id="pl-save" title="Save playlist">💾</button>
    <button id="pl-load" title="Load playlist">📂</button>
  </div>
  <div style="display:flex; gap:6px; margin-bottom:6px;">
    <input id="pl-file" type="file" accept="audio/*" multiple style="flex:1;">
  </div>
  <ul id="pl-list" style="list-style:none; padding:0; margin:0; display:grid; gap:6px;"></ul>
  <div style="margin-top:6px; opacity:.8;">Tip: drag items to reorder • N/P keys</div>
`;
document.body.appendChild(playlistPanel);

const plInput = playlistPanel.querySelector('#pl-file');
const plList  = playlistPanel.querySelector('#pl-list');
const plPrev  = playlistPanel.querySelector('#pl-prev');
const plNext  = playlistPanel.querySelector('#pl-next');
const plSave  = playlistPanel.querySelector('#pl-save');
const plLoad  = playlistPanel.querySelector('#pl-load');

let playlist = []; // [{name, file(Blob), id}]
let currentIndex = -1;

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
    id: r.id,
    file: r.blob // Blob (or File)
  }));
  renderPlaylist();
  if (playlist.length && currentIndex < 0) await playIndex(0);
}

// ---------- Playlist UI ----------
function renderPlaylist(){
  plList.innerHTML = '';
  playlist.forEach((it, idx)=>{
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.idx = idx.toString();
    li.style.cssText = `
      display:flex; gap:6px; align-items:center; padding:6px; border-radius:8px;
      background:${idx===currentIndex ? 'rgba(90,130,255,0.22)' : 'rgba(255,255,255,0.06)'};
    `;
    li.innerHTML = `
      <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${it.name}</div>
      <button data-act="play" title="Play">▶</button>
      <button data-act="up" title="Move up">↑</button>
      <button data-act="down" title="Move down">↓</button>
      <button data-act="del" title="Remove">✕</button>
    `;
    li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', idx.toString()); });
    li.addEventListener('dragover', e => { e.preventDefault(); });
    li.addEventListener('drop', async e => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'),10);
      const to = idx;
      if (from===to) return;
      const item = playlist.splice(from,1)[0];
      playlist.splice(to,0,item);
      if (currentIndex === from) currentIndex = to;
      else if (from < currentIndex && to >= currentIndex) currentIndex--;
      else if (from > currentIndex && to <= currentIndex) currentIndex++;
      renderPlaylist();
      await savePlaylistToDB();
    });
    li.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button'); if (!btn) return;
      const act = btn.dataset.act;
      if (act==='play'){ await playIndex(idx); }
      if (act==='del'){
        playlist.splice(idx,1);
        if (idx === currentIndex) { currentIndex = -1; }
        else if (idx < currentIndex) { currentIndex--; }
        renderPlaylist();
        await savePlaylistToDB();
      }
      if (act==='up' && idx>0){
        [playlist[idx-1], playlist[idx]] = [playlist[idx], playlist[idx-1]];
        if (currentIndex===idx) currentIndex=idx-1;
        else if (currentIndex===idx-1) currentIndex=idx;
        renderPlaylist();
        await savePlaylistToDB();
      }
      if (act==='down' && idx<playlist.length-1){
        [playlist[idx+1], playlist[idx]] = [playlist[idx], playlist[idx+1]];
        if (currentIndex===idx) currentIndex=idx+1;
        else if (currentIndex===idx+1) currentIndex=idx;
        renderPlaylist();
        await savePlaylistToDB();
      }
    });
    plList.appendChild(li);
  });
}

plInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const f of files) playlist.push({ name: f.name, file: f, id: crypto.randomUUID?.() || String(Math.random()) });
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
  try{
    await audio._ensureCtx?.();
    if (audio.ctx && audio.ctx.state==='suspended') await audio.ctx.resume();
    setDropText('Song loading… 0%');
    // item.file can be Blob or File
    const f = item.file instanceof File ? item.file : new File([item.file], item.name, { type: item.file.type || 'audio/*' });
    await audio.useFile(f, p => setDropText(`Song loading… ${p}%`));
    currentIndex = i;
    renderPlaylist();
    updateHUDState();
  } finally { 
    console.log('Done loading song.', dropzone);
    if (dropzone) { 
      console.log('Dropped dropzone!');
      hideDrop(dropzone); 
    }; 
  }
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
scrubber.addEventListener('input', ()=>{ if (audio.isSeekable()){ const t=parseFloat(scrubber.value||'0'); audio.seek(Number.isFinite(t)?t:0); }});
volume.addEventListener('input', ()=>{
  const v=parseFloat(volume.value); audio.setVolume(v); volPct.textContent=`${Math.round((audio.getVolume()||0)*100)}%`;
});
window.addEventListener('keydown', (e)=>{
  const k = e.key.toLowerCase();
  if (k==='arrowup' || k==='arrowdown'){
    e.preventDefault();
    const delta = k==='arrowup' ? 0.05 : -0.05;
    const v = Math.max(0, Math.min(1, (audio.getVolume()||0)+delta));
    audio.setVolume(v); volume.value=v.toFixed(2); volPct.textContent=`${Math.round(v*100)}%`;
  }
  if (k==='n') { plNext.click(); }
  if (k==='p') { plPrev.click(); }
});

// Drag & drop → fill playlist
function showDrop(e){ 
  e.preventDefault();
  e.stopPropagation(); 
  console.log('show drop zone'); 
  if(dropzone) dropzone.style.display='grid'; }

function hideDrop(e){ 
  console.log('hide drop zone event:', e?.type);
  e.preventDefault(); 
  e.stopPropagation(); 
  console.log('hide drop zone'); 
  if(dropzone) dropzone.style.display='none'; 
}

['dragenter','dragover'].forEach(ev=>window.addEventListener(ev,showDrop,{passive:false}));

['dragleave','drop'].forEach(ev=>window.addEventListener(ev,hideDrop,{passive:false}));

window.addEventListener('dragover', e=>{ e.preventDefault(); }, {passive:false});

window.addEventListener('drop', async e=>{
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files || []);
  const items = files.filter(f=>f.type.startsWith('audio/'));
  if (!items.length) return;
  for (const f of items) playlist.push({ name: f.name, file: f, id: crypto.randomUUID?.() || String(Math.random()) });
  renderPlaylist();
  if (currentIndex < 0) await playIndex(0);
  await savePlaylistToDB();
});

function setDropText(text){ if(!dropzone) return; dropzone.style.display='grid'; dropzone.innerHTML = `<div>${text}</div>`; }

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
  if (onsets.any && (t - lastBeatAt) > 0.12) { // refractory to avoid spamming
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
  if (on.kick)  bumpLED('kick');
  if (on.snare) bumpLED('snare');
  if (on.hat)   bumpLED('hat');
  updateLEDs(dt);
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
