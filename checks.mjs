import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createForestServer } from './server.mjs';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Exercise event handling without opening a real camera or sending any video.
function scene() {
  const draws = [], revoked = [], elements = new Map();
  const context = new Proxy({}, { get: (object, key) => key in object ? object[key] : (...args) => {
    if (key === 'drawImage') draws.push(args);
    if (key.startsWith('create') && key.includes('Gradient')) return { addColorStop() {} };
    if (key === 'getImageData' || key === 'createImageData') return { data: new Uint8ClampedArray(256 * 256 * 4).fill(255) };
  } });
  function element() {
    return { textContent: '', value: '', dataset: {}, handlers: {}, attributes: {}, width: 0, height: 0,
      getContext: () => context, addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
      click() {}, pause() {}, async play() {}, readyState: 2, currentTime: 1, videoWidth: 640, videoHeight: 480 };
  }
  const sandbox = vm.createContext({
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, body: { classList: { add() {}, remove() {} } }, addEventListener() {} },
    window: { addEventListener() {} }, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    requestAnimationFrame() {}, performance: { now: () => 1000 },
    location: { protocol: 'http:' }, navigator: { mediaDevices: {} },
    console: { error() {} }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) },
    Image: class { width = 1600; height = 900; async decode() {} }
  });
  vm.runInContext(script, sandbox);
  return { sandbox, elements, draws, revoked, run: code => vm.runInContext(code, sandbox) };
}

test('detected face crop stays inside video; lost faces return to the default', () => {
  const s = scene();
  s.run(`cameraState = 'on'; detector = { detectForVideo: () => ({detections: [
    {boundingBox: {originX: 620, originY: 460, width: 180, height: 220}}
  ]}) }; updateFace(1000); drawCameraFace();`);
  const box = s.run('faceBox');
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.size <= 640 && box.y + box.size <= 480);
  assert.ok(s.draws.some(args => args[0] === s.elements.get('webcam') && args.length === 9));
  s.run(`detector = { detectForVideo: () => ({detections: []}) }; video.currentTime = 2; updateFace(2000);`);
  assert.equal(s.run('faceBox'), null);
});

test('camera refusal gives a retry message and leaves the camera off', async () => {
  const s = scene();
  s.sandbox.navigator.mediaDevices.getUserMedia = async () => { const error = new Error(); error.name = 'NotAllowedError'; throw error; };
  await s.run('startCamera()');
  assert.equal(s.run('cameraState'), 'off');
  assert.equal(s.elements.get('cameraButton').attributes['aria-pressed'], 'false');
  assert.match(s.elements.get('cameraStatus').textContent, /허용/);
});

test('canceling a pending permission request stops a stream that arrives later', async () => {
  const s = scene(); let resolveCamera, stopped = 0;
  s.sandbox.navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { resolveCamera = resolve; });
  const pending = s.run('startCamera()');
  s.run('stopCamera()');
  resolveCamera({ getTracks: () => [{ stop() { stopped++; } }] }); await pending;
  assert.equal(stopped, 1);
  assert.equal(s.run('cameraState'), 'off');
  assert.equal(s.elements.get('webcam').srcObject, null);
});

test('model loading failure releases the webcam', async () => {
  const s = scene(); let stopped = 0;
  s.sandbox.navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() { stopped++; } }] });
  s.run('loadDetector = async () => { throw new Error("model failed"); }');
  await s.run('startCamera()');
  assert.equal(stopped, 1);
  assert.equal(s.run('cameraState'), 'off');
});

test('both image choices apply; reset restores defaults; invalid images preserve the current scene', async () => {
  const s = scene();
  for (const kind of ['forest', 'light']) {
    const input = s.elements.get(kind + 'File'); input.files = [{ type: 'image/png', size: 1000, name: kind + '.png' }];
    s.sandbox.input = input; await s.run(`chooseImage('${kind}', input)`);
  }
  assert.ok(s.run('forestImage && lightImages.green && lightImages.white'));
  assert.equal(s.revoked.length, 2);
  const before = s.run('forestImage');
  s.elements.get('forestFile').files = [{ type: 'text/plain', size: 10 }];
  s.sandbox.input = s.elements.get('forestFile'); await s.run("chooseImage('forest', input)");
  assert.equal(s.run('forestImage'), before);
  s.run('defaultForest.complete = true; defaultForest.naturalWidth = 1600;');
  s.draws.length = 0;
  s.run('animate(1000)');
  assert.equal(s.draws[0][0], before);
  s.elements.get('resetImages').handlers.click();
  assert.equal(s.run('forestImage'), null); assert.equal(s.run('lightImages'), null);
  s.draws.length = 0;
  s.run('animate(1016)');
  assert.equal(s.draws[0][0], s.run('defaultForest'));
});

test('face size slider changes the displayed size and its label', () => {
  const s = scene();
  s.elements.get('faceSize').handlers.input({ target: { value: '350' } });
  assert.equal(s.run('faceScale'), 3.5);
  assert.equal(s.elements.get('faceSizeValue').textContent, '350%');
});

test('local server serves the page and its assets, restricts external connections and hides project files', async () => {
  const server = createForestServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [path, contentType] of [['/', 'text/html'], ['/autumn-forest.webp', 'image/webp'],
      ['/vendor/mediapipe/vision_bundle.mjs', 'text/javascript'],
      ['/vendor/mediapipe/wasm/vision_wasm_internal.js', 'text/javascript'],
      ['/vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'application/wasm'],
      ['/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js', 'text/javascript'],
      ['/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm', 'application/wasm'],
      ['/vendor/mediapipe/blaze_face_short_range.tflite', 'application/octet-stream']]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200); assert.ok(response.headers.get('content-type').startsWith(contentType));
      assert.ok((await response.arrayBuffer()).byteLength > 0);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    }
    for (const path of ['/AGENTS.md', '/server.mjs', '/.agents/skills/karpathy-guidelines/SKILL.md', '/vendor/mediapipe/package.json']) {
      const response = await fetch(base + path); await response.text(); assert.equal(response.status, 404);
    }
    const response = await fetch(base, { method: 'POST', body: 'test' }); await response.text(); assert.equal(response.status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
