import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export function initPlaylist(audio, updateHUDState, getLoopMode, isSmooth){
const dropzone = document.getElementById("dropzone");
const dropzoneText = dropzone?.firstElementChild;
const coverModal = document.getElementById("coverModal");
const coverModalImg = coverModal?.querySelector("img");
coverModal?.addEventListener("click", e => {
  if (e.target === coverModal) coverModal.style.display = "none";
});

// ---------- Playlist panel (IndexedDB persistence) ----------
const playlistTpl = document.createElement('template');
playlistTpl.innerHTML = `
  <div id="playlistPanel"
       class="w-64 max-h-[46vh] overflow-auto bg-slate-900/70 backdrop-blur text-blue-50 text-xs font-sans rounded-xl shadow-xl p-2.5"
       style="position:absolute; right:12px; z-index:1200;">
    <div class="flex gap-1.5 items-center mb-1.5">
      <strong class="flex-1">Playlist</strong>
      <button id="pl-prev" title="Prev" class="hover:bg-[#22365d]">⏮</button>
      <button id="pl-next" title="Next" class="hover:bg-[#22365d]">⏭</button>
      <button id="pl-save" title="Save playlist" class="hover:bg-[#22365d]">💾</button>
      <button id="pl-load" title="Load playlist" class="hover:bg-[#22365d]">📂</button>
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
playlistPanel.hidden = true;

const hud = document.getElementById('appControls');
const btnPlaylist = document.getElementById('btnPlaylist');


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
    album: '',
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
    it.album = tag?.tags?.album || '';
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
    album: '',
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
function formatFileSize(bytes){
  if(!isFinite(bytes)) return '--';
  const units=['B','KB','MB','GB'];
  let i=0; let val=bytes;
  while(val>=1024 && i<units.length-1){ val/=1024; i++; }
  return `${val.toFixed(i?1:0)} ${units[i]}`;
}
function buildPlaylistItem(it, idx){
  const li = document.createElement('li');
  li.draggable = true;
  li.dataset.idx = idx.toString();
  li.className = 'relative flex items-center gap-3 p-2 rounded-md overflow-hidden';
  if (idx === currentIndex) li.classList.add('bg-gradient-to-r','from-purple-500/30','to-indigo-600/20');
  else li.classList.add('bg-white/5','hover:bg-white/10');

  const durStr = typeof it.duration === 'number' ? formatTime(it.duration) : '--:--';
  const sizeStr = it.file ? formatFileSize(it.file.size) : '--';

  if (it.coverUrl) {
    const img = document.createElement('img');
    img.src = it.coverUrl;
    img.alt = '';
    img.className = 'w-12 h-12 object-cover rounded-md cursor-pointer flex-shrink-0';
    img.addEventListener('click', e => { e.stopPropagation(); showCoverModal(it.coverUrl); });
    li.appendChild(img);
  }

  const info = document.createElement('div');
  info.className = 'flex flex-col overflow-hidden';
  const titleDiv = document.createElement('div');
  titleDiv.className = 'text-sm font-medium truncate';
  titleDiv.textContent = it.title || it.name;
  const metaDiv = document.createElement('div');
  metaDiv.className = 'text-xs text-slate-300 truncate';
  metaDiv.textContent = [it.artist, it.album].filter(Boolean).join(' • ');
  info.append(titleDiv, metaDiv);
  li.appendChild(info);

  const stats = document.createElement('div');
  stats.className = 'ml-auto text-right text-xs text-slate-400 tabular-nums';
  const durDiv = document.createElement('div');
  durDiv.textContent = durStr;
  const sizeDiv = document.createElement('div');
  sizeDiv.textContent = sizeStr;
  stats.append(durDiv, sizeDiv);
  li.appendChild(stats);

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

  const prog = document.createElement('div');
  prog.className = 'pl-progress pointer-events-none absolute left-0 bottom-0 h-0.5 bg-purple-400/70';
  let pct = 0;
  if (idx === currentIndex) {
    const cur = audio.getCurrentTime();
    const dur = audio.getDuration();
    pct = dur > 0 ? (cur / dur) * 100 : 0;
  }
  prog.style.width = `${pct}%`;
  li.appendChild(prog);

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
  await audio.ensureContext();
  const g = audio.gain?.gain;
  const startVol = audio.getVolume();

  if (isSmooth() && g && audio.media?.el){
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
          if (getLoopMode() === 'track') {
            playIndex(currentIndex);
          } else if (getLoopMode() === 'playlist') {
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
// Drag & drop → fill playlist
function showDrop(e){
  e.preventDefault();
  e.stopPropagation();
  if(dropzone) dropzone.classList.remove('hidden');
  console.log('show drop zone', dropzone);
}

function hideDrop(e){
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if(dropzone) dropzone.classList.add('hidden');
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
  dropzone.classList.remove('hidden');
  if (dropzoneText) {
    dropzoneText.textContent = text;
  } else {
    dropzone.textContent = text;
  }
}

loadPlaylistFromDB().catch(()=>{});


return { playIndex, renderPlaylist, loadPlaylistFromDB, savePlaylistToDB, playlist, getCurrentIndex: () => currentIndex, plPrev, plNext, showDrop, hideDrop, setDropText };
}

}
