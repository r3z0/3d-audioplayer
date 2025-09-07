Three.js + Audio Starter

A minimal, modern starter to build music-reactive visuals with Three.js.
It ships with:

Fullscreen WebGL scene (fog + starfield + bloom)

OrbitControls (smooth damping)

Compact audio player:

File loader (drag-and-drop & file input)

Microphone input (with toggle)

Playlist (multi-file, reorder via drag, play, delete, next/prev)

Scrubber & time display

Volume slider (+ ⬆/⬇ hotkeys)

Mini spectrum visualizer

Onset LEDs (✅ kick / snare / hat)

Use it as a base to plug in your own meshes/shaders and drive them from the live spectrum/bands/onset data.

Demo (what you get)

index.html mounts the WebGL canvas and the HUD.

src/main.js bootstraps Three.js (scene, camera, controls, bloom) and the UI.

src/audio.js exposes a tiny Web Audio helper (AudioReactive) used by main.js.

The jellyfish scene has been removed—this is intentionally clean so you can drop in your own visuals.

Quick start
1) Clone or copy the files
your-project/
├─ index.html
└─ src/
   ├─ main.js
   └─ audio.js

2) Serve locally (pick one)

Any static server works because we use native ES modules.

# Node (recommended)
npx serve .

# OR: Vite (hot reload, pretty URLs)
npm create vite@latest three-audio-starter -- --template vanilla
# copy the starter files into vite's folder, then:
cd three-audio-starter
npm i
npm run dev

# OR: Python
python3 -m http.server 5173


Open http://localhost:3000
 (or the port your server prints).

⚠️ Browsers block autoplay: press Play or interact once to allow audio.

Features

Three.js scene: Perspective camera, foggy deep-blue background, additive speck “stars”, subtle lights, post-processing bloom.

Controls: OrbitControls with damping, pan on/off, sensible distance limits.

Audio inputs:

Files: add via file picker or drag & drop.

Microphone: click 🎙️ Mic (the browser will ask for permission).

Playlist UI: shows tracks, supports drag to reorder, play, remove, prev/next.

HUD:

Title + state (running/paused/stopped)

Play/pause button

Scrubber with current time + remaining

Volume slider with percentage

Mini spectrum canvas

Onset LEDs (kick/snare/hat)

Keyboard:

N = next track, P = previous

ArrowUp / ArrowDown = volume ±5%

How to react visuals to audio

You’ll mostly work inside src/main.js’s render loop.
Use the AudioReactive API from src/audio.js.

import { AudioReactive } from './audio.js';

const audio = new AudioReactive();

// In your tick():
const spectrum = audio.getSpectrumArray(); // Uint8Array (0..255)
const bands = audio.getBands();            // { overall, bass, mid, treble } in 0..1
const on = audio.getOnsets();              // { kick, snare, hat, any } booleans

// Example: pulse mesh scale with bass
myMesh.scale.setScalar(1 + bands.bass * 0.2);

// Example: brighten material on snare hits
if (on.snare) myMat.emissiveIntensity = 1.2;
myMat.emissiveIntensity *= 0.96; // decay


Tips

Call getBands() once per frame and cache the result; it internally calls getSpectrumArray().

Use onset flags for “events” (sparks, bursts, camera shakes).

For smoother motion, apply exponential decay/lerp rather than snapping to band values.

File overview
index.html     # Canvas mount + HUD scaffolding
src/
  audio.js     # Web Audio wrapper: file/mic sources, analyser, bands, onsets
  main.js      # Three.js setup, postprocessing, playlist & HUD wiring, render loop

AudioReactive API (src/audio.js)

Inputs

await useFile(file, onProgress?)

await useMic()

await stopMic()

Transport

await toggle() (play/pause for file; toggles state flag for mic)

seek(seconds)

getCurrentTime(), getDuration(), isSeekable()

State

getTitle(), getState() ('running' | 'paused' | 'stopped')

isActive() (any source attached), isMicActive()

setVolume(v 0..1), getVolume()

setSensitivity(s) (scales bands/onset thresholds)

Analysis

getSpectrumArray() → Uint8Array of spectrum magnitudes

getBands() → { overall, bass, mid, treble } each in 0..1

getOnsets() → { kick, snare, hat, any } heuristic flags

Customize the scene

Add your meshes right after the “Lights” section in main.js:

// Example: a reactive torus
const geo = new THREE.TorusKnotGeometry(0.8, 0.25, 220, 32);
const mat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.2, roughness: 0.35 });
const knot = new THREE.Mesh(geo, mat);
scene.add(knot);

// In tick()
const bands = audio.getBands();
knot.rotation.y += 0.4 * dt * (1 + bands.overall);
knot.scale.setScalar(1 + bands.bass * 0.15);


Want post FX tweaks? Adjust UnrealBloomPass:

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  /* strength */ 0.55,
  /* radius   */ 0.85,
  /* threshold*/ 0.0
);

Browser & permissions

Autoplay policies: most browsers require a user gesture (click/keypress) before starting audio.

Microphone: prompts the user once; can be revoked in site settings.

Cross-origin: local files are fine via URL.createObjectURL. For remote audio, ensure CORS headers allow it.

Troubleshooting

No sound after choosing a file: click once on the page, then press Play (autoplay blocked).

Mic button errors: ensure you’re running over https:// or http://localhost and your OS mic permissions are granted to the browser.

Nothing renders: run via a local server—opening index.html from the filesystem may block ES modules.

Roadmap ideas (nice next steps)

Fullscreen toggle & settings panel (theme, bloom, fog strength).

Save/load playlists (IndexedDB).

Beat-synchronized timeline events (Meyda/ML onsets, or custom DSP).

Post stack: FXAA, film grain, subtle chromatic aberration.

Asset pipeline (Vite/ESBuild) for larger projects.

License

MIT — do whatever you want, just don’t sue me.
If you make something cool, send me a clip! 🎧🫶