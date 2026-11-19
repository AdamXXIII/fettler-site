// The home page hero: a furnished room as a small 3D scene whose lighting was baked in Blender.
// Nothing is lit in the browser. Every surface is drawn unlit from one of two baked textures
// ("off" = daylight, "on" = evening, bulb lit), and the switch fades between them.
// What the bake could not hold (vignette and the glow round the bulb) is added here.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';

export async function mount(hero) {
  const canvas = hero.querySelector('.hero-canvas');
  const glb = hero.dataset.glb;
  const base = glb.replace(/[^/]+$/, '');
  const info = await fetch(base + 'hero.json').then((r) => r.json());
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const tex = (f) => new Promise((ok, no) => new THREE.TextureLoader().load(base + f, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = !!(info.atlas && info.atlas.flipY); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); ok(t); }, undefined, no));
  const [gltf, off, on] = await Promise.all([new GLTFLoader().loadAsync(glb), tex(info.atlas.files.off), tex(info.atlas.files.on)]);

  const mix = { value: hero.dataset.state === 'on' ? 1 : 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { tOff: { value: off }, tOn: { value: on }, uMix: mix },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tOff; uniform sampler2D tOn; uniform float uMix; varying vec2 vUv;',
      'void main() {',
      '  gl_FragColor = mix(texture2D(tOff, vUv), texture2D(tOn, vUv), uMix);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    side: THREE.DoubleSide,
  });
  const scene = new THREE.Scene();
  gltf.scene.traverse((o) => { if (o.isMesh) o.material = mat; });
  scene.add(gltf.scene);

  // what shows where no surface was baked (a second window out of frame): a clear sky colour
  const clearOff = new THREE.Color('#D6E4F5'), clearOn = new THREE.Color('#2A3350');
  const clear = new THREE.Color();

  const cam = new THREE.PerspectiveCamera(info.camera.fov_vertical_deg, 1, 0.05, 60);
  const home = new THREE.Vector3(...info.camera.position), target = new THREE.Vector3(...info.camera.target);
  const aim = target.clone();
  const right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  right.crossVectors(new THREE.Vector3().subVectors(target, home), up).normalize();
  const reach = info.pointer || { sideways_m: 0.2, vertical_m: 0.1 };
  const bulb = new THREE.Vector3(...info.bulbCentre);

  const glow = hero.querySelector('.hero-glow');
  const vig = hero.querySelector('.hero-vig');

  const size = () => {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // the scene was composed at 16:10 and baked for aspect ratios up to about 2.1
    const baseAspect = 1.6, maxAspect = 2.0, v = THREE.MathUtils.degToRad(info.camera.fov_vertical_deg);
    let fov = info.camera.fov_vertical_deg;
    if (cam.aspect < baseAspect) {
      // taller than 16:10: widen the lens so the same view still fits
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(v / 2) * Math.min(baseAspect / cam.aspect, 1.5)));
    } else if (cam.aspect > maxAspect) {
      // wider than the bake covers: zoom in instead of showing unbaked edges, keeping the horizontal view fixed
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(v / 2) * (maxAspect / cam.aspect)));
    }
    cam.fov = fov;
    cam.updateProjectionMatrix();
    // when zoomed in, aim a little lower so the shade and the print stay in view (inside what was baked)
    const zoomed = Math.max(0, 1 - fov / info.camera.fov_vertical_deg);
    aim.copy(target); aim.y -= Math.min(0.5, 1.2 * zoomed);
  };
  size();
  new ResizeObserver(size).observe(hero);

  // the pointer moves the camera a little, so the ribs slide past each other
  const want = { x: 0, y: 0 }, at = { x: 0, y: 0 };
  hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); want.x = (e.clientX - r.left) / r.width - 0.5; want.y = (e.clientY - r.top) / r.height - 0.5; });
  hero.addEventListener('pointerleave', () => { want.x = want.y = 0; });

  let goal = mix.value, visible = true, raf = 0, t0 = performance.now();
  hero.addEventListener('lights', (e) => { goal = e.detail ? 1 : 0; kick(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(hero);

  const tmp = new THREE.Vector3();
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    mix.value += (goal - mix.value) * Math.min(1, dt * 3.2);
    at.x += (want.x - at.x) * Math.min(1, dt * 3); at.y += (want.y - at.y) * Math.min(1, dt * 3);
    const drift = Math.sin(now / 5200) * 0.012; // a slow breath, so it never looks like a photo
    cam.position.copy(home).addScaledVector(right, at.x * 2 * reach.sideways_m * 0.5 + drift).addScaledVector(up, -at.y * 2 * reach.vertical_m * 0.5);
    cam.lookAt(aim);
    clear.copy(clearOff).lerp(clearOn, mix.value);
    renderer.setClearColor(clear);
    renderer.render(scene, cam);
    // the glow round the bulb follows it on screen and grows as the light comes on
    if (glow) {
      tmp.copy(bulb).project(cam);
      glow.style.transform = `translate(${((tmp.x + 1) / 2) * 100}%, ${((1 - tmp.y) / 2) * 100}%)`;
      glow.style.opacity = String(Math.max(0, (mix.value - 0.15) / 0.85));
    }
    if (vig) vig.style.setProperty('--v', String(0.12 + 0.03 * mix.value));
    if (visible) kick();
  }
  function kick() { if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(frame); } }
  renderer.render(scene, cam);
  canvas.hidden = false;
  hero.classList.add('has-3d');
  requestAnimationFrame(() => canvas.classList.add('ready'));
  kick();
}
