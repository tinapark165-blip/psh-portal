import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./index.html', import.meta.url), 'utf8');
let html = source;
const forestPath = './autumn-forest.webp';
const forestImage = await readFile(new URL(forestPath, import.meta.url));
assert.ok(html.includes(`defaultForest.src = '${forestPath}'`));
html = html.replace(`defaultForest.src = '${forestPath}'`,
  `defaultForest.src = 'data:image/webp;base64,${forestImage.toString('base64')}'`);
const artifacts = [
  ['vision-module', 'vision_bundle.mjs'],
  ['vision-loader-simd', 'wasm/vision_wasm_internal.js'],
  ['vision-wasm-simd', 'wasm/vision_wasm_internal.wasm'],
  ['vision-loader-basic', 'wasm/vision_wasm_nosimd_internal.js'],
  ['vision-wasm-basic', 'wasm/vision_wasm_nosimd_internal.wasm'],
  ['vision-model', 'blaze_face_short_range.tflite']
];
const payloads = [];
for (const [id, path] of artifacts) {
  const original = await readFile(new URL('./vendor/mediapipe/' + path, import.meta.url));
  const compressed = gzipSync(original, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), original);
  payloads.push(`<script type="application/octet-stream" id="${id}">${compressed.toString('base64')}</script>`);
}

const loader = `    // All face detection assets are embedded. No server or download is needed.
    async function embeddedBytes(id) {
      const encoded = document.getElementById(id).textContent.trim();
      const binary = atob(encoded);
      const compressed = Uint8Array.from(binary, char => char.charCodeAt(0));
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    async function createEmbeddedDetector() {
      const urls = [];
      const resource = async (id, type) => {
        const url = URL.createObjectURL(new Blob([await embeddedBytes(id)], { type }));
        urls.push(url); return url;
      };
      try {
        const moduleUrl = await resource('vision-module', 'text/javascript');
        const { FaceDetector, FilesetResolver } = await import(moduleUrl);
        const mode = await FilesetResolver.isSimdSupported() ? 'simd' : 'basic';
        const [wasmLoaderPath, wasmBinaryPath, modelAssetBuffer] = await Promise.all([
          resource('vision-loader-' + mode, 'text/javascript'),
          resource('vision-wasm-' + mode, 'application/wasm'),
          embeddedBytes('vision-model')
        ]);
        return await FaceDetector.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
          baseOptions: { modelAssetBuffer, delegate: 'CPU' },
          runningMode: 'VIDEO', minDetectionConfidence: .6
        });
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    }
    async function loadDetector() {
      if (!detectorPromise) detectorPromise = createEmbeddedDetector().catch(error => {
        detectorPromise = null; throw error;
      });
      return detectorPromise;
    }
`;
const start = html.indexOf('    async function loadDetector() {');
const end = html.indexOf('    function stopCamera(', start);
assert.ok(start > 0 && end > start, 'Face loader section must exist');
html = html.slice(0, start) + loader + html.slice(end);

const fileGuard = /      if \(location\.protocol === 'file:'\) \{[\s\S]*?\n      \}\n/;
assert.match(html, fileGuard);
html = html.replace(fileGuard, '')
  .replace('Chrome에서 START.cmd로 다시 열어 주세요. 이 창에서는 카메라를 사용할 수 없어요.', '이 HTML 파일을 최신 Chrome에서 열어 주세요. 이 창에서는 카메라를 사용할 수 없어요.')
  .replace('얼굴 인식을 준비하지 못했어요. START.cmd로 다시 열고 웹캠을 켜 주세요.', '얼굴 인식을 준비하지 못했어요. HTML 파일을 다시 열고 웹캠을 켜 주세요.');

// The embedded runtime can only load its own in-memory resources.
const policy = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src blob:; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
html = html.replace('  <script>\n', payloads.join('\n') + '\n  <script>\n');
html = html.replace('<title>달빛 숲 · 요정의 흔적</title>', '<title>달빛 숲 · 요정의 흔적 · 최종본</title>');
html = html.replace('</head>', `<!-- Self-contained edition. MediaPipe Tasks Vision 0.10.32, Google LLC, Apache-2.0.
Source: https://registry.npmjs.org/@mediapipe/tasks-vision/0.10.32
Model: blaze_face_short_range/float16/1 from the official mediapipe-models distribution.
The original runtime copyright notices are preserved inside the embedded assets. -->\n</head>`);

let scripts = 0;
for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!match[1].includes('application/octet-stream')) { new vm.Script(match[2]); scripts++; }
}
assert.equal(scripts, 1);
assert.ok(!html.includes("import('./vendor/"));
assert.ok(!html.includes('START.cmd'));
assert.equal((html.match(/type="application\/octet-stream"/g) || []).length, artifacts.length);

const output = new URL('./달빛숲_최종본.html', import.meta.url);
await writeFile(output, html);
console.log('Created: 달빛숲_최종본.html');
console.log(`Size: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB`);
console.log('Verified: 6 embedded assets, lossless compression, application script syntax, no external file imports.');
