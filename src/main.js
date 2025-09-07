// src/main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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

// ---------- Orbit Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.0;
controls.maxDistance = 14.0;
controls.enablePan = true;
controls.target.set(0, 0.6, 0);
controls.update();

// ---------- Stars / Specks ----------
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

// ---------- Lights (subtle) ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x203050, 0.4));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(5, 8, 6);
scene.add(dir);

// ---------- PostFX ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, 0.85, 0.0 // strength, radius, threshold
);
composer.addPass(bloomPass);

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
const specCtx = miniSpec.getContext('2d');
const dropzone = document.getElementById('dropzone');

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

// ---------- Helpers (HUD) ----------
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
function setDropText(text){ if(!dropzone) return; dropzone.style.display='grid'; dropzone.innerHTML = `<div>${text}</div>`; }

// ---------- Playlist panel (top-right) ----------
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

let playlist = []; // [{name, file, id}]
let currentIndex = -1;

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
    li.addEventListener('drop', e => {
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
      }
      if (act==='up' && idx>0){
        [playlist[idx-1], playlist[idx]] = [playlist[idx], playlist[idx-1]];
        if (currentIndex===idx) currentIndex=idx-1;
        else if (currentIndex===idx-1) currentIndex=idx;
        renderPlaylist();
      }
      if (act==='down' && idx<playlist.length-1){
        [playlist[idx+1], playlist[idx]] = [playlist[idx], playlist[idx+1]];
        if (currentIndex===idx) currentIndex=idx+1;
        else if (currentIndex===idx+1) currentIndex=idx;
        renderPlaylist();
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
});
plPrev.addEventListener('click', async ()=>{ if (!playlist.length) return; const i=(currentIndex-1+playlist.length)%playlist.length; await playIndex(i); });
plNext.addEventListener('click', async ()=>{ if (!playlist.length) return; const i=(currentIndex+1)%playlist.length; await playIndex(i); });

async function playIndex(i){
  const item = playlist[i]; if (!item) return;
  try{
    await audio._ensureCtx?.();
    if (audio.ctx && audio.ctx.state==='suspended') await audio.ctx.resume();
    setDropText('Song loading… 0%');
    await audio.useFile(item.file, p => setDropText(`Song loading… ${p}%`));
    currentIndex = i;
    renderPlaylist();
    updateHUDState();
  } finally { if (dropzone) dropzone.style.display='none'; }
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
function showDrop(e){ e.preventDefault(); e.stopPropagation(); if(dropzone) dropzone.style.display='grid'; }
function hideDrop(e){ e.preventDefault(); e.stopPropagation(); if(dropzone) dropzone.style.display='none'; }
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
});

// ---------- Resize ----------
window.addEventListener('resize', onResize);
function onResize(){
  const w=window.innerWidth, h=window.innerHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); composer.setSize(w,h);
  fitCanvasToDisplay(miniSpec);
  controls.update();
}
onResize();

// ---------- Loop ----------
const clock = new THREE.Clock();
function tick(){
  const dt = Math.min(0.05, clock.getDelta());
  const t  = clock.elapsedTime;

  // mild background motion
  specks.rotation.y += 0.0006;
  specks.rotation.x = Math.sin(t * 0.05) * 0.04;

  // Audio visuals
  const spectrum = audio.getSpectrumArray();
  const on = audio.getOnsets ? audio.getOnsets() : {kick:false,snare:false,hat:false,any:false};
  if (on.kick)  bumpLED('kick');
  if (on.snare) bumpLED('snare');
  if (on.hat)   bumpLED('hat');
  updateLEDs(dt);
  drawMiniSpectrum(spectrum);

  if (audio.isSeekable()){
    const cur = audio.getCurrentTime(), dur = audio.getDuration();
    if (dur>0){
      if (document.activeElement !== scrubber) scrubber.value = cur.toFixed(2);
      timeNow.textContent = fmtTime(cur);
      timeRemain.textContent = `-${fmtTime(Math.max(0, dur - cur))}`;
    }
  }

  controls.update();
  composer.render();
  requestAnimationFrame(tick);
}
updateHUDState();
tick();
