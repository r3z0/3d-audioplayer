import './styles.css';
import { AudioReactive } from './audio.js';
import { initRenderer, startRenderLoop, createResizeHandler } from './render.js';
import { initPlaylist } from './playlist.js';
import { initUIControls } from './ui-controls.js';
import { initSettings } from './settings.js';

const audio = new AudioReactive();
const renderEnv = initRenderer();

const state = { loopMode: 'none', smoothTransition: false };
const playlistAPI = initPlaylist(audio, () => ui.updateHUDState(), () => state.loopMode, () => state.smoothTransition);
const ui = initUIControls(audio, playlistAPI, state);

startRenderLoop(renderEnv, () => {
  ui.update();
});

const onResize = createResizeHandler(renderEnv);
window.addEventListener('resize', onResize);
onResize();

initSettings();
