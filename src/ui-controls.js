export function initUIControls(audio, playlistAPI, state) {
  const micBtn = document.getElementById('micBtn');
  const fileInput = document.getElementById('fileInput');
  const playBtn = document.getElementById('playBtn');
  const loopBtn = document.getElementById('loopBtn');
  const scrubber = document.getElementById('scrubber');
  const timeNow = document.getElementById('timeNow');
  const timeRemain = document.getElementById('timeRemain');
  const volume = document.getElementById('volume');
  const volPct = document.getElementById('volPct');
  const smoothToggle = document.getElementById('smoothToggle');

  function fmtTime(sec){
    if(!isFinite(sec)) sec=0; sec=Math.max(0,Math.floor(sec));
    const m=Math.floor(sec/60),s=sec%60; return `${m}:${s.toString().padStart(2,'0')}`;
  }

  function updateHUDState(){
    const trackTitle = document.getElementById('trackTitle');
    const trackStatus = document.getElementById('trackStatus');
    trackTitle.textContent = audio.getTitle();
    const status = audio.getState();
    trackStatus.textContent = audio.isActive() ? status : 'stopped';
    playBtn.textContent = (status === 'running') ? '⏸' : '⏵';
    loopBtn.textContent = state.loopMode === 'none' ? '🔁 Off' : state.loopMode === 'playlist' ? '🔁 All' : '🔂 One';
    loopBtn.title = `Loop Mode: ${state.loopMode}`;
    const dur = audio.getDuration();
    scrubber.max = dur ? dur.toString() : '0';
    scrubber.disabled = !audio.isSeekable();
    if (!audio.isSeekable()) { scrubber.value = '0'; }
    const v = audio.getVolume();
    volume.value = v.toFixed(2);
    volPct.textContent = `${Math.round(v * 100)}%`;
  }

  micBtn?.addEventListener('click', async ()=>{
    try { await audio.useMic(); updateHUDState(); } catch(e) { console.warn(e); }
  });
  fileInput?.addEventListener('change', async e=>{
    const file = e.target.files[0];
    if(file){ await audio.useFile(file); updateHUDState(); }
  });
  playBtn.addEventListener('click', async ()=>{ try { await audio.toggle(); updateHUDState(); } catch {} });
  loopBtn.addEventListener('click', ()=>{
    state.loopMode = state.loopMode === 'none' ? 'playlist' : state.loopMode === 'playlist' ? 'track' : 'none';
    updateHUDState();
  });
  scrubber.addEventListener('input', ()=>{ if (audio.isSeekable()){ const t=parseFloat(scrubber.value||'0'); audio.seek(Number.isFinite(t)?t:0); }});
  volume.addEventListener('input', ()=>{
    const v=parseFloat(volume.value);
    audio.setVolume(v);
    volPct.textContent=`${Math.round((audio.getVolume()||0)*100)}%`;
  });
  smoothToggle?.addEventListener('click', ()=>{
    state.smoothTransition = !state.smoothTransition;
    smoothToggle.textContent = state.smoothTransition ? 'Smooth ✓' : 'Smooth';
  });

  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if (k==='n') playlistAPI.plNext.click();
    if (k==='p') playlistAPI.plPrev.click();
  });

  function update(){
    if (audio.isSeekable()){
      const cur = audio.getCurrentTime(), dur = audio.getDuration();
      if (dur>0){
        if (document.activeElement !== scrubber) scrubber.value = cur.toFixed(2);
        timeNow.textContent = fmtTime(cur);
        timeRemain.textContent = `-${fmtTime(Math.max(0, dur - cur))}`;
      }
    }
  }

  updateHUDState();

  return { updateHUDState, update };
}
