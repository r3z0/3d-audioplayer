import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

export function initRenderer() {
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05122f, 1);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06122c, 0.06);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0.9, 6.2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.0;
  controls.maxDistance = 14.0;
  controls.enablePan = true;
  controls.target.set(0, 0.6, 0);
  controls.update();

  // Background specks
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

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x203050, 0.4));
  const dir = new THREE.DirectionalLight(0xffffff, 0.5);
  dir.position.set(5, 8, 6);
  scene.add(dir);

  // Post processing
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55, 0.85, 0.0
  );
  composer.addPass(bloomPass);

  // Film grain
  const filmPass = new FilmPass(
    0.18,
    0.06,
    648,
    false
  );
  composer.addPass(filmPass);

  // Tiny chromatic aberration
  const rgbShift = new ShaderPass(RGBShiftShader);
  rgbShift.uniforms['amount'].value = 0.0009;
  composer.addPass(rgbShift);

  // FXAA
  const fxaaPass = new ShaderPass(FXAAShader);
  function setFXAAResolution() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    fxaaPass.uniforms['resolution'].value.set(1 / (window.innerWidth * dpr), 1 / (window.innerHeight * dpr));
  }
  setFXAAResolution();
  composer.addPass(fxaaPass);

  return { renderer, scene, camera, controls, composer, specks, setFXAAResolution };
}

export function startRenderLoop({ composer, controls, specks }, update) {
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    // background motion
    specks.rotation.y += 0.0006;
    specks.rotation.x = Math.sin(t * 0.05) * 0.04;

    if (typeof update === 'function') update(dt, t);
    controls.update();
    composer.render();
    requestAnimationFrame(tick);
  }
  tick();
}

export function createResizeHandler({ camera, renderer, composer, controls, setFXAAResolution }) {
  return function () {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    setFXAAResolution();
    controls.update();
  };
}
