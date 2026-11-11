import { readFile, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = await readFile(new URL('./달빛숲_최종본.html', import.meta.url), 'utf8');
const files = new Map([
  ['vision-module', 'vision_bundle.mjs'],
  ['vision-loader-simd', 'wasm/vision_wasm_internal.js'],
  ['vision-wasm-simd', 'wasm/vision_wasm_internal.wasm'],
  ['vision-loader-basic', 'wasm/vision_wasm_nosimd_internal.js'],
  ['vision-wasm-basic', 'wasm/vision_wasm_nosimd_internal.wasm'],
  ['vision-model', 'blaze_face_short_range.tflite']
]);
let count = 0;
for (const match of html.matchAll(/<script type="application\/octet-stream" id="([^"]+)">([^<]+)<\/script>/g)) {
  const original = await readFile(new URL('./vendor/mediapipe/' + files.get(match[1]), import.meta.url));
  const compressed = Buffer.from(match[2], 'base64');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const unpacked = Buffer.from(await new Response(stream).arrayBuffer());
  assert.deepEqual(unpacked, original, match[1]);
  assert.deepEqual(gunzipSync(compressed), unpacked);
  if (match[1].startsWith('vision-wasm-')) await WebAssembly.compile(unpacked);
  if (match[1] === 'vision-model') assert.equal(unpacked.subarray(4, 8).toString(), 'TFL3');
  if (match[1] === 'vision-module') {
    const module = await import('data:text/javascript;base64,' + unpacked.toString('base64'));
    assert.equal(typeof module.FaceDetector.createFromOptions, 'function');
  }
  count++;
}
assert.equal(count, 6);
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(app.length, 1); new vm.Script(app[0][1]);
assert.doesNotMatch(app[0][1], /vendor\/mediapipe|START\.cmd|modelAssetPath|location\.protocol === 'file:'/);
assert.doesNotMatch(html, /<(?:script|link|img|iframe)\b[^>]*(?:src|href)=["'][^"']+["']/i);
assert.match(html, /connect-src blob:/);
const size = (await stat(new URL('./달빛숲_최종본.html', import.meta.url))).size;
console.log(`PASS: single HTML, ${count} intact embedded assets, real decompression, both WASM modules compile, face model header, module import, application syntax, no external asset links. ${(size / 1024 / 1024).toFixed(1)} MB.`);
